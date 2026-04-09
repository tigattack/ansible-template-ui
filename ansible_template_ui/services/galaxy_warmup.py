import hashlib
import threading
from typing import TYPE_CHECKING

import structlog
from requests.exceptions import ReadTimeout

import docker
from docker import errors as docker_errors
from docker import utils as docker_utils

if TYPE_CHECKING:
    from docker.models.volumes import Volume

logger = structlog.get_logger(__name__)


class GalaxyWarmup:
    def __init__(
        self,
        galaxy_collections: str,
        docker_image: str,
        container_timeout: int,
    ):
        self.galaxy_collections = galaxy_collections
        self.docker_image = docker_image
        self.container_timeout = container_timeout

        self._galaxy_cache_ready = threading.Event()
        self._galaxy_cache_volume: str | None = None
        self._galaxy_warmup_failed = False

        if not self.galaxy_collections:
            self._galaxy_cache_ready.set()

    def is_ready(self) -> bool:
        return self._galaxy_cache_ready.is_set()

    @property
    def volume_name(self) -> str | None:
        return self._galaxy_cache_volume

    def is_failed(self) -> bool:
        return self._galaxy_warmup_failed

    @staticmethod
    def _compute_volume_name(collections: str) -> str:
        return (
            "ansible-template-renderer-galaxy-cache-"
            + hashlib.sha256(collections.encode()).hexdigest()[:12]
        )

    def warmup(self, client: docker.DockerClient) -> None:
        if not self.galaxy_collections:
            return
        volume_name = self._compute_volume_name(self.galaxy_collections)
        try:
            try:
                client.volumes.get(volume_name)
            except docker_errors.NotFound:
                logger.debug("galaxy_cache_volume_not_found", volume=volume_name)
            else:
                self._galaxy_cache_volume = volume_name
                self._galaxy_cache_ready.set()
                return

            _: Volume = client.volumes.create(name=volume_name)  # pyright: ignore[reportUnknownMemberType]

            repository, tag = docker_utils.parse_repository_tag(self.docker_image)
            image = f"{repository}:{tag or 'latest'}"

            container = client.containers.run(
                image,
                command=[
                    "sh",
                    "-c",
                    "ansible-galaxy collection install $ANSIBLE_GALAXY_COLLECTIONS --force && python /clean_collections.py",  # noqa: E501
                ],
                environment={
                    "ANSIBLE_GALAXY_COLLECTIONS": self.galaxy_collections,
                    "ANSIBLE_COLLECTIONS_PATH": "/opt/ansible/collections",
                },
                volumes={
                    volume_name: {
                        "bind": "/opt/ansible/collections",
                        "mode": "rw",
                    },
                },
                user="root",
                detach=True,
            )
            try:
                result = container.wait(timeout=self.container_timeout)
                if result["StatusCode"] != 0:
                    self._galaxy_warmup_failed = True
                    logger.error(
                        "galaxy_cache_warmup_failed",
                        status=result["StatusCode"],
                    )
                else:
                    self._galaxy_cache_volume = volume_name
                    self._galaxy_cache_ready.set()
            finally:
                container.remove(force=True)
        except ReadTimeout:
            self._galaxy_warmup_failed = True
            logger.error("galaxy_warmup_timeout", timeout=self.container_timeout)  # noqa: TRY400
        except docker_errors.APIError as e:
            self._galaxy_warmup_failed = True
            logger.error("galaxy_warmup_docker_error", exc=str(e))  # noqa: TRY400
        except Exception as e:
            self._galaxy_warmup_failed = True
            logger.exception("galaxy_warmup_unexpected_error", exc=str(e))

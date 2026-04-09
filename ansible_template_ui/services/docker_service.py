import base64
import json
import threading
import time
from typing import Any, TypedDict

import structlog
from requests.exceptions import ReadTimeout

import docker
from ansible_template_ui.exceptions import (
    DockerImageError,
    GalaxyWarmupInProgressError,
    RenderExecutionError,
    RenderTimeoutError,
)
from ansible_template_ui.models import RenderRequest, RenderResponse
from ansible_template_ui.services.galaxy_warmup import GalaxyWarmup
from ansible_template_ui.services.image_cache import ImageCache
from ansible_template_ui.services.mount_resolver import MountResolver
from docker import utils as docker_utils

logger = structlog.get_logger(__name__)


def _compact_log_output(raw: str, max_bytes: int) -> tuple[Any, bool]:
    truncated = len(raw) > max_bytes
    if truncated:
        return " ".join(raw[:max_bytes].split()), truncated
    try:
        return json.loads(raw), truncated
    except ValueError, TypeError:
        return " ".join(raw.split()), truncated


class _ContainerConfig(TypedDict, total=False):
    environment: dict[str, str]
    mem_limit: str
    volumes: dict[str, dict[str, str]]


class DockerService:
    def __init__(
        self,
        *,
        docker_image: str,
        container_timeout: int,
        image_cache_ttl: int,
        filter_plugin_path: str,
        lookup_plugin_path: str,
        test_plugin_path: str,
        galaxy_collections: str,
        container_mem_limit: str = "96m",
        docker_client: docker.DockerClient | None = None,
        mount_resolver: MountResolver | None = None,
    ):
        self.docker_image = docker_image
        self.container_timeout = container_timeout
        self.filter_plugin_path = filter_plugin_path
        self.lookup_plugin_path = lookup_plugin_path
        self.test_plugin_path = test_plugin_path
        self.galaxy_collections = galaxy_collections
        self.container_mem_limit = container_mem_limit

        self._image_cache_obj = ImageCache(image_cache_ttl=image_cache_ttl)
        self._galaxy_warmup = GalaxyWarmup(
            galaxy_collections=galaxy_collections,
            docker_image=docker_image,
            container_timeout=container_timeout,
        )

        self._docker_client = docker_client
        self._docker_lock = threading.Lock()
        self._mount_resolver = mount_resolver

    @property
    def image_cache_ttl(self) -> int:
        return self._image_cache_obj.image_cache_ttl

    @image_cache_ttl.setter
    def image_cache_ttl(self, value: int) -> None:
        self._image_cache_obj.image_cache_ttl = value

    @property
    def _image_cache(self) -> dict[str, float]:
        return self._image_cache_obj._image_cache  # pyright: ignore[reportPrivateUsage]

    def is_warmup_ready(self) -> bool:
        return self._galaxy_warmup.is_ready()

    @property
    def warmup_volume_name(self) -> str | None:
        return self._galaxy_warmup.volume_name

    def is_warmup_failed(self) -> bool:
        return self._galaxy_warmup.is_failed()

    def get_docker_client(self) -> docker.DockerClient:
        if self._docker_client is None:
            with self._docker_lock:
                if self._docker_client is None:
                    self._docker_client = docker.from_env()
        return self._docker_client

    def warmup_galaxy_cache(self) -> None:
        self._galaxy_warmup.warmup(self.get_docker_client())

    def _get_mount_resolver(self) -> MountResolver:
        if self._mount_resolver is None:
            self._mount_resolver = MountResolver(self.get_docker_client())
        return self._mount_resolver

    def _build_container_config(
        self, req: RenderRequest, image: str
    ) -> _ContainerConfig:
        """Build the Docker container configuration for a render request."""
        environment: dict[str, str] = {
            "TEMPLATE": base64.b64encode(req.template.encode("utf-8")).decode(
                "utf-8",
            ),
            "VARIABLES": base64.b64encode(
                req.variables.encode("utf-8") or b"{}",
            ).decode("utf-8"),
        }
        config: _ContainerConfig = {
            "environment": environment,
            "mem_limit": self.container_mem_limit,
        }
        volumes: dict[str, dict[str, str]] = {}
        plugin_paths: dict[str, str] = {
            "/plugins/filter": self.filter_plugin_path,
            "/plugins/lookup": self.lookup_plugin_path,
            "/plugins/test": self.test_plugin_path,
        }
        for renderer_dest, web_container_path in plugin_paths.items():
            if not web_container_path:
                continue
            host_source = self._get_mount_resolver().resolve(web_container_path)
            if host_source:
                volumes[host_source] = {"bind": renderer_dest, "mode": "ro"}
            else:
                logger.debug(
                    "plugin_mount_skipped",
                    path=web_container_path,
                    reason="no bind mount found",
                )
        if self.galaxy_collections:
            if (
                self.is_warmup_ready()
                and self.warmup_volume_name
                and not self.is_warmup_failed()
            ):
                volumes[self.warmup_volume_name] = {
                    "bind": "/opt/ansible/collections",
                    "mode": "ro",
                }
                environment["ANSIBLE_COLLECTIONS_PATH"] = "/opt/ansible/collections"
            else:
                environment["ANSIBLE_GALAXY_COLLECTIONS"] = self.galaxy_collections
        if volumes:
            config["volumes"] = volumes
        return config

    def _parse_ansible_output(
        self,
        stdout: bytes,
        stderr: bytes,
        exit_status: int,
    ) -> tuple[dict[str, Any] | None, str | bytes | None]:
        """Parse Ansible container output into a play and optional error."""
        try:
            response: dict[str, Any] = json.loads(stdout)
        except ValueError:
            logger.exception("json_parse_failed")
            return None, stderr or "Unknown Error"

        play: dict[str, Any] = response["plays"][0]
        if exit_status != 0:
            return play, play["tasks"][-1]["hosts"]["localhost"]["msg"]
        return play, None

    def render(self, req: RenderRequest) -> RenderResponse:
        if (
            self.galaxy_collections
            and not self.is_warmup_ready()
            and not self.is_warmup_failed()
        ):
            raise GalaxyWarmupInProgressError(
                "Galaxy collections are being installed, please retry in a moment",
            )
        client = self.get_docker_client()
        repository, tag = docker_utils.parse_repository_tag(self.docker_image)
        if not tag:
            tag = req.tag
        self._image_cache_obj.ensure_image(client, repository, tag)
        image = f"{repository}:{tag}"
        container = None
        play: dict[str, Any] | None = None
        try:
            config = self._build_container_config(req, image)
            volumes = config.get("volumes")
            if volumes is not None:
                container = client.containers.run(
                    image,
                    detach=True,
                    environment=config.get("environment"),
                    mem_limit=config.get("mem_limit"),
                    volumes=volumes,
                )
            else:
                container = client.containers.run(
                    image,
                    detach=True,
                    environment=config.get("environment"),
                    mem_limit=config.get("mem_limit"),
                )
        except Exception as e:
            logger.exception("container_start_failed")
            raise DockerImageError(str(e)) from e
        else:
            try:
                logger.info(
                    "render_container_started",
                    image=image,
                    container_id=container.short_id,
                    has_plugins=bool(
                        volumes
                        and any(
                            v.get("bind", "").startswith("/plugins/")
                            for v in (volumes or {}).values()
                        )
                    ),
                    has_galaxy_volumes=bool(
                        volumes and self.warmup_volume_name in (volumes or {}),
                    ),
                )
                start_time = time.monotonic()
                result = container.wait(timeout=self.container_timeout)
            except ReadTimeout as e:
                raise RenderTimeoutError(
                    f"Template rendering timed out after {self.container_timeout}s",
                ) from e
            exit_status = result["StatusCode"]
            duration_ms = int((time.monotonic() - start_time) * 1000)
            stdout = container.logs(stdout=True, stderr=False)
            stdout_str = stdout.decode("utf-8", errors="replace")
            stdout_log, truncated = _compact_log_output(stdout_str, 16384)
            logger.debug(
                "render_container_finished",
                exit_code=exit_status,
                duration_ms=duration_ms,
                container_id=container.short_id,
                stdout=stdout_log,
                stdout_bytes=len(stdout),
                truncated=truncated,
            )
            stderr = container.logs(stdout=False, stderr=True)
            play, error = self._parse_ansible_output(stdout, stderr, exit_status)
            if error:
                stderr_str = stderr.decode("utf-8", errors="replace") if stderr else ""
                stderr_log, truncated_stderr = _compact_log_output(stderr_str, 4096)
                logger.warning(
                    "render_container_stderr",
                    stderr=stderr_log,
                    stderr_bytes=len(stderr) if stderr else 0,
                    truncated=truncated_stderr,
                    exit_code=exit_status,
                )
                raise RenderExecutionError(
                    error if isinstance(error, str) else error.decode("utf-8"),
                )
        finally:
            if container is not None:
                container.remove(force=True)

        if play is None:
            raise RenderExecutionError("Unexpected Ansible output structure")
        b64_content: str = play["tasks"][1]["hosts"]["localhost"]["content"]
        content = base64.b64decode(b64_content).decode("utf-8")
        return RenderResponse(content=content)

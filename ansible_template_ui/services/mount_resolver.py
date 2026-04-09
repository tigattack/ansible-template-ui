import re
import socket
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING

import structlog

import docker
from docker import errors as docker_errors

if TYPE_CHECKING:
    from docker.models.containers import Container

logger = structlog.get_logger(__name__)

# Pattern for the 64-char hex container ID in /proc/self/mountinfo bind-mount
# paths of the form: /docker/containers/<id>/hostname
_MOUNTINFO_CONTAINER_ID_RE = re.compile(r"/docker/containers/([0-9a-f]{64})/hostname")


class MountResolver:
    """Resolves container-side paths to host-side bind-mount sources.

    When docker_client is None (dev/test outside Docker), resolve() always
    returns None. Mount data is cached lazily on the first resolve() call.
    """

    def __init__(self, docker_client: docker.DockerClient | None) -> None:
        self._client = docker_client
        # None = not yet initialised; empty dict = initialised, no bind mounts
        self._bind_mounts: dict[PurePosixPath, str] | None = None

    def resolve(self, container_path: str) -> str | None:
        """Return the host-side source for container_path, or None.

        Uses longest-prefix matching. Returns None when the Docker client is
        unavailable, not running in a container, or no bind mount covers the
        given path.
        """
        mounts = self._get_mounts()
        if not mounts:
            return None

        target = PurePosixPath(container_path)

        best_dest: PurePosixPath | None = None
        for dest in mounts:
            if (target == dest or dest in target.parents) and (
                best_dest is None or len(dest.parts) > len(best_dest.parts)
            ):
                best_dest = dest

        if best_dest is None:
            return None

        host_source = mounts[best_dest]
        relative = target.relative_to(best_dest)
        if str(relative) == ".":
            return host_source
        return str(PurePosixPath(host_source) / relative)

    def _get_mounts(self) -> dict[PurePosixPath, str]:
        if self._bind_mounts is None:
            self._bind_mounts = self._load_mounts()
        return self._bind_mounts

    def _load_mounts(self) -> dict[PurePosixPath, str]:
        if self._client is None:
            logger.debug("mount_resolver_no_client")
            return {}

        container_id = self._detect_container_id()
        if container_id is None:
            logger.debug("mount_resolver_not_in_container")
            return {}

        return self._fetch_bind_mounts(container_id)

    def _detect_container_id(self) -> str | None:
        """Return the current container's full ID, or None.

        Detection order:
        1. Hostname — Docker sets it to the short (12-char) hex container ID
           by default. Attempt containers.get(hostname) to confirm.
        2. /proc/self/mountinfo — parse for the 64-char ID in the container's
           hostname bind-mount path.
        """
        if self._client is None:
            return None

        hostname = socket.gethostname()
        if len(hostname) >= 12 and all(c in "0123456789abcdef" for c in hostname):  # noqa: PLR2004
            try:
                container: Container = self._client.containers.get(hostname)
                if container.id is None:
                    logger.warning(
                        "mount_resolver_container_id_missing", hostname=hostname
                    )
                    return None
                cid: str = container.id
                logger.debug(
                    "mount_resolver_detected_via_hostname",
                    container_id=cid[:12],
                )
                return cid  # noqa: TRY300
            except docker_errors.NotFound:
                logger.debug("mount_resolver_hostname_not_found", hostname=hostname)
            except Exception:
                logger.warning(
                    "mount_resolver_hostname_lookup_failed", hostname=hostname
                )

        mountinfo = Path("/proc/self/mountinfo")
        if mountinfo.exists():
            try:
                text = mountinfo.read_text(encoding="utf-8", errors="replace")
                for line in text.splitlines():
                    match = _MOUNTINFO_CONTAINER_ID_RE.search(line)
                    if match:
                        cid = match.group(1)
                        logger.debug(
                            "mount_resolver_detected_via_mountinfo",
                            container_id=cid[:12],
                        )
                        return cid
            except Exception:
                logger.warning("mount_resolver_mountinfo_read_failed")

        return None

    def _fetch_bind_mounts(self, container_id: str) -> dict[PurePosixPath, str]:
        if self._client is None:
            return {}

        try:
            container: Container = self._client.containers.get(container_id)
        except docker_errors.NotFound:
            logger.warning(
                "mount_resolver_container_not_found",
                container_id=container_id[:12],
            )
            return {}
        except Exception:
            logger.warning(
                "mount_resolver_container_fetch_failed",
                container_id=container_id[:12],
            )
            return {}

        raw_mounts: list[dict[str, str]] = container.attrs.get("Mounts", [])  # type: ignore[assignment]
        bind_mounts: dict[PurePosixPath, str] = {}

        for mount in raw_mounts:
            if mount.get("Type") != "bind":
                continue
            destination = mount.get("Destination", "")
            source = mount.get("Source", "")
            if not destination or not source:
                continue
            bind_mounts[PurePosixPath(destination)] = source

        logger.debug(
            "mount_resolver_mounts_loaded",
            container_id=container_id[:12],
            bind_mount_count=len(bind_mounts),
        )
        return bind_mounts


class PassthroughMountResolver(MountResolver):
    """Mount resolver that returns paths as-is, without Docker introspection.

    Used when running outside Docker (tests, bare-metal dev) where the plugin
    paths are already host-side paths and can be mounted directly.
    """

    def __init__(self) -> None:
        super().__init__(docker_client=None)

    def resolve(self, container_path: str) -> str | None:
        return container_path

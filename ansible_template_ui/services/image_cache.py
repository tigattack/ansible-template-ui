import threading
import time

import docker
from docker import errors as docker_errors


class ImageCache:
    def __init__(self, image_cache_ttl: int):
        self.image_cache_ttl = image_cache_ttl
        self._image_cache: dict[str, float] = {}
        self._image_cache_lock = threading.Lock()

    def ensure_image(
        self,
        client: docker.DockerClient,
        repository: str,
        tag: str,
    ) -> None:
        image = f"{repository}:{tag}"
        now = time.monotonic()
        with self._image_cache_lock:
            last_pulled = self._image_cache.get(image)
            ttl_expired = (last_pulled is None) or (
                now - last_pulled >= self.image_cache_ttl
            )
            if ttl_expired:
                try:
                    client.images.pull(repository, tag=tag)
                except docker_errors.ImageNotFound:
                    client.images.get(image)
                self._image_cache[image] = time.monotonic()
            else:
                try:
                    client.images.get(image)
                except docker_errors.ImageNotFound:
                    client.images.pull(repository, tag=tag)
                    self._image_cache[image] = time.monotonic()

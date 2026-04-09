from functools import lru_cache

from ansible_template_ui.config import get_settings
from ansible_template_ui.services.docker_service import DockerService


@lru_cache
def get_docker_service() -> DockerService:
    settings = get_settings()
    return DockerService(
        docker_image=settings.DOCKER_IMAGE,
        container_timeout=settings.CONTAINER_TIMEOUT,
        image_cache_ttl=settings.IMAGE_CACHE_TTL,
        filter_plugin_path=settings.FILTER_PLUGIN_PATH,
        lookup_plugin_path=settings.LOOKUP_PLUGIN_PATH,
        test_plugin_path=settings.TEST_PLUGIN_PATH,
        galaxy_collections=settings.ANSIBLE_GALAXY_COLLECTIONS,
        container_mem_limit=settings.CONTAINER_MEM_LIMIT,
    )

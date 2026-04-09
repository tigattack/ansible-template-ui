from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="")
    DOCKER_IMAGE: str = "ghcr.io/tigattack/ansible-template-renderer:latest"
    HOST: str = "127.0.0.1"
    PORT: int = 8080
    DEBUG: bool = False
    LOG_FORMAT: Literal["pretty", "json"] | None = None
    CONTAINER_TIMEOUT: int = 180
    IMAGE_CACHE_TTL: int = 300
    CONTAINER_MEM_LIMIT: str = "96m"
    FILTER_PLUGIN_PATH: str = "/plugins/filter"
    LOOKUP_PLUGIN_PATH: str = "/plugins/lookup"
    TEST_PLUGIN_PATH: str = "/plugins/test"
    ANSIBLE_GALAXY_COLLECTIONS: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

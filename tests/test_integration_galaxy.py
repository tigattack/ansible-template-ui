# pyright: basic

import os
import time

import pytest

import docker
from ansible_template_ui.models import RenderRequest
from ansible_template_ui.services.docker_service import DockerService
from docker import errors as docker_errors


@pytest.fixture
def docker_service():
    image = os.environ.get(
        "INTEGRATION_RENDERER_IMAGE",
        "ghcr.io/tigattack/ansible-template-renderer:latest",
    )
    try:
        client = docker.from_env()
    except Exception:
        pytest.skip("Docker not available")
    try:
        client.images.get(image)
    except docker_errors.ImageNotFound:
        pytest.skip(
            f"Renderer image {image} not found — build it first with: "
            f"docker build -t {image} docker/renderer/"
        )
    service = DockerService(
        docker_image=image,
        container_timeout=300,
        image_cache_ttl=300,
        filter_plugin_path="",
        lookup_plugin_path="",
        test_plugin_path="",
        galaxy_collections="sensu.sensu_go",
        container_mem_limit="256m",
        docker_client=client,
    )
    service._image_cache_obj._image_cache[image] = time.monotonic()
    service.warmup_galaxy_cache()
    return service


@pytest.mark.integration
def test_render_with_galaxy_collection_plugin(docker_service):
    template = (
        '{{ "apt" | sensu.sensu_go.package_name("sensu-go-backend", "6.7.0", "1") }}'
    )
    result = docker_service.render(
        RenderRequest(
            template=template,
            variables="",
        )
    )
    assert result.content == "sensu-go-backend=6.7.0-1"

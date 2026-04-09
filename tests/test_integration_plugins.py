# pyright: basic

import os
import pathlib
import time

import pytest

import docker
from ansible_template_ui.models import RenderRequest
from ansible_template_ui.services.docker_service import DockerService
from ansible_template_ui.services.mount_resolver import PassthroughMountResolver
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
    plugin_dir = pathlib.Path(__file__).parent / "plugins"
    service = DockerService(
        docker_image=image,
        container_timeout=300,
        image_cache_ttl=300,
        filter_plugin_path=str(plugin_dir / "filter"),
        lookup_plugin_path=str(plugin_dir / "lookup"),
        test_plugin_path=str(plugin_dir / "test"),
        galaxy_collections="",
        container_mem_limit="96m",
        docker_client=client,
        mount_resolver=PassthroughMountResolver(),
    )
    service._image_cache_obj._image_cache[image] = time.monotonic()
    return service


@pytest.mark.integration
def test_render_with_custom_filter_plugin(docker_service):
    result = docker_service.render(
        RenderRequest(
            template='{{ "hello" | custom_reverse }}',
            variables="",
        )
    )
    assert result.content == "olleh"


@pytest.mark.integration
def test_render_with_custom_lookup_plugin(docker_service):
    result = docker_service.render(
        RenderRequest(
            template='{{ lookup("custom_lookup", "anything") }}',
            variables="",
        )
    )
    assert result.content == "custom_lookup_works"


@pytest.mark.integration
def test_render_with_custom_test_plugin(docker_service):
    result = docker_service.render(
        RenderRequest(
            template='{% if "hello" is custom_truthy %}pass{% else %}fail{% endif %}',
            variables="",
        )
    )
    assert result.content == "pass"

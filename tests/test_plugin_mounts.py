# pyright: basic

from ansible_template_ui.models import RenderRequest
from ansible_template_ui.services.docker_service import DockerService
from ansible_template_ui.services.mount_resolver import (
    MountResolver,
    PassthroughMountResolver,
)
from docker import errors as docker_errors


def _make_service(
    mock_client,
    filter_plugin_path="",
    lookup_plugin_path="",
    test_plugin_path="",
    galaxy_collections="",
):
    has_plugins = any([filter_plugin_path, lookup_plugin_path, test_plugin_path])
    resolver = PassthroughMountResolver() if has_plugins else MountResolver(None)
    return DockerService(
        docker_image="ghcr.io/tigattack/ansible-template-renderer:latest",
        container_timeout=180,
        image_cache_ttl=300,
        filter_plugin_path=filter_plugin_path,
        lookup_plugin_path=lookup_plugin_path,
        test_plugin_path=test_plugin_path,
        galaxy_collections=galaxy_collections,
        container_mem_limit="96m",
        docker_client=mock_client,
        mount_resolver=resolver,
    )


_REQ = RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}', tag="latest")


def test_render_with_filter_plugin_path(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(mock_client, filter_plugin_path="/host/filters")
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["volumes"]["/host/filters"] == {
        "bind": "/plugins/filter",
        "mode": "ro",
    }


def test_render_with_lookup_plugin_path(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(mock_client, lookup_plugin_path="/host/lookups")
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["volumes"]["/host/lookups"] == {
        "bind": "/plugins/lookup",
        "mode": "ro",
    }


def test_render_with_test_plugin_path(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(mock_client, test_plugin_path="/host/tests")
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["volumes"]["/host/tests"] == {
        "bind": "/plugins/test",
        "mode": "ro",
    }


def test_render_with_multiple_plugin_paths(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(
        mock_client,
        filter_plugin_path="/host/filters",
        test_plugin_path="/host/tests",
    )
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert "/host/filters" in call_kwargs["volumes"]
    assert "/host/tests" in call_kwargs["volumes"]


def test_render_without_plugin_paths(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert "volumes" not in call_kwargs or not call_kwargs["volumes"]


def test_render_with_galaxy_collections(mock_docker):
    _, mock_client, mock_container = mock_docker
    service = _make_service(mock_client, galaxy_collections="community.general")
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.side_effect = Exception("forced failure")
    service.warmup_galaxy_cache()
    mock_client.volumes.get.side_effect = None
    mock_container.wait.side_effect = None

    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert (
        call_kwargs["environment"]["ANSIBLE_GALAXY_COLLECTIONS"] == "community.general"
    )


def test_render_without_galaxy_collections(mock_docker):
    _, mock_client, _ = mock_docker
    service = _make_service(mock_client, galaxy_collections="")
    service.render(_REQ)

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert "ANSIBLE_GALAXY_COLLECTIONS" not in call_kwargs["environment"]

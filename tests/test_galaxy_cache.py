# pyright: basic

import hashlib
from unittest.mock import MagicMock

import pytest
from requests.exceptions import ReadTimeout

from ansible_template_ui.exceptions import GalaxyWarmupInProgressError
from ansible_template_ui.models import RenderRequest
from ansible_template_ui.services import galaxy_warmup as galaxy_warmup_module
from ansible_template_ui.services.docker_service import DockerService
from ansible_template_ui.services.mount_resolver import (
    MountResolver,
    PassthroughMountResolver,
)
from docker import errors as docker_errors


def _make_service(mock_client, galaxy_collections="community.general"):
    return DockerService(
        docker_image="ghcr.io/tigattack/ansible-template-renderer:latest",
        container_timeout=180,
        image_cache_ttl=300,
        filter_plugin_path="",
        lookup_plugin_path="",
        test_plugin_path="",
        galaxy_collections=galaxy_collections,
        container_mem_limit="96m",
        docker_client=mock_client,
        mount_resolver=MountResolver(None),
    )


def test_warmup_starts_when_galaxy_collections_set(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")

    service.warmup_galaxy_cache()

    assert mock_client.containers.run.called
    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert (
        call_kwargs["environment"]["ANSIBLE_GALAXY_COLLECTIONS"] == "community.general"
    )
    assert call_kwargs["volumes"]
    assert call_kwargs["volumes"][service.warmup_volume_name] == {
        "bind": "/opt/ansible/collections",
        "mode": "rw",
    }
    mock_client.volumes.get.side_effect = None


def test_warmup_does_not_start_when_galaxy_collections_empty(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client, galaxy_collections="")

    service.warmup_galaxy_cache()

    assert mock_client.containers.run.call_count == 0
    assert mock_client.volumes.create.call_count == 0


def test_warmup_creates_named_volume(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")

    service.warmup_galaxy_cache()

    expected_volume_name = (
        "ansible-template-renderer-galaxy-cache-"
        + hashlib.sha256(b"community.general").hexdigest()[:12]
    )
    mock_client.volumes.create.assert_called_with(name=expected_volume_name)
    mock_client.volumes.get.side_effect = None


def test_warmup_skips_when_volume_exists(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.return_value = MagicMock()

    service.warmup_galaxy_cache()

    assert mock_client.containers.run.call_count == 0
    assert service.is_warmup_ready()
    mock_client.volumes.get.return_value = None


def test_warmup_runs_when_volume_missing(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 0}

    service.warmup_galaxy_cache()

    assert mock_client.containers.run.called
    mock_client.volumes.get.side_effect = None


def test_warmup_logs_debug_when_volume_missing(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 0}

    with pytest.MonkeyPatch.context() as monkeypatch:
        debug_mock = MagicMock()
        monkeypatch.setattr(galaxy_warmup_module.logger, "debug", debug_mock)

        service.warmup_galaxy_cache()

    expected_volume_name = (
        "ansible-template-renderer-galaxy-cache-"
        + hashlib.sha256(b"community.general").hexdigest()[:12]
    )
    debug_mock.assert_called_once_with(
        "galaxy_cache_volume_not_found",
        volume=expected_volume_name,
    )
    mock_client.volumes.get.side_effect = None


def test_warmup_container_removed_after_completion(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 0}

    service.warmup_galaxy_cache()

    mock_container.remove.assert_called_with(force=True)
    mock_client.volumes.get.side_effect = None


def test_warmup_failure_sets_failed_state(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 1}

    service.warmup_galaxy_cache()

    assert service.is_warmup_failed() is True
    assert service.is_warmup_ready() is False
    mock_client.volumes.get.side_effect = None


def test_warmup_success_sets_ready_event(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 0}

    service.warmup_galaxy_cache()

    assert service.is_warmup_ready() is True
    assert service.is_warmup_failed() is False
    mock_client.volumes.get.side_effect = None


def test_render_returns_503_during_warmup(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)

    with pytest.raises(GalaxyWarmupInProgressError) as exc_info:
        service.render(
            RenderRequest(template="{{ test }}", variables='{"test": "hello"}'),
        )

    assert "Galaxy collections are being installed" in str(exc_info.value)


def test_render_succeeds_after_warmup_complete(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.return_value = MagicMock()
    service.warmup_galaxy_cache()
    mock_client.volumes.get.return_value = None

    result = service.render(
        RenderRequest(template="{{ test }}", variables='{"test": "hello"}'),
    )

    assert result.model_dump() == {"content": "hello"}


def test_render_mounts_cache_volume_ro(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    vol_name = (
        "ansible-template-renderer-galaxy-cache-"
        + hashlib.sha256(b"community.general").hexdigest()[:12]
    )
    mock_client.volumes.get.return_value = MagicMock()
    service.warmup_galaxy_cache()
    mock_client.volumes.get.return_value = None

    service.render(RenderRequest(template="{{ test }}", variables='{"test": "hello"}'))

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["volumes"][vol_name] == {
        "bind": "/opt/ansible/collections",
        "mode": "ro",
    }


def test_render_strips_galaxy_env_when_cached(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.return_value = MagicMock()
    service.warmup_galaxy_cache()
    mock_client.volumes.get.return_value = None

    service.render(RenderRequest(template="{{ test }}", variables='{"test": "hello"}'))

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert "ANSIBLE_GALAXY_COLLECTIONS" not in call_kwargs["environment"]


def test_render_fallback_on_warmup_failure(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.side_effect = Exception("forced failure")
    service.warmup_galaxy_cache()
    mock_client.volumes.get.side_effect = None
    mock_container.wait.side_effect = None

    service.render(RenderRequest(template="{{ test }}", variables='{"test": "hello"}'))

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert (
        call_kwargs["environment"]["ANSIBLE_GALAXY_COLLECTIONS"] == "community.general"
    )
    assert "volumes" not in call_kwargs or not any(
        "galaxy-cache" in v for v in call_kwargs.get("volumes", {})
    )


def test_render_no_503_when_collections_empty(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client, galaxy_collections="")

    result = service.render(
        RenderRequest(template="{{ test }}", variables='{"test": "hello"}'),
    )

    assert result.model_dump() == {"content": "hello"}


def test_warmup_runs_clean_collections_after_install(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.return_value = {"StatusCode": 0}

    service.warmup_galaxy_cache()

    call_args = mock_client.containers.run.call_args
    command = call_args.kwargs.get("command") or call_args[1].get("command")
    shell_cmd = command[-1]
    assert "clean_collections.py" in shell_cmd
    assert "ansible-galaxy collection install" in shell_cmd
    mock_client.volumes.get.side_effect = None


def test_render_cache_volume_coexists_with_plugin_mount(mock_docker):
    service, mock_client, _ = mock_docker
    service = _make_service(mock_client)
    service.filter_plugin_path = "/host/filters"
    service._mount_resolver = PassthroughMountResolver()
    vol_name = (
        "ansible-template-renderer-galaxy-cache-"
        + hashlib.sha256(b"community.general").hexdigest()[:12]
    )
    mock_client.volumes.get.return_value = MagicMock()
    service.warmup_galaxy_cache()
    mock_client.volumes.get.return_value = None

    service.render(RenderRequest(template="{{ test }}", variables='{"test": "hello"}'))

    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["volumes"]["/host/filters"] == {
        "bind": "/plugins/filter",
        "mode": "ro",
    }
    assert call_kwargs["volumes"][vol_name] == {
        "bind": "/opt/ansible/collections",
        "mode": "ro",
    }


def test_warmup_read_timeout_sets_failed_and_logs(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.side_effect = ReadTimeout()

    with pytest.MonkeyPatch.context() as monkeypatch:
        error_mock = MagicMock()
        monkeypatch.setattr(galaxy_warmup_module.logger, "error", error_mock)

        service.warmup_galaxy_cache()

    assert service.is_warmup_failed() is True
    assert service.is_warmup_ready() is False
    error_mock.assert_called_once_with("galaxy_warmup_timeout", timeout=180)
    mock_client.volumes.get.side_effect = None


def test_warmup_docker_api_error_sets_failed_and_logs(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.side_effect = docker_errors.APIError("docker api error")

    with pytest.MonkeyPatch.context() as monkeypatch:
        error_mock = MagicMock()
        monkeypatch.setattr(galaxy_warmup_module.logger, "error", error_mock)

        service.warmup_galaxy_cache()

    assert service.is_warmup_failed() is True
    assert service.is_warmup_ready() is False
    error_mock.assert_called_once_with(
        "galaxy_warmup_docker_error",
        exc=str(docker_errors.APIError("docker api error")),
    )
    mock_client.volumes.get.side_effect = None


def test_warmup_unexpected_exception_sets_failed_and_logs(mock_docker):
    service, mock_client, mock_container = mock_docker
    service = _make_service(mock_client)
    mock_client.volumes.get.side_effect = docker_errors.NotFound("not found")
    mock_container.wait.side_effect = RuntimeError("something unexpected")

    with pytest.MonkeyPatch.context() as monkeypatch:
        exception_mock = MagicMock()
        monkeypatch.setattr(galaxy_warmup_module.logger, "exception", exception_mock)

        service.warmup_galaxy_cache()

    assert service.is_warmup_failed() is True
    assert service.is_warmup_ready() is False
    exception_mock.assert_called_once_with(
        "galaxy_warmup_unexpected_error",
        exc="something unexpected",
    )
    mock_client.volumes.get.side_effect = None

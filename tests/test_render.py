# pyright: basic

import base64
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError
from structlog.testing import capture_logs

from ansible_template_ui.exceptions import (
    DockerImageError,
    RenderExecutionError,
    RenderTimeoutError,
)
from ansible_template_ui.models import RenderRequest
from ansible_template_ui.services.docker_service import DockerService
from docker import errors as docker_errors
from tests.conftest import make_success_output


def make_error_output(msg="some error"):
    response = {
        "plays": [
            {
                "tasks": [
                    {"hosts": {"localhost": {"msg": msg}}},
                ],
            },
        ],
    }
    return json.dumps(response).encode()


def test_render_success(mock_docker):
    service, _mock_client, _ = mock_docker
    result = service.render(
        RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"),
    )
    assert result.model_dump() == {"content": "bar"}


def test_render_empty_variables(mock_docker):
    service, mock_client, _ = mock_docker
    service.render(RenderRequest(template="{{ foo }}", variables="", tag="latest"))
    call_kwargs = mock_client.containers.run.call_args
    env = call_kwargs.kwargs["environment"]
    expected_vars = base64.b64encode(b"{}").decode()
    assert env["VARIABLES"] == expected_vars


def test_render_request_accepts_yaml_variables():
    request = RenderRequest(template="{{ foo }}", variables="foo: bar")
    assert request.variables == "foo: bar"


def test_render_request_empty_variables_normalized():
    request = RenderRequest(template="{{ foo }}", variables="")
    assert request.variables == "{}"


def test_render_request_rejects_invalid_yaml():
    with pytest.raises(ValidationError):
        RenderRequest(template="{{ foo }}", variables="foo: [broken")


def test_render_request_rejects_non_mapping_yaml():
    with pytest.raises(ValidationError):
        RenderRequest(template="{{ foo }}", variables="- item1\n- item2")


def test_render_request_comment_only_yaml_normalized():
    request = RenderRequest(template="{{ foo }}", variables="# just a comment")
    assert request.variables == "{}"


def test_render_yaml_variables_reach_container(mock_docker):
    service, mock_client, _ = mock_docker
    service.render(RenderRequest(template="{{ foo }}", variables="foo: bar"))
    env = mock_client.containers.run.call_args.kwargs["environment"]
    expected_vars = base64.b64encode(b"foo: bar").decode()
    assert env["VARIABLES"] == expected_vars


def test_render_error_container_fail(mock_docker):
    service, mock_client, _ = mock_docker
    mock_client.containers.run.side_effect = Exception("container boom")
    with pytest.raises(DockerImageError) as exc_info:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    assert "container boom" in str(exc_info.value)


def test_render_error_nonzero_exit(mock_docker):
    service, _, mock_container = mock_docker
    mock_container.wait.return_value = {"StatusCode": 1}
    mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
        make_error_output("template failed") if stdout else b""
    )
    with pytest.raises(RenderExecutionError) as exc_info:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    assert "template failed" in str(exc_info.value)


def test_render_logs_container_started(mock_docker):
    service, _mock_client, _ = mock_docker
    with capture_logs() as log_entries:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    started = next(e for e in log_entries if e["event"] == "render_container_started")
    assert "image" in started
    assert "container_id" in started


def test_render_logs_container_finished(mock_docker):
    service, _mock_client, _ = mock_docker
    with capture_logs() as log_entries:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    finished = next(e for e in log_entries if e["event"] == "render_container_finished")
    assert finished["exit_code"] == 0
    assert isinstance(finished["duration_ms"], int)


def test_render_logs_stdout_at_debug(mock_docker):
    service, _mock_client, _ = mock_docker
    with capture_logs() as log_entries:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    finished = next(e for e in log_entries if e["event"] == "render_container_finished")
    assert finished["log_level"] == "debug"
    assert "stdout_bytes" in finished
    assert "stdout" in finished


def test_render_logs_stderr_on_failure(mock_docker):
    service, _, mock_container = mock_docker
    mock_container.wait.return_value = {"StatusCode": 1}
    mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
        make_error_output("template failed") if stdout else b"some stderr"
    )
    with capture_logs() as log_entries, pytest.raises(RenderExecutionError):
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    stderr_entry = next(
        e for e in log_entries if e["event"] == "render_container_stderr"
    )
    assert stderr_entry["log_level"] == "warning"


def test_render_docker_image_tag(mock_docker):
    service, mock_client, _ = mock_docker
    service.render(
        RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}', tag="stable"),
    )
    call_args = mock_client.containers.run.call_args
    image_used = call_args.args[0]
    assert image_used == "ghcr.io/tigattack/ansible-template-renderer:latest"


def test_render_container_cleanup(mock_docker):
    service, mock_client, mock_container = mock_docker

    mock_client.containers.run.side_effect = Exception("create failed")
    with pytest.raises(DockerImageError):
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    mock_container.remove.assert_not_called()

    mock_client.containers.run.side_effect = None
    mock_client.containers.run.return_value = mock_container
    service.render(
        RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"),
    )
    mock_container.remove.assert_called_once_with(force=True)


def test_render_wait_returns_dict(mock_docker):
    service, _, mock_container = mock_docker
    service.render(
        RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"),
    )
    assert mock_container.wait.called
    wait_result = mock_container.wait.return_value
    assert isinstance(wait_result, dict)
    assert "StatusCode" in wait_result


def test_docker_client_singleton():
    with patch("docker.from_env") as mock_from_env:
        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_client.images.pull.return_value = None
        mock_client.containers.run.return_value = mock_container
        mock_container.wait.return_value = {"StatusCode": 0}
        mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
            make_success_output() if stdout else b""
        )
        mock_from_env.return_value = mock_client

        service = DockerService(
            docker_image="ghcr.io/tigattack/ansible-template-renderer:latest",
            container_timeout=180,
            image_cache_ttl=300,
            filter_plugin_path="",
            lookup_plugin_path="",
            test_plugin_path="",
            galaxy_collections="",
            container_mem_limit="96m",
            docker_client=None,
        )
        for _ in range(3):
            service.render(
                RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}')
            )
        assert mock_from_env.call_count == 1


def test_render_timeout_returns_400(mock_docker):
    from requests.exceptions import ReadTimeout  # noqa: PLC0415

    service, _, mock_container = mock_docker
    mock_container.wait.side_effect = ReadTimeout()
    with pytest.raises(RenderTimeoutError) as exc_info:
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    assert "timed out" in str(exc_info.value)


def test_render_timeout_still_removes_container(mock_docker):
    from requests.exceptions import ReadTimeout  # noqa: PLC0415

    service, _, mock_container = mock_docker
    mock_container.wait.side_effect = ReadTimeout()
    with pytest.raises(RenderTimeoutError):
        service.render(
            RenderRequest(
                template="{{ foo }}", variables='{"foo": "bar"}', tag="latest"
            ),
        )
    mock_container.remove.assert_called_once_with(force=True)


def test_image_cache_hit_skips_pull(mock_docker):
    service, mock_client, _ = mock_docker
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    assert mock_client.images.pull.call_count == 1
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    assert mock_client.images.pull.call_count == 1


def test_image_cache_ttl_expiry_repulls(mock_docker):
    service, mock_client, _ = mock_docker
    image = "ghcr.io/tigattack/ansible-template-renderer:latest"
    service._image_cache[image] = time.monotonic() - 9999
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    assert mock_client.images.pull.call_count == 1


def test_image_cache_miss_pulls_when_not_found(mock_docker):
    service, mock_client, _ = mock_docker
    image = "ghcr.io/tigattack/ansible-template-renderer:latest"
    service._image_cache[image] = time.monotonic()
    mock_client.images.get.side_effect = docker_errors.ImageNotFound("not found")
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    assert mock_client.images.pull.call_count == 1
    mock_client.images.get.side_effect = None


def test_image_cache_ttl_zero_always_pulls(mock_docker):
    service, mock_client, _ = mock_docker
    service.image_cache_ttl = 0
    image = "ghcr.io/tigattack/ansible-template-renderer:latest"
    service._image_cache[image] = time.monotonic()
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    assert mock_client.images.pull.call_count == 2


def test_container_mem_limit_custom_value():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.images.pull.return_value = None
    mock_client.containers.run.return_value = mock_container
    mock_container.wait.return_value = {"StatusCode": 0}
    mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
        make_success_output() if stdout else b""
    )
    service = DockerService(
        docker_image="ghcr.io/tigattack/ansible-template-renderer:latest",
        container_timeout=180,
        image_cache_ttl=300,
        filter_plugin_path="",
        lookup_plugin_path="",
        test_plugin_path="",
        galaxy_collections="",
        container_mem_limit="128m",
        docker_client=mock_client,
    )
    service.render(RenderRequest(template="{{ foo }}", variables='{"foo": "bar"}'))
    call_kwargs = mock_client.containers.run.call_args.kwargs
    assert call_kwargs["mem_limit"] == "128m"

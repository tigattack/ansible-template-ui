# pyright: basic

import base64
import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from requests.exceptions import ReadTimeout
from structlog.testing import capture_logs

from ansible_template_ui import app
from ansible_template_ui.dependencies import get_docker_service
from ansible_template_ui.services.docker_service import DockerService
from tests.conftest import make_success_output


def _make_mock_service():
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
        container_mem_limit="96m",
        docker_client=mock_client,
    )
    return service, mock_client, mock_container


@pytest.fixture
def route_client():
    service, mock_client, mock_container = _make_mock_service()
    app.dependency_overrides[get_docker_service] = lambda: service
    try:
        yield TestClient(app), service, mock_client, mock_container
    finally:
        app.dependency_overrides.clear()


def test_route_render_success(route_client):
    client, _service, _mock_client, _mock_container = route_client
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": '{"foo": "bar"}'},
    )
    assert resp.status_code == 200
    assert resp.json() == {"content": "bar"}


def test_route_render_container_exception(route_client):
    client, _service, mock_client, _mock_container = route_client
    mock_client.containers.run.side_effect = Exception("docker daemon not running")
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": '{"foo": "bar"}'},
    )
    assert resp.status_code == 400
    data = resp.json()
    assert "error" in data
    assert "docker daemon not running" in data["error"]


def test_route_render_nonzero_exit(route_client):
    client, _service, _mock_client, mock_container = route_client
    error_output = json.dumps(
        {
            "plays": [
                {"tasks": [{"hosts": {"localhost": {"msg": "template syntax error"}}}]},
            ],
        },
    ).encode()
    mock_container.wait.return_value = {"StatusCode": 1}
    mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
        error_output if stdout else b""
    )
    resp = client.post(
        "/render",
        json={"template": "{{ foo | bad_filter }}", "variables": '{"foo": "bar"}'},
    )
    assert resp.status_code == 500
    data = resp.json()
    assert "error" in data
    assert "template syntax error" in data["error"]


def test_route_render_empty_variables(route_client):
    client, _service, mock_client, _mock_container = route_client
    resp = client.post("/render", json={"template": "{{ foo }}", "variables": ""})
    assert resp.status_code == 200
    call_kwargs = mock_client.containers.run.call_args
    assert call_kwargs is not None
    env = call_kwargs.kwargs["environment"]
    assert env["VARIABLES"] == base64.b64encode(b"{}").decode()


def test_route_render_yaml_variables(route_client):
    client, _service, mock_client, _mock_container = route_client
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": "foo: bar"},
    )
    assert resp.status_code == 200
    call_kwargs = mock_client.containers.run.call_args
    assert call_kwargs is not None
    env = call_kwargs.kwargs["environment"]
    assert env["VARIABLES"] == base64.b64encode(b"foo: bar").decode()


def test_route_render_multiline_yaml_variables(route_client):
    client, _service, mock_client, _mock_container = route_client
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": "foo: bar\nbaz: qux"},
    )
    assert resp.status_code == 200
    call_kwargs = mock_client.containers.run.call_args
    assert call_kwargs is not None
    env = call_kwargs.kwargs["environment"]
    assert env["VARIABLES"] == base64.b64encode(b"foo: bar\nbaz: qux").decode()


def test_route_render_invalid_yaml_returns_422(route_client):
    client, *_ = route_client
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": "foo: [broken"},
    )
    assert resp.status_code == 422
    data = resp.json()
    assert "error" in data
    assert "detail" not in data


def test_route_render_warmup_returns_503():
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
        galaxy_collections="community.general",
        container_mem_limit="96m",
        docker_client=mock_client,
    )
    assert not service.is_warmup_ready()
    app.dependency_overrides[get_docker_service] = lambda: service
    try:
        with TestClient(app) as tc:
            resp = tc.post(
                "/render",
                json={"template": "{{ foo }}", "variables": '{"foo": "bar"}'},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 503
    data = resp.json()
    assert "error" in data


def test_route_render_success_response_shape(route_client):
    client, *_ = route_client
    resp = client.post("/render", json={"template": "Hello", "variables": "{}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    assert "error" not in data


def test_render_timeout_returns_408(route_client):
    client, _service, _mock_client, mock_container = route_client
    mock_container.wait.side_effect = ReadTimeout()
    resp = client.post(
        "/render",
        json={"template": "{{ foo }}", "variables": '{"foo": "bar"}'},
    )
    assert resp.status_code == 408
    data = resp.json()
    assert "error" in data


def test_route_validation_error_logs_event(route_client):
    client, *_ = route_client
    with capture_logs() as log_entries:
        resp = client.post(
            "/render",
            json={"template": "{{ foo }}", "variables": "foo: [broken"},
        )
    assert resp.status_code == 422
    assert any(
        entry.get("event") == "request_validation_failed"
        and entry.get("path") == "/render"
        and entry.get("error_count", 0) >= 1
        for entry in log_entries
    )

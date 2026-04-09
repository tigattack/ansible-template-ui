# pyright: basic

import base64
import json
from unittest.mock import MagicMock

import pytest
import yaml

from ansible_template_ui.services.docker_service import DockerService
from ansible_template_ui.services.mount_resolver import MountResolver


@pytest.fixture
def client():
    from fastapi.testclient import TestClient  # noqa: PLC0415

    from ansible_template_ui import app  # noqa: PLC0415

    return TestClient(app)


def make_success_output(content="bar"):
    b64_content = base64.b64encode(content.encode()).decode()
    response = {
        "plays": [
            {
                "tasks": [
                    {"hosts": {"localhost": {}}},
                    {"hosts": {"localhost": {"content": b64_content}}},
                ],
            },
        ],
    }
    return json.dumps(response).encode()


def _rendered_content_from_call(mock_client):
    call_args = mock_client.containers.run.call_args
    if call_args is None:
        return "bar"
    env = call_args.kwargs.get("environment", {})
    variables_b64 = env.get("VARIABLES")
    if variables_b64 is None:
        return "bar"
    try:
        variables_yaml = base64.b64decode(variables_b64).decode()
        variables = yaml.safe_load(variables_yaml) or {}
        if isinstance(variables, dict) and variables:
            return str(next(iter(variables.values())))
    except Exception:
        pass
    return "bar"


@pytest.fixture
def mock_docker():
    mock_client = MagicMock()
    mock_container = MagicMock()
    mock_client.images.pull.return_value = None
    mock_client.containers.run.return_value = mock_container
    mock_container.wait.return_value = {"StatusCode": 0}
    mock_container.logs.side_effect = lambda stdout=False, stderr=False: (
        make_success_output(_rendered_content_from_call(mock_client)) if stdout else b""
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
        mount_resolver=MountResolver(None),
    )
    return service, mock_client, mock_container

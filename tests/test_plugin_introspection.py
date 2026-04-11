# pyright: basic

import json
from unittest.mock import MagicMock

import docker.errors

from ansible_template_ui.models import PluginCategory, PluginEntry, PluginParam
from ansible_template_ui.services.plugin_introspection import PluginIntrospectionService


def _make_service() -> PluginIntrospectionService:
    return PluginIntrospectionService(
        docker_image="test-image:latest",
        container_timeout=30,
        filter_plugin_path="",
        lookup_plugin_path="",
        test_plugin_path="",
        galaxy_volume_name=None,
    )


def test_plugin_introspection_service_init():
    svc = _make_service()
    assert svc.is_ready() is False
    assert svc.is_failed() is False
    assert svc.get_plugins() is None


def test_classify_source_builtin():
    svc = _make_service()
    assert svc._classify_source("ansible.builtin.to_yaml") == "builtin"


def test_classify_source_collection():
    svc = _make_service()
    assert svc._classify_source("community.general.json_query") == "collection"


def test_classify_source_collection_fqcn_wins_over_bare_jinja2_name():
    """community.routeros.join has bare_name="join" which is in JINJA2_BUILTINS,
    but FQCN structure check comes first — should be "collection"."""
    svc = _make_service()
    assert svc._classify_source("community.routeros.join") == "collection"


def test_classify_source_builtin_wins_over_bare_jinja2_name():
    """ansible.builtin.join has bare_name="join" in JINJA2_BUILTINS,
    but ansible.builtin. prefix check comes first — should be "builtin"."""
    svc = _make_service()
    assert svc._classify_source("ansible.builtin.join") == "builtin"


def test_classify_source_custom():
    svc = _make_service()
    assert svc._classify_source("custom_reverse") == "custom"


def test_parse_output_valid_json():
    svc = _make_service()
    raw = json.dumps(
        {
            "filter": {
                "ansible.builtin.to_yaml": {
                    "doc": {
                        "short_description": "Convert to YAML",
                        "description": ["Converts data to YAML format."],
                        "options": {},
                    },
                    "examples": None,
                }
            },
            "lookup": {},
            "test": {},
        }
    )
    result = svc._parse_output(raw)
    assert isinstance(result, list)
    assert len(result) == 1
    category = result[0]
    assert isinstance(category, PluginCategory)
    assert category.type == "filter"
    assert len(category.plugins) == 1
    entry = category.plugins[0]
    assert isinstance(entry, PluginEntry)
    assert entry.name == "ansible.builtin.to_yaml"
    assert entry.namespace == "ansible.builtin"
    assert entry.source == "builtin"
    assert entry.type == "filter"


def test_parse_output_bad_json_returns_empty():
    svc = _make_service()
    result = svc._parse_output("not valid json")
    assert result == []


def test_parse_output_with_params():
    svc = _make_service()
    raw = json.dumps(
        {
            "filter": {
                "ansible.builtin.to_nice_yaml": {
                    "doc": {
                        "short_description": "Convert to nice YAML",
                        "description": ["Converts to nice YAML."],
                        "options": {
                            "indent": {
                                "description": ["Indentation spaces"],
                                "type": "int",
                                "default": 2,
                                "required": False,
                            }
                        },
                    },
                    "examples": None,
                }
            },
            "lookup": {},
            "test": {},
        }
    )
    result = svc._parse_output(raw)
    assert len(result) == 1
    entry = result[0].plugins[0]
    assert len(entry.params) == 1
    param = entry.params[0]
    assert isinstance(param, PluginParam)
    assert param.name == "indent"
    assert param.type == "int"
    assert param.default == "2"
    assert param.required is False


def test_introspect_docker_api_error_sets_failed():
    svc = _make_service()
    mock_client = MagicMock()
    mock_client.containers.run.side_effect = docker.errors.APIError("mock docker error")
    svc.introspect(mock_client)
    assert svc.is_failed() is True
    assert svc.is_ready() is False

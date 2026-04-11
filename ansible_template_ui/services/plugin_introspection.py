import json
import threading
from typing import Any, Literal, cast

import structlog
from requests.exceptions import ReadTimeout

import docker
from ansible_template_ui.models import PluginCategory, PluginEntry, PluginParam
from ansible_template_ui.services.mount_resolver import MountResolver
from docker import errors as docker_errors

logger = structlog.get_logger(__name__)

INTROSPECT_SCRIPT = """
import json, subprocess, sys

result = {}
for plugin_type in ["filter", "lookup", "test"]:
    try:
        listing_out = subprocess.run(
            ["ansible-doc", "--json", "-l", "-t", plugin_type],
            capture_output=True, text=True, timeout=60
        )
        names = list(json.loads(listing_out.stdout or "{}").keys())
        if names:
            detail_out = subprocess.run(
                ["ansible-doc", "--json", "-t", plugin_type] + names,
                capture_output=True, text=True, timeout=120
            )
            result[plugin_type] = json.loads(detail_out.stdout or "{}")
        else:
            result[plugin_type] = {}
    except Exception as e:
        result[plugin_type] = {}
print(json.dumps(result))
"""


class PluginIntrospectionService:
    def __init__(
        self,
        docker_image: str,
        container_timeout: int,
        filter_plugin_path: str,
        lookup_plugin_path: str,
        test_plugin_path: str,
        galaxy_volume_name: str | None,
    ):
        self.docker_image = docker_image
        self.container_timeout = container_timeout
        self.filter_plugin_path = filter_plugin_path
        self.lookup_plugin_path = lookup_plugin_path
        self.test_plugin_path = test_plugin_path
        self.galaxy_volume_name = galaxy_volume_name

        self._introspection_ready = threading.Event()
        self._introspection_failed = False
        self._cached_plugins: list[PluginCategory] | None = None

    def is_ready(self) -> bool:
        return self._introspection_ready.is_set()

    def is_failed(self) -> bool:
        return self._introspection_failed

    def get_plugins(self) -> list[PluginCategory] | None:
        return self._cached_plugins

    def introspect(self, client: docker.DockerClient) -> None:
        container = None
        try:
            resolver = MountResolver(client)
            volumes = self._build_volumes(resolver)

            environment: dict[str, str] = {
                "ANSIBLE_FILTER_PLUGINS": "/plugins/filter",
                "ANSIBLE_LOOKUP_PLUGINS": "/plugins/lookup",
                "ANSIBLE_TEST_PLUGINS": "/plugins/test",
                "ANSIBLE_COLLECTIONS_PATH": "/opt/ansible/collections",
            }

            container = client.containers.run(
                self.docker_image,
                command=["python3", "-c", INTROSPECT_SCRIPT],
                environment=environment,
                volumes=volumes if volumes else None,
                detach=True,
            )
            try:
                result = container.wait(timeout=self.container_timeout)
                if result["StatusCode"] != 0:
                    self._introspection_failed = True
                    logger.error(
                        "plugin_introspection_failed",
                        status=result["StatusCode"],
                    )
                else:
                    stdout = container.logs(stdout=True, stderr=False)
                    self._cached_plugins = self._parse_output(
                        stdout.decode("utf-8", errors="replace")
                    )
                    self._introspection_ready.set()
            finally:
                container.remove(force=True)
                container = None
        except ReadTimeout:
            self._introspection_failed = True
            logger.exception(
                "plugin_introspection_timeout", timeout=self.container_timeout
            )
        except docker_errors.APIError as e:
            self._introspection_failed = True
            logger.exception("plugin_introspection_docker_error", exc=str(e))
        except Exception as e:
            self._introspection_failed = True
            logger.exception("plugin_introspection_unexpected_error", exc=str(e))
        finally:
            if container is not None:
                container.remove(force=True)

    def _classify_source(self, fqcn: str) -> Literal["builtin", "custom", "collection"]:
        if fqcn.startswith("ansible.builtin."):
            return "builtin"
        if fqcn.count(".") >= 2:  # noqa: PLR2004
            return "collection"
        return "custom"

    def _build_volumes(self, resolver: MountResolver) -> dict[str, dict[str, str]]:
        volumes: dict[str, dict[str, str]] = {}
        plugin_paths: dict[str, str] = {
            self.filter_plugin_path: "/plugins/filter",
            self.lookup_plugin_path: "/plugins/lookup",
            self.test_plugin_path: "/plugins/test",
        }
        for web_container_path, renderer_dest in plugin_paths.items():
            if not web_container_path:
                continue
            host_source = resolver.resolve(web_container_path)
            if host_source:
                volumes[host_source] = {"bind": renderer_dest, "mode": "ro"}
            else:
                logger.debug(
                    "plugin_introspection_mount_skipped",
                    path=web_container_path,
                    reason="no bind mount found",
                )

        if self.galaxy_volume_name is not None:
            volumes[self.galaxy_volume_name] = {
                "bind": "/opt/ansible/collections",
                "mode": "ro",
            }

        return volumes

    def _parse_param(
        self, opt_key: str, opt_data: dict[str, Any]
    ) -> PluginParam | None:
        opt_desc_raw = opt_data.get("description", [])
        if isinstance(opt_desc_raw, list):
            opt_desc_items = cast("list[Any]", opt_desc_raw)
            opt_desc = "\n".join(str(s) for s in opt_desc_items)
        elif isinstance(opt_desc_raw, str):
            opt_desc = opt_desc_raw
        else:
            opt_desc = ""

        raw_type = opt_data.get("type")
        opt_type: str | None = raw_type if isinstance(raw_type, str) else None

        raw_default = opt_data.get("default")
        opt_default: str | None = str(raw_default) if raw_default is not None else None

        opt_required: bool = bool(opt_data.get("required", False))

        return PluginParam(
            name=str(opt_key),
            description=opt_desc,
            type=opt_type,
            default=opt_default,
            required=opt_required,
        )

    def _parse_plugin_entry(
        self, fqcn_raw: str, plugin_data: Any, plugin_type: str
    ) -> PluginEntry | None:
        if not isinstance(plugin_data, dict):
            return None

        plugin_data_typed: dict[str, Any] = plugin_data  # type: ignore[assignment]
        doc_val = plugin_data_typed.get("doc")
        doc: dict[str, Any] = doc_val if isinstance(doc_val, dict) else {}  # type: ignore[assignment]

        name: str = str(fqcn_raw)
        namespace: str = name.rsplit(".", 1)[0] if "." in name else "custom"

        raw_short_desc = doc.get("short_description")
        short_description: str | None = (
            raw_short_desc if isinstance(raw_short_desc, str) else None
        )

        raw_description = doc.get("description", [])
        if isinstance(raw_description, list):
            description_items = cast("list[Any]", raw_description)
            description_str: str | None = (
                "\n".join(str(s) for s in description_items) or None
            )
        elif isinstance(raw_description, str):
            description_str = raw_description or None
        else:
            description_str = None

        raw_examples = plugin_data_typed.get("examples")
        examples: str | None = raw_examples if isinstance(raw_examples, str) else None

        params: list[PluginParam] = []
        raw_options = doc.get("options", {})
        if isinstance(raw_options, dict):
            options_dict: dict[str, Any] = raw_options  # type: ignore[assignment]
            for opt_key, opt_val in options_dict.items():
                if not isinstance(opt_val, dict):
                    continue
                opt_data: dict[str, Any] = opt_val  # type: ignore[assignment]
                param = self._parse_param(opt_key, opt_data)
                if param is not None:
                    params.append(param)

        source = self._classify_source(name)
        return PluginEntry(
            name=name,
            namespace=namespace,
            type=plugin_type,
            short_description=short_description,
            description=description_str,
            params=params,
            examples=examples,
            source=source,
        )

    def _parse_output(self, raw: str) -> list[PluginCategory]:
        try:
            data: dict[str, Any] = json.loads(raw.strip())
        except json.JSONDecodeError, ValueError:
            logger.exception("plugin_introspection_parse_error", raw=raw[:200])
            return []

        categories: list[PluginCategory] = []

        for plugin_type in ["filter", "lookup", "test"]:
            type_plugins: list[PluginEntry] = []
            type_data: dict[str, Any] = data.get(plugin_type) or {}

            for fqcn_raw, plugin_data in type_data.items():
                entry = self._parse_plugin_entry(fqcn_raw, plugin_data, plugin_type)
                if entry is None:
                    continue
                type_plugins.append(entry)

            if type_plugins:
                categories.append(
                    PluginCategory(type=plugin_type, plugins=type_plugins)
                )

        return categories

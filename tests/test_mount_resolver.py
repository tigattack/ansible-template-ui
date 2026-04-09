# pyright: basic

from pathlib import Path, PurePosixPath
from unittest.mock import MagicMock, patch

from ansible_template_ui.services.mount_resolver import (
    MountResolver,
    PassthroughMountResolver,
)
from docker import errors as docker_errors


def _make_container_mock(mounts: list[dict]) -> MagicMock:
    container = MagicMock()
    container.id = "a" * 64
    container.attrs = {"Mounts": mounts}
    return container


def _resolver_with_mounts(mounts: dict[str, str]) -> MountResolver:
    resolver = MountResolver(None)
    resolver._bind_mounts = {PurePosixPath(k): v for k, v in mounts.items()}
    return resolver


def test_no_docker_client_returns_none():
    resolver = MountResolver(None)
    assert resolver.resolve("/plugins/filter") is None


def test_exact_mount_match():
    resolver = _resolver_with_mounts({"/plugins/filter": "/host/filters"})
    assert resolver.resolve("/plugins/filter") == "/host/filters"


def test_parent_mount_prefix_matching():
    resolver = _resolver_with_mounts({"/plugins": "/host/plugins"})
    assert resolver.resolve("/plugins/filter") == "/host/plugins/filter"


def test_longest_prefix_wins():
    resolver = _resolver_with_mounts(
        {
            "/plugins": "/host/plugins",
            "/plugins/filter": "/host/filters",
        }
    )
    assert resolver.resolve("/plugins/filter") == "/host/filters"


def test_no_matching_mount_returns_none():
    resolver = _resolver_with_mounts({"/plugins/filter": "/host/filters"})
    assert resolver.resolve("/nonexistent") is None


def test_non_bind_mount_skipped():
    mock_client = MagicMock()
    container = MagicMock()
    container.id = "b" * 64
    container.attrs = {
        "Mounts": [
            {
                "Type": "volume",
                "Destination": "/plugins/filter",
                "Source": "/host/filters",
            },
            {
                "Type": "bind",
                "Destination": "/plugins/lookup",
                "Source": "/host/lookups",
            },
        ]
    }
    mock_client.containers.get.return_value = container

    resolver = MountResolver(mock_client)
    mounts = resolver._fetch_bind_mounts("b" * 64)

    assert PurePosixPath("/plugins/filter") not in mounts
    assert PurePosixPath("/plugins/lookup") in mounts
    assert mounts[PurePosixPath("/plugins/lookup")] == "/host/lookups"


def test_mounts_are_cached():
    mock_client = MagicMock()
    container = _make_container_mock(
        [
            {
                "Type": "bind",
                "Destination": "/plugins/filter",
                "Source": "/host/filters",
            },
        ]
    )
    mock_client.containers.get.return_value = container

    resolver = MountResolver(mock_client)
    hex_id = "a" * 64

    with patch("socket.gethostname", return_value=hex_id[:12]):
        mock_client.containers.get.side_effect = [container, container]
        resolver.resolve("/plugins/filter")
        first_call_count = mock_client.containers.get.call_count

        resolver.resolve("/plugins/filter")
        assert mock_client.containers.get.call_count == first_call_count


def test_detect_container_id_via_hostname():
    hex_id = "c" * 64
    mock_client = MagicMock()
    container = _make_container_mock(
        [
            {"Type": "bind", "Destination": "/data", "Source": "/host/data"},
        ]
    )
    container.id = hex_id
    mock_client.containers.get.return_value = container

    resolver = MountResolver(mock_client)

    with patch("socket.gethostname", return_value=hex_id[:12]):
        result = resolver.resolve("/data")

    assert result == "/host/data"


def test_hostname_not_hex_falls_through_to_mountinfo(tmp_path: Path):
    hex_id = "d" * 64
    mountinfo_content = (
        f"1 0 8:1 / / rw shared:1 - ext4 /dev/sda1 rw\n"
        f"2 1 0:5 / /proc rw - proc proc rw\n"
        f"3 1 0:6 /docker/containers/{hex_id}/hostname "
        f"/etc/hostname ro - overlay overlay rw\n"
    )
    fake_mountinfo = tmp_path / "mountinfo"
    fake_mountinfo.write_text(mountinfo_content, encoding="utf-8")

    mock_client = MagicMock()
    container = _make_container_mock(
        [
            {"Type": "bind", "Destination": "/mnt/data", "Source": "/host/mnt"},
        ]
    )
    container.id = hex_id
    mock_client.containers.get.return_value = container

    resolver = MountResolver(mock_client)

    with (
        patch("socket.gethostname", return_value="my-hostname"),
        patch(
            "ansible_template_ui.services.mount_resolver.Path",
            side_effect=lambda p: (
                fake_mountinfo if str(p) == "/proc/self/mountinfo" else Path(p)
            ),
        ),
    ):
        result = resolver.resolve("/mnt/data")

    assert result == "/host/mnt"


def test_no_hostname_no_mountinfo_returns_none():
    mock_client = MagicMock()
    mock_client.containers.get.side_effect = docker_errors.NotFound("not found")

    resolver = MountResolver(mock_client)

    with (
        patch("socket.gethostname", return_value="my-hostname"),
        patch(
            "ansible_template_ui.services.mount_resolver.Path",
            side_effect=lambda p: (
                _non_existent_path() if str(p) == "/proc/self/mountinfo" else Path(p)
            ),
        ),
    ):
        result = resolver.resolve("/plugins/filter")

    assert result is None


def _non_existent_path() -> MagicMock:
    mock_path = MagicMock(spec=Path)
    mock_path.exists.return_value = False
    return mock_path


def test_docker_api_error_returns_none():
    mock_client = MagicMock()
    mock_client.containers.get.side_effect = Exception("connection refused")

    resolver = MountResolver(mock_client)

    with patch("socket.gethostname", return_value="my-hostname"):
        result = resolver.resolve("/plugins/filter")

    assert result is None


def test_fetch_bind_mounts_not_found_returns_empty():
    mock_client = MagicMock()
    mock_client.containers.get.side_effect = docker_errors.NotFound("not found")

    resolver = MountResolver(mock_client)
    mounts = resolver._fetch_bind_mounts("e" * 64)

    assert mounts == {}


def test_fetch_bind_mounts_generic_exception_returns_empty():
    mock_client = MagicMock()
    mock_client.containers.get.side_effect = Exception("boom")

    resolver = MountResolver(mock_client)
    mounts = resolver._fetch_bind_mounts("f" * 64)

    assert mounts == {}


def test_passthrough_resolver_returns_input():
    resolver = PassthroughMountResolver()
    assert resolver.resolve("/plugins/filter") == "/plugins/filter"
    assert resolver.resolve("/some/nested/path") == "/some/nested/path"
    assert resolver.resolve("/") == "/"

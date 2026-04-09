import sys
from typing import TYPE_CHECKING, Any

import structlog

from ansible_template_ui.config import get_settings

if TYPE_CHECKING:
    from structlog.typing import EventDict

_KEY_ORDER = ("timestamp", "level", "event")


def _reorder_keys(_logger: Any, _method: str, event_dict: EventDict) -> EventDict:
    reordered: EventDict = {}
    for key in _KEY_ORDER:
        if key in event_dict:
            reordered[key] = event_dict.pop(key)
    reordered.update(event_dict)
    return reordered


def setup_logging() -> None:
    settings = get_settings()
    shared_processors = [
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if settings.LOG_FORMAT == "pretty":
        renderer = structlog.dev.ConsoleRenderer()
    elif settings.LOG_FORMAT == "json":
        renderer = structlog.processors.JSONRenderer()
    elif sys.stderr.isatty():
        renderer = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()
    structlog.configure(
        processors=[*shared_processors, _reorder_keys, renderer],
        wrapper_class=structlog.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

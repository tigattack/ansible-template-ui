__version__ = "1.0.0"

import logging as stdlib_logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from ansible_template_ui.dependencies import get_docker_service
from ansible_template_ui.exceptions import (
    DockerImageError,
    GalaxyWarmupInProgressError,
    PluginIntrospectionInProgressError,
    RenderExecutionError,
    RenderTimeoutError,
)
from ansible_template_ui.logging import setup_logging
from ansible_template_ui.models import ErrorResponse
from ansible_template_ui.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    service = get_docker_service()
    if service.galaxy_collections:
        threading.Thread(target=service.warmup_galaxy_cache, daemon=True).start()
    threading.Thread(target=service.introspect_plugins, daemon=True).start()
    yield


app = FastAPI(lifespan=lifespan)
logger = structlog.get_logger(__name__)

app.include_router(router)


@app.exception_handler(GalaxyWarmupInProgressError)
async def galaxy_warmup_handler(request: Request, exc: GalaxyWarmupInProgressError):
    return JSONResponse(
        content=ErrorResponse(error=str(exc)).model_dump(),
        status_code=503,
    )


@app.exception_handler(PluginIntrospectionInProgressError)
async def plugin_introspection_handler(
    request: Request, exc: PluginIntrospectionInProgressError
):
    return JSONResponse(
        content=ErrorResponse(error=str(exc)).model_dump(),
        status_code=503,
    )


@app.exception_handler(RenderTimeoutError)
async def render_timeout_handler(request: Request, exc: RenderTimeoutError):
    return JSONResponse(
        content=ErrorResponse(error=str(exc)).model_dump(),
        status_code=408,
    )


@app.exception_handler(RenderExecutionError)
async def render_execution_handler(request: Request, exc: RenderExecutionError):
    return JSONResponse(
        content=ErrorResponse(error=str(exc)).model_dump(),
        status_code=500,
    )


@app.exception_handler(DockerImageError)
async def docker_image_handler(request: Request, exc: DockerImageError):
    return JSONResponse(
        content=ErrorResponse(error=str(exc)).model_dump(),
        status_code=400,
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "request_validation_failed",
        path=request.url.path,
        error_count=len(exc.errors()),
        errors=[
            {"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()
        ],
    )
    messages = "; ".join(e["msg"] for e in exc.errors())
    return JSONResponse(
        content=ErrorResponse(error=messages).model_dump(),
        status_code=422,
    )


_client_dir = Path(__file__).resolve().parent / "client"
if _client_dir.is_dir():
    app.mount("/", StaticFiles(directory=_client_dir, html=True), name="static")
else:
    stdlib_logging.getLogger(__name__).error(
        "client/ directory not found at %s — static files will not be served",
        _client_dir,
    )

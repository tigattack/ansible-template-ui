from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from ansible_template_ui.dependencies import get_docker_service
from ansible_template_ui.exceptions import PluginIntrospectionInProgressError
from ansible_template_ui.models import PluginsResponse, RenderRequest, RenderResponse
from ansible_template_ui.services.docker_service import DockerService

router = APIRouter()


@router.post("/render", response_model=RenderResponse)
def render_route(
    req: RenderRequest,
    service: Annotated[DockerService, Depends(get_docker_service)],
) -> RenderResponse:
    return service.render(req)


@router.get("/plugins", response_model=PluginsResponse)
def plugins_route(
    service: Annotated[DockerService, Depends(get_docker_service)],
) -> PluginsResponse:
    if not service.is_plugin_docs_ready() and not service.is_plugin_docs_failed():
        raise PluginIntrospectionInProgressError(
            "Plugin documentation is being loaded, please retry in a moment"
        )
    if service.is_plugin_docs_failed():
        raise HTTPException(status_code=500, detail="Plugin introspection failed")
    return service.get_plugin_docs()

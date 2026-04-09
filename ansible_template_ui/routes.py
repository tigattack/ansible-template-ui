from typing import Annotated

from fastapi import APIRouter, Depends

from ansible_template_ui.dependencies import get_docker_service
from ansible_template_ui.models import RenderRequest, RenderResponse
from ansible_template_ui.services.docker_service import DockerService

router = APIRouter()


@router.post("/render", response_model=RenderResponse)
def render_route(
    req: RenderRequest,
    service: Annotated[DockerService, Depends(get_docker_service)],
) -> RenderResponse:
    return service.render(req)

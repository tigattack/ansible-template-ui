from typing import Literal

import yaml
from pydantic import BaseModel, field_validator


class RenderRequest(BaseModel):
    template: str
    variables: str = "{}"
    tag: str = "latest"

    @field_validator("variables", mode="before")
    @classmethod
    def validate_variables_yaml(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if stripped == "":
            return "{}"
        try:
            result = yaml.safe_load(stripped)
        except yaml.YAMLError as e:
            raise ValueError(f"variables must be valid YAML: {e}") from e
        if result is None:
            return "{}"
        if not isinstance(result, dict):
            raise ValueError(  # noqa: TRY004
                f"variables must be a YAML mapping, got {type(result).__name__}"
            )
        return v


class RenderResponse(BaseModel):
    content: str


class ErrorResponse(BaseModel):
    error: str


class PluginParam(BaseModel):
    name: str
    description: str
    type: str | None = None
    default: str | None = None
    required: bool = False


class PluginEntry(BaseModel):
    name: str
    namespace: str
    type: str
    short_description: str | None = None
    description: str | None = None
    params: list[PluginParam] = []
    examples: str | None = None
    source: Literal["builtin", "custom", "collection", "jinja2"]


class PluginCategory(BaseModel):
    type: str
    plugins: list[PluginEntry]


class PluginsResponse(BaseModel):
    categories: list[PluginCategory]

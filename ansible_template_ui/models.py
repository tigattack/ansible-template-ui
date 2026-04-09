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

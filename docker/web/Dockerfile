ARG FRONTEND_STAGE=build

FROM oven/bun:1 AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY frontend/ .
RUN bun run build

FROM scratch AS frontend-prebuilt
COPY ansible_template_ui/client/ /ansible_template_ui/client/

FROM frontend-${FRONTEND_STAGE} AS frontend-assets

FROM python:3.14-slim AS prod

LABEL org.opencontainers.image.description="Web UI for testing Ansible/Jinja2 templates"

ENV UV_LINK_MODE=copy

WORKDIR /app

RUN --mount=from=ghcr.io/astral-sh/uv:0.11-debian-slim,source=/usr/local/bin/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=/app/pyproject.toml \
    --mount=type=bind,source=uv.lock,target=/app/uv.lock \
    uv sync --locked --no-dev --no-install-project

COPY ansible_template_ui/ ansible_template_ui/
COPY --from=frontend-assets /ansible_template_ui/client/ /app/ansible_template_ui/client/
RUN --mount=from=ghcr.io/astral-sh/uv:0.11-debian-slim,source=/usr/local/bin/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=pyproject.toml,target=/app/pyproject.toml \
    --mount=type=bind,source=uv.lock,target=/app/uv.lock \
    --mount=type=bind,source=README.md,target=/app/README.md \
    uv sync --locked --no-dev --no-editable

ENV PATH="/app/.venv/bin:$PATH"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

CMD ["uvicorn", "ansible_template_ui:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2", "--timeout-keep-alive", "200"]

FROM prod AS dev
COPY --from=ghcr.io/astral-sh/uv:0.11-debian-slim /usr/local/bin/uv /usr/local/bin/uv

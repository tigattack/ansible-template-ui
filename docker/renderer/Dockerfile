# Debian-slim: cryptography has manylinux wheels, no build toolchain needed
FROM python:3.14-slim

LABEL org.opencontainers.image.description="Renderer service that evaluates Ansible/Jinja2 templates"

ENV UV_LINK_MODE=copy

COPY execute.sh playbook.yml clean_collections.py /

RUN --mount=from=ghcr.io/astral-sh/uv:0.11-debian-slim,source=/usr/local/bin/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system \
        ansible \
        jmespath \
        netaddr && \
    python /clean_collections.py

RUN useradd -r -m -s /bin/false ansible && \
    mkdir -p /opt/ansible/collections

USER ansible

CMD ["/bin/sh", "/execute.sh"]

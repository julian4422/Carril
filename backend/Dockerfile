# syntax=docker/dockerfile:1
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY pyproject.toml ./
COPY app ./app
RUN python -m venv /opt/venv && /opt/venv/bin/pip install .

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/opt/venv/bin:$PATH"
RUN useradd --system --uid 10001 --no-create-home carril
COPY --from=builder /opt/venv /opt/venv
USER carril
# Uvicorn solo acepta X-Forwarded-Proto/For de estas IPs (lee la variable directamente).
# Detrás de un proxy inverso, pon su IP o subred (p. ej. 172.18.0.0/16); "*" confía en cualquiera.
ENV FORWARDED_ALLOW_IPS=127.0.0.1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

FROM docker.m.daocloud.io/library/node:24-bookworm-slim AS frontend-builder

WORKDIR /frontend

RUN npm config set registry https://registry.npmmirror.com

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM docker.m.daocloud.io/library/python:3.12-slim

ARG GITLEAKS_VERSION=8.30.1
ARG ACTIONLINT_VERSION=1.7.7
ARG OSV_SCANNER_VERSION=2.2.3

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV SUPPLYGUARD_FRONTEND_DIST=/app/frontend/dist
ENV PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
ENV PIP_TRUSTED_HOST=mirrors.aliyun.com
ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_RETRIES=10
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
COPY requirements-gnn-pyg.txt .
RUN sed -i \
    -e 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' \
    -e 's|http://deb.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' \
    /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
      ca-certificates curl git tar gzip unzip \
      libgl1 libglib2.0-0 libgomp1 \
      ffmpeg \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim \
      fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/* \
  && pip install --no-cache-dir -r requirements.txt semgrep bandit checkov cyclonedx-bom \
  && (pip install --no-cache-dir zizmor || echo "WARNING: zizmor install failed; CI/CD audit will use built-in checks and actionlint if available.") \
  && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
  && pip install --no-cache-dir -r requirements-gnn-pyg.txt

# These scanners improve audit coverage but are not required for the API to run.
# Treat download, archive validation, and extraction failures as one fallback path.
RUN set -eu; \
    install_tar_tool() { \
      tool_name="$1"; \
      tool_url="$2"; \
      archive_path="/tmp/${tool_name}.tar.gz"; \
      if curl -sSfL --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 --retry-max-time 120 --retry-all-errors \
          "$tool_url" -o "$archive_path" \
        && tar -tzf "$archive_path" "$tool_name" >/dev/null 2>&1 \
        && tar -xzf "$archive_path" -C /usr/local/bin "$tool_name" \
        && chmod +x "/usr/local/bin/${tool_name}"; then \
          echo "Installed ${tool_name}."; \
      else \
          rm -f "/usr/local/bin/${tool_name}"; \
          echo "WARNING: ${tool_name} install failed; the corresponding built-in audit fallback will be used."; \
      fi; \
      rm -f "$archive_path"; \
    }; \
    install_tar_tool \
      gitleaks \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"; \
    install_tar_tool \
      actionlint \
      "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"; \
    if curl -sSfL --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 --retry-max-time 120 --retry-all-errors \
        "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" \
        -o /tmp/osv-scanner \
      && test -s /tmp/osv-scanner \
      && chmod +x /tmp/osv-scanner \
      && mv /tmp/osv-scanner /usr/local/bin/osv-scanner; then \
        echo "Installed osv-scanner."; \
    else \
        rm -f /tmp/osv-scanner /usr/local/bin/osv-scanner; \
        echo "WARNING: osv-scanner install failed; dependency audit will use built-in advisory enrichment."; \
    fi

COPY . .
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=3).read()"

CMD ["python", "-m", "uvicorn", "supplyguard.app:app", "--host", "0.0.0.0", "--port", "8000"]

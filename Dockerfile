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
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_TRUSTED_HOST=pypi.tuna.tsinghua.edu.cn

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
  && pip install --no-cache-dir -r requirements-gnn-pyg.txt \
  && if curl -sSfL --connect-timeout 20 --retry 2 \
      "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      -o /tmp/gitleaks.tar.gz; then \
        tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
        && chmod +x /usr/local/bin/gitleaks; \
     else \
        echo "WARNING: gitleaks download failed; code audit will use the built-in secret scan fallback."; \
     fi \
  && if curl -sSfL --connect-timeout 20 --retry 2 \
      "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" \
      -o /tmp/actionlint.tar.gz; then \
        tar -xzf /tmp/actionlint.tar.gz -C /usr/local/bin actionlint \
        && chmod +x /usr/local/bin/actionlint; \
     else \
        echo "WARNING: actionlint download failed; CI/CD audit will use built-in checks and zizmor if available."; \
     fi \
  && if curl -sSfL --connect-timeout 20 --retry 2 \
      "https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_amd64" \
      -o /usr/local/bin/osv-scanner; then \
        chmod +x /usr/local/bin/osv-scanner; \
     else \
        echo "WARNING: osv-scanner download failed; dependency audit will use built-in advisory enrichment."; \
     fi \
  && rm -f /tmp/gitleaks.tar.gz /tmp/actionlint.tar.gz

COPY . .
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=3).read()"

CMD ["python", "-m", "uvicorn", "supplyguard.app:app", "--host", "0.0.0.0", "--port", "8000"]

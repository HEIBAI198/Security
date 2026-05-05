"""Operational helpers for production deployment."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import Request, Response


REQUEST_COUNT = 0
REQUEST_LATENCY_SECONDS = 0.0


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


async def request_logging_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    global REQUEST_COUNT, REQUEST_LATENCY_SECONDS
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    REQUEST_COUNT += 1
    REQUEST_LATENCY_SECONDS += elapsed
    response.headers["X-Request-ID"] = request_id
    logging.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(elapsed * 1000, 2),
                "client": request.client.host if request.client else "",
            },
            ensure_ascii=False,
        )
    )
    return response


def metrics_payload() -> str:
    return "\n".join(
        [
            "# HELP sysml_docgen_requests_total Total HTTP requests handled by this process.",
            "# TYPE sysml_docgen_requests_total counter",
            f"sysml_docgen_requests_total {REQUEST_COUNT}",
            "# HELP sysml_docgen_request_latency_seconds_total Total request latency seconds.",
            "# TYPE sysml_docgen_request_latency_seconds_total counter",
            f"sysml_docgen_request_latency_seconds_total {REQUEST_LATENCY_SECONDS:.6f}",
            "",
        ]
    )

"""Fetch independently sourced metadata for curated normal-package review lists.

Supports npm (registry.npmjs.org) and PyPI (pypi.org) registries with curated
popular-package seed lists, one-level dependency closure, bounded concurrency,
and retries. Output rows match the curated normal-package schema consumed by
scripts/gnn/build_graph_features.py.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote
from urllib.request import Request, urlopen


NPM_SEED_PACKAGES = [
    "react",
    "react-dom",
    "react-router-dom",
    "react-redux",
    "redux",
    "@reduxjs/toolkit",
    "vue",
    "vue-router",
    "pinia",
    "nuxt",
    "axios",
    "lodash",
    "express",
    "next",
    "webpack",
    "vite",
    "rollup",
    "typescript",
    "eslint",
    "prettier",
    "jest",
    "@babel/core",
    "@babel/preset-env",
    "@types/node",
    "@types/react",
    "chalk",
    "commander",
    "debug",
    "dotenv",
    "fs-extra",
    "glob",
    "got",
    "node-fetch",
    "semver",
    "uuid",
    "ws",
    "yargs",
    "zod",
    "moment",
    "dayjs",
    "rxjs",
    "svelte",
    "@sveltejs/kit",
    "tailwindcss",
    "postcss",
    "autoprefixer",
    "prop-types",
    "classnames",
    "styled-components",
    "@emotion/react",
    "prisma",
    "@prisma/client",
    "sequelize",
    "mongoose",
    "knex",
    "typeorm",
    "graphql",
    "apollo-server",
    "express-graphql",
    "socket.io",
    "ejs",
    "pug",
    "helmet",
    "cors",
    "morgan",
    "body-parser",
    "cookie-parser",
    "passport",
    "jsonwebtoken",
    "bcryptjs",
    "crypto-js",
    "cross-env",
    "concurrently",
    "nodemon",
    "pm2",
    "serve",
    "http-proxy-middleware",
    "compression",
    "mime-types",
    "mime",
    "ms",
    "is-number",
    "is-arrayish",
    "is-stream",
    "is-plain-object",
    "color-convert",
    "color-name",
    "has-flag",
    "supports-color",
    "ansi-styles",
    "escape-string-regexp",
    "minimist",
    "yargs-parser",
    "string-width",
    "wrap-ansi",
    "strip-ansi",
    "ansi-regex",
    "emoji-regex",
    "is-fullwidth-code-point",
    "locate-path",
    "p-locate",
    "p-limit",
    "p-try",
    "find-up",
    "path-exists",
    "camelcase",
    "decamelize",
    "cliui",
    "get-caller-file",
    "require-directory",
    "y18n",
    "ini",
    "configstore",
    "update-notifier",
    "minimatch",
    "brace-expansion",
    "balanced-match",
    "concat-map",
    "inflight",
    "once",
    "wrappy",
    "inherits",
    "util-deprecate",
    "safe-buffer",
    "string_decoder",
    "readable-stream",
    "duplexify",
    "pump",
    "end-of-stream",
    "mimic-fn",
    "onetime",
    "signal-exit",
    "shebang-command",
    "shebang-regex",
    "which",
    "isexe",
    "path-key",
    "npm-run-path",
    "execa",
    "human-signals",
    "strip-final-newline",
    "merge-stream",
    "get-stream",
    "is-stream",
    "p-is-promise",
    "p-map",
    "p-queue",
    "p-event",
    "p-defer",
    "p-finally",
    "p-reduce",
    "p-some",
    "p-timeout",
    "p-waterfall",
    "p-whilst",
    "queue-microtask",
    "fastq",
    "reusify",
    "merge2",
    "picomatch",
    "micromatch",
    "braces",
    "fill-range",
    "to-regex-range",
    "is-glob",
    "is-extglob",
    "extglob",
    "nanomatch",
    "snapdragon",
    "source-map",
    "source-map-resolve",
    "source-map-url",
    "urix",
    "resolve-url",
    "atob",
    "btoa",
    "decode-uri-component",
    "encodeurl",
    "escape-html",
    "unpipe",
    "ee-first",
    "depd",
    "setprototypeof",
    "toidentifier",
    "statuses",
    "on-finished",
    "destroy",
    "fresh",
    "etag",
    "vary",
    "accepts",
    "negotiator",
    "mime-db",
    "range-parser",
    "send",
    "serve-static",
    "finalhandler",
    "methods",
    "parseurl",
    "path-to-regexp",
    "content-disposition",
    "content-type",
    "media-typer",
    "type-is",
    "proxy-addr",
    "forwarded",
    "ipaddr.js",
    "array-flatten",
    "qs",
    "side-channel",
    "call-bind",
    "get-intrinsic",
    "function-bind",
    "has-symbols",
    "has",
    "object-inspect",
    "object-keys",
    "define-properties",
    "es-abstract",
    "es-to-primitive",
    "has-tostringtag",
    "is-callable",
    "is-date-object",
    "is-regex",
    "is-symbol",
    "is-string",
    "is-arguments",
    "is-boolean-object",
    "is-number-object",
    "is-bigint",
    "which-typed-array",
    "typed-array-length",
    "safe-regex-test",
    "regexp.prototype.flags",
    "string.prototype.trim",
    "string.prototype.trimend",
    "string.prototype.trimstart",
    "object.assign",
    "object.values",
    "object.entries",
    "object.fromentries",
    "object.getownpropertydescriptors",
    "array.prototype.flat",
    "array.prototype.flatmap",
    "array-includes",
    "array.prototype.find",
    "array.prototype.findindex",
    "array.prototype.reduce",
    "array.prototype.slice",
    "typedarray",
    "is-typed-array",
    "available-typed-arrays",
    "es-errors",
    "set-function-length",
    "define-data-property",
    "gopd",
    "data-view-buffer",
    "data-view-byte-length",
    "data-view-byte-offset",
    "aws-sdk",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-dynamodb",
    "firebase",
    "firebase-admin",
    "@google-cloud/storage",
    "googleapis",
    "stripe",
    "@stripe/stripe-js",
    "twilio",
    "@sendgrid/mail",
    "nodemailer",
    "mailgun-js",
    "pino",
    "winston",
    "bunyan",
    "log4js",
    "nanoid",
    "shortid",
    "slugify",
    "pluralize",
    "inflection",
    "chance",
    "@faker-js/faker",
    "randomstring",
    "randexp",
    "seedrandom",
    "crypto-random-string",
    "object-hash",
    "hash-sum",
    "imurmurhash",
    "md5",
    "base64-js",
    "buffer",
    "ieee754",
    "is-buffer",
    "process",
    "events",
    "util",
    "os-browserify",
    "path-browserify",
    "timers-browserify",
    "https-browserify",
    "querystring-es3",
    "punycode",
    "url",
    "assert",
    "zlib",
    "browserify-zlib",
    "jspdf",
    "pdf-lib",
    "pdfmake",
    "xlsx",
    "exceljs",
    "papaparse",
    "csv-parse",
    "csv-stringify",
    "fast-csv",
    "iconv-lite",
    "he",
    "entities",
    "html-entities",
    "domhandler",
    "domutils",
    "htmlparser2",
    "parse5",
    "cheerio",
    "jsdom",
    "undici",
    "ky",
    "ofetch",
    "superagent",
    "axios-retry",
    "http-status-codes",
    "http-errors",
    "restify",
    "fastify",
    "koa",
    "micro",
    "sirv",
    "polka",
    "connect",
    "finalhandler",
]

PYPI_SEED_PACKAGES = [
    "requests",
    "urllib3",
    "certifi",
    "idna",
    "charset-normalizer",
    "numpy",
    "pandas",
    "scipy",
    "matplotlib",
    "pillow",
    "scikit-learn",
    "tensorflow",
    "torch",
    "torchvision",
    "opencv-python",
    "flask",
    "django",
    "fastapi",
    "pydantic",
    "uvicorn",
    "starlette",
    "httpx",
    "httpcore",
    "aiohttp",
    "yarl",
    "multidict",
    "async-timeout",
    "attrs",
    "click",
    "jinja2",
    "markupsafe",
    "werkzeug",
    "itsdangerous",
    "sqlalchemy",
    "alembic",
    "psycopg2",
    "psycopg2-binary",
    "redis",
    "celery",
    "kombu",
    "billiard",
    "vine",
    "amqp",
    "pytest",
    "pytest-cov",
    "coverage",
    "black",
    "flake8",
    "isort",
    "mypy",
    "ruff",
    "poetry-core",
    "setuptools",
    "pip",
    "wheel",
    "twine",
    "cryptography",
    "pyjwt",
    "bcrypt",
    "passlib",
    "python-multipart",
    "python-dotenv",
    "pyyaml",
    "toml",
    "tomli",
    "packaging",
    "typing-extensions",
    "six",
    "python-dateutil",
    "pytz",
    "tzdata",
    "boto3",
    "botocore",
    "s3transfer",
    "jmespath",
    "moto",
    "beautifulsoup4",
    "soupsieve",
    "lxml",
    "html5lib",
    "webencodings",
    "defusedxml",
    "pygments",
    "markdown",
    "docutils",
    "sphinx",
    "tqdm",
    "joblib",
    "threadpoolctl",
    "openpyxl",
    "xlsxwriter",
    "xlrd",
    "xlwt",
    "pyparsing",
    "h5py",
    "tables",
    "numexpr",
    "dask",
    "distributed",
    "cloudpickle",
    "fsspec",
    "toolz",
    "partd",
    "pyarrow",
    "djangorestframework",
    "graphene",
    "marshmallow",
    "orjson",
    "ujson",
    "simplejson",
    "jsonschema",
    "uritemplate",
    "requests-oauthlib",
    "oauthlib",
    "msal",
    "azure-identity",
    "google-auth",
    "google-api-core",
    "protobuf",
    "grpcio",
    "grpcio-tools",
    "pyzmq",
    "websockets",
    "python-engineio",
    "python-socketio",
    "eventlet",
    "gevent",
    "greenlet",
    "zope.event",
    "zope.interface",
    "decorator",
    "pycparser",
    "cffi",
    "sniffio",
    "anyio",
    "exceptiongroup",
    "pluggy",
    "iniconfig",
    "py",
    "wcwidth",
    "prompt-toolkit",
    "rich",
    "typer",
    "tabulate",
    "prettytable",
    "appdirs",
    "platformdirs",
    "filelock",
    "virtualenv",
    "distlib",
    "chardet",
    "regex",
    "pathspec",
    "colorama",
    "termcolor",
    "frozenlist",
    "aiosignal",
    "async-timeout",
    "async-generator",
    "contextlib2",
    "backports.zoneinfo",
    "zoneinfo",
    "pytz-deprecation-shim",
    "tzlocal",
    "icalendar",
    "vobject",
    "dateutil",
    "humanize",
    "inflect",
    "plumbum",
    "watchdog",
    "psutil",
    "gpustat",
    "nvidia-ml-py",
    "py-cpuinfo",
    "python-hostlist",
    "netifaces",
    "requests-toolbelt",
    "requests-file",
    "requests-cache",
    "urllib3-secure-extra",
    "urllib3-requests",
    "ipaddress",
    "selectors2",
    "zipp",
    "importlib-metadata",
    "importlib-resources",
    "typing-extensions",
    "async-timeout",
    "aiocontextvars",
    "contextvars",
    "immutables",
    "wmctrl",
    "xdotool",
    "pygetwindow",
    "pyrect",
    "pyperclip",
    "pymsgbox",
    "mouseinfo",
    "pyscreeze",
    "pyautogui",
    "pydub",
    "simpleaudio",
    "playsound",
]


def _request_json(url: str) -> Any:
    request = Request(url, headers={"User-Agent": "supplyguard-gnn-dataset-builder/2.0"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def _fetch_npm(name: str) -> dict[str, Any]:
    url_name = quote(name, safe="@").replace("/", "%2f")
    payload = _request_json(f"https://registry.npmjs.org/{url_name}")
    if not isinstance(payload, dict):
        raise ValueError(f"unexpected npm payload for {name}")
    latest = payload.get("dist-tags", {}).get("latest") if isinstance(payload.get("dist-tags"), dict) else ""
    version_meta = payload.get("versions", {}).get(latest, {}) if latest else {}
    time_map = payload.get("time") if isinstance(payload.get("time"), dict) else {}
    repository = version_meta.get("repository") or payload.get("repository")
    scripts = version_meta.get("scripts") if isinstance(version_meta.get("scripts"), dict) else {}
    return {
        "ecosystem": "npm",
        "package": name,
        "version": latest,
        "latest_version": latest,
        "versions": sorted(payload.get("versions", {}).keys())[-20:],
        "description": version_meta.get("description") or payload.get("description") or "",
        "keywords": version_meta.get("keywords") or payload.get("keywords") or [],
        "dependencies": [
            {"ecosystem": "npm", "name": dep, "version": spec}
            for dep, spec in (version_meta.get("dependencies") or {}).items()
        ],
        "maintainers": version_meta.get("maintainers") or payload.get("maintainers") or [],
        "repository": repository,
        "homepage": version_meta.get("homepage") or payload.get("homepage") or "",
        "license": version_meta.get("license") or "",
        "install_scripts": {
            key: value for key, value in scripts.items() if key in {"preinstall", "install", "postinstall"}
        },
        "published": time_map.get(latest) or "",
        "created": time_map.get("created") or "",
        "modified": time_map.get("modified") or "",
        "metadata_source": "npm_registry_explicit_curated_review",
    }


def _fetch_pypi(name: str) -> dict[str, Any]:
    payload = _request_json(f"https://pypi.org/pypi/{quote(name)}/json")
    if not isinstance(payload, dict):
        raise ValueError(f"unexpected pypi payload for {name}")
    info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
    releases = payload.get("releases") if isinstance(payload.get("releases"), dict) else {}
    version = str(info.get("version") or "")
    published = ""
    for release_files in releases.values():
        if not isinstance(release_files, list):
            continue
        for release_file in release_files:
            if not isinstance(release_file, dict):
                continue
            candidate = str(
                release_file.get("upload_time_iso_8601")
                or release_file.get("upload_time")
                or ""
            )
            if candidate:
                published = candidate
                break
        if published:
            break
    maintainers: list[dict[str, str]] = []
    author = str(info.get("author") or "").strip()
    if author:
        maintainers.append({"name": author})
    dependencies: list[dict[str, str]] = []
    for item in info.get("requires_dist") or []:
        name_part = re.split(r"[<>=!~;\[\]]", str(item), maxsplit=1)[0].strip().lower()
        if name_part:
            dependencies.append({"ecosystem": "pypi", "name": name_part})
    project_urls = info.get("project_urls") if isinstance(info.get("project_urls"), dict) else {}
    repository = None
    for key, url in project_urls.items():
        lowered = str(key or "").lower()
        if any(part in lowered for part in ("source", "code", "repository", "github")) and url:
            repository = {"type": "git", "url": str(url)}
            break
    homepage = str(
        info.get("home_page")
        or info.get("homepage")
        or project_urls.get("Homepage")
        or ""
    )
    keywords_raw = info.get("keywords") or []
    keywords = (
        str(keywords_raw).split()
        if isinstance(keywords_raw, str)
        else [str(item) for item in keywords_raw if item]
    )
    return {
        "ecosystem": "pypi",
        "package": name,
        "version": version,
        "latest_version": version,
        "versions": sorted(str(item) for item in releases.keys())[-20:],
        "description": str(info.get("summary") or info.get("description") or "")[:2000],
        "keywords": keywords,
        "dependencies": dependencies,
        "maintainers": maintainers,
        "repository": repository,
        "homepage": homepage,
        "license": str(info.get("license") or ""),
        "install_scripts": {},
        "published": published,
        "created": published,
        "modified": published,
        "metadata_source": "pypi_registry_explicit_curated_review",
    }


def _fetch_with_retry(
    fetcher: Callable[[str], dict[str, Any]],
    name: str,
    *,
    attempts: int = 3,
) -> dict[str, Any] | None:
    for attempt in range(1, attempts + 1):
        try:
            return fetcher(name)
        except Exception:
            if attempt == attempts:
                return None
            time.sleep(0.5 * attempt)
    return None


def _package_names(lockfiles: list[Path]) -> list[str]:
    names: set[str] = set()
    for path in lockfiles:
        payload = json.loads(path.read_text(encoding="utf-8"))
        packages = payload.get("packages") if isinstance(payload, dict) else None
        if isinstance(packages, dict):
            for key, item in packages.items():
                if key.startswith("node_modules/"):
                    name = key[len("node_modules/"):]
                    if name and "/node_modules/" not in name:
                        names.add(name)
        dependencies = payload.get("dependencies") if isinstance(payload, dict) else None
        if isinstance(dependencies, dict):
            names.update(str(name) for name in dependencies if str(name).strip())
    return sorted(names)


def _dependency_names(record: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for dependency in record.get("dependencies") or []:
        if isinstance(dependency, dict):
            name = str(dependency.get("name") or "").strip()
        else:
            name = str(dependency or "").strip()
        if name and name not in names:
            names.append(name)
    return names


def fetch(
    lockfiles: list[Path],
    output: Path,
    *,
    ecosystems: tuple[str, ...] = ("npm", "pypi"),
    explicit_names: list[str] | None = None,
    max_workers: int = 8,
    depth: int = 1,
    seed_only: bool = False,
) -> dict[str, int]:
    if not set(ecosystems).issubset({"npm", "pypi"}):
        raise ValueError("ecosystems must be a subset of {npm, pypi}")
    explicit = [name.strip() for name in (explicit_names or []) if name.strip()]
    seeds: list[tuple[str, str]] = []
    if "npm" in ecosystems:
        names = set(NPM_SEED_PACKAGES)
        if not seed_only:
            names.update(_package_names(lockfiles))
        names.update(explicit)
        seeds.extend(("npm", name) for name in sorted(names))
    if "pypi" in ecosystems:
        seeds.extend(("pypi", name) for name in PYPI_SEED_PACKAGES)
        seeds.extend(("pypi", name) for name in explicit)

    fetchers = {"npm": _fetch_npm, "pypi": _fetch_pypi}
    seen: set[tuple[str, str]] = set()
    records: list[dict[str, Any]] = []
    todo = seeds
    for level in range(max(0, int(depth)) + 1):
        unique_todo: list[tuple[str, str]] = []
        for ecosystem, name in todo:
            key = (ecosystem, name.casefold())
            if key in seen:
                continue
            seen.add(key)
            unique_todo.append((ecosystem, name))
        if not unique_todo:
            break
        fetched: dict[tuple[str, str], dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(_fetch_with_retry, fetchers[ecosystem], name): (ecosystem, name)
                for ecosystem, name in unique_todo
            }
            for future in as_completed(futures):
                key = futures[future]
                record = future.result()
                if record:
                    fetched[key] = record
        next_todo: list[tuple[str, str]] = []
        for (ecosystem, _), record in fetched.items():
            record["label"] = 0
            record["label_source"] = f"{ecosystem}_registry_explicit_curated_review"
            record["label_confidence"] = 0.85
            record["source"] = "curated_registry_normal_packages"
            evidence_sources = [f"{ecosystem}_registry"]
            if ecosystem == "npm" and not seed_only:
                evidence_sources.extend(str(path) for path in lockfiles)
            record["evidence_sources"] = evidence_sources
            records.append(record)
            if level < int(depth):
                next_todo.extend(
                    (ecosystem, dep_name)
                    for dep_name in _dependency_names(record)
                    if dep_name
                )
        todo = next_todo

    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        key = (
            str(record.get("ecosystem") or ""),
            str(record.get("package") or "").casefold(),
        )
        deduped.setdefault(key, record)
    ordered = sorted(
        deduped.values(),
        key=lambda item: (str(item.get("ecosystem")), str(item.get("package") or "").lower()),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n" for item in ordered),
        encoding="utf-8",
    )
    return {
        "seeds": len(seeds),
        "attempted": len(seen),
        "fetched": len(ordered),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch curated normal-package metadata from npm/PyPI registries."
    )
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--lockfile", action="append", type=Path, default=[])
    parser.add_argument("--ecosystem", action="append", choices=["npm", "pypi"], default=[])
    parser.add_argument("--package", action="append", default=[])
    parser.add_argument("--max-workers", type=int, default=8)
    parser.add_argument("--depth", type=int, default=1)
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()
    ecosystems = tuple(args.ecosystem) or ("npm", "pypi")
    summary = fetch(
        args.lockfile,
        args.output,
        ecosystems=ecosystems,
        explicit_names=args.package,
        max_workers=args.max_workers,
        depth=args.depth,
        seed_only=args.seed_only,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

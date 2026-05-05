"""A small MDK-style sync client for the SysML DocGen prototype.

Usage examples:
  python tools/mdk_sync.py push --file data/import_example.json
  python tools/mdk_sync.py pull --out data/exported_model.json
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_SERVER = "http://127.0.0.1:8000"
DEFAULT_PROJECT = "satellite-power"
DEFAULT_BRANCH = "main"


def request_json(server: str, method: str, path: str, payload: dict | None = None) -> dict:
    return json.loads(request_bytes(server, method, path, payload).decode("utf-8"))


def request_bytes(server: str, method: str, path: str, payload: dict | None = None) -> bytes:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        f"{server.rstrip('/')}{path}",
        data=body,
        method=method,
        headers={
            "Content-Type": "application/json",
            "X-User": "engineer",
            "X-Role": "author",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise SystemExit(f"HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise SystemExit(f"无法连接 MMS 服务：{exc.reason}") from exc


def push(args: argparse.Namespace) -> None:
    source = Path(args.file)
    if args.format == "xmi" or source.suffix.lower() in {".xmi", ".xml"}:
        payload = {"format": "xmi", "xmi": source.read_text(encoding="utf-8")}
    else:
        payload = json.loads(source.read_text(encoding="utf-8"))
    result = request_json(
        args.server,
        "POST",
        f"/api/projects/{args.project}/branches/{args.branch}/import",
        payload,
    )
    if args.commit:
        commit = request_json(
            args.server,
            "POST",
            f"/api/projects/{args.project}/branches/{args.branch}/commit",
            {"message": args.message},
        )
        result["commit"] = commit["commit"]
    print(json.dumps(result, ensure_ascii=False, indent=2))


def pull(args: argparse.Namespace) -> None:
    path = f"/api/projects/{args.project}/branches/{args.branch}/export"
    if args.format == "xmi":
        text = request_bytes(args.server, "GET", f"{path}?format=xmi").decode("utf-8")
    else:
        result = request_json(args.server, "GET", path)
        text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"已导出到 {args.out}")
    else:
        print(text)


def generate(args: argparse.Namespace) -> None:
    template = Path(args.template).read_text(encoding="utf-8") if args.template else None
    result = request_json(
        args.server,
        "POST",
        f"/api/projects/{args.project}/branches/{args.branch}/documents",
        {"template": template, "format": args.format},
    )
    document = result["document"]
    if args.format == "pdf":
        content = base64.b64decode(document["pdf_base64"])
    else:
        content = document["markdown"] if args.format == "markdown" else document["html"]
    if args.out:
        if isinstance(content, bytes):
            Path(args.out).write_bytes(content)
        else:
            Path(args.out).write_text(content, encoding="utf-8")
        print(f"已生成 {args.out}")
    elif isinstance(content, bytes):
        sys.stdout.buffer.write(content)
    else:
        print(content)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MDK-style SysML model sync client")
    parser.add_argument("--server", default=DEFAULT_SERVER)
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)

    subparsers = parser.add_subparsers(dest="command", required=True)

    push_parser = subparsers.add_parser("push", help="push model JSON into MMS")
    push_parser.add_argument("--file", required=True)
    push_parser.add_argument("--format", choices=["json", "xmi"], default="json")
    push_parser.add_argument("--commit", action="store_true")
    push_parser.add_argument("--message", default="MDK 同步模型")
    push_parser.set_defaults(func=push)

    pull_parser = subparsers.add_parser("pull", help="pull model JSON from MMS")
    pull_parser.add_argument("--out")
    pull_parser.add_argument("--format", choices=["json", "xmi"], default="json")
    pull_parser.set_defaults(func=pull)

    gen_parser = subparsers.add_parser("generate", help="generate a document through DocGen")
    gen_parser.add_argument("--template")
    gen_parser.add_argument("--format", choices=["html", "markdown", "pdf"], default="html")
    gen_parser.add_argument("--out")
    gen_parser.set_defaults(func=generate)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main(sys.argv[1:])

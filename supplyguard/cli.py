"""SupplyGuard 命令行入口。"""

from __future__ import annotations

import argparse
from pathlib import Path
import os
import stat
import subprocess
import sys

from .gate import create_provenance, exit_code_for, render_text_result, run_gate


DEFAULT_POLICY = """profile: vibe-coding

fail_on_critical: true
max_high: 0
fail_on_scan_error: false

block_on:
  - sensitive_file
  - hardcoded_secret
  - malicious_dependency
  - suspicious_postinstall
  - dangerous_cicd_script
  - untrusted_workflow
  - artifact_provenance_mismatch

scans:
  code: true
  dependencies: true
  cicd: true
  include_osv: false
  include_zizmor: false
  include_actionlint: false

artifact_trust:
  require_provenance: true
  require_signature: false
  allow_self_hosted_runner: false
  allowed_workflows:
    - .github/workflows/release.yml
  allowed_builders:
    - https://github.com/actions/runner
"""


HOOK_TEMPLATE = """#!/usr/bin/env sh
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
export LANG="${LANG:-C.UTF-8}"
SUPPLYGUARD_PYTHON="__SUPPLYGUARD_PYTHON__"
SUPPLYGUARD_SOURCE="__SUPPLYGUARD_SOURCE__"

echo "SupplyGuard: 正在执行提交前安全检查..."

if command -v supplyguard >/dev/null 2>&1; then
  supplyguard gate --mode hook --staged --target "$PWD" --policy ".supplyguard/gate.yml"
elif [ -n "$SUPPLYGUARD_PYTHON" ] && [ -x "$SUPPLYGUARD_PYTHON" ]; then
  if [ -n "$SUPPLYGUARD_SOURCE" ]; then
    PYTHONPATH="$SUPPLYGUARD_SOURCE${PYTHONPATH:+:$PYTHONPATH}" "$SUPPLYGUARD_PYTHON" -m supplyguard.cli gate --mode hook --staged --target "$PWD" --policy ".supplyguard/gate.yml"
  else
    "$SUPPLYGUARD_PYTHON" -m supplyguard.cli gate --mode hook --staged --target "$PWD" --policy ".supplyguard/gate.yml"
  fi
elif command -v python >/dev/null 2>&1; then
  python -m supplyguard.cli gate --mode hook --staged --target "$PWD" --policy ".supplyguard/gate.yml"
else
  echo "SupplyGuard: 未找到 supplyguard 或 python 命令，请先安装 SupplyGuard CLI。"
  exit 127
fi
status=$?

if [ "$status" -ne 0 ]; then
  echo "SupplyGuard: 发现阻断级风险，本次提交已取消。"
  exit "$status"
fi

echo "SupplyGuard: 提交前检查通过。"
exit 0
"""


CI_TEMPLATE = """name: SupplyGuard Gate

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  supplyguard-gate:
    runs-on: ubuntu-latest
    env:
      SUPPLYGUARD_PACKAGE: "{package_spec}"

    steps:
      - name: Checkout target project
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install SupplyGuard
        run: |
          python -m pip install --upgrade pip
          python -m pip install "$SUPPLYGUARD_PACKAGE"

      - name: Run SupplyGuard CI Gate
        run: |
          supplyguard gate --mode ci --target "$GITHUB_WORKSPACE" --policy "$GITHUB_WORKSPACE/.supplyguard/gate.yml"
"""


RELEASE_TEMPLATE = """name: SupplyGuard Release Gate

on:
  workflow_dispatch:
  push:
    tags:
      - "v*"

permissions:
  contents: read

jobs:
  release-gate:
    runs-on: ubuntu-latest
    env:
      SUPPLYGUARD_PACKAGE: "{package_spec}"
      RELEASE_ARTIFACT: dist/source-release.tar.gz
      RELEASE_ATTESTATION: dist/source-release.intoto.jsonl

    steps:
      - name: Checkout target project
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install SupplyGuard
        run: |
          python -m pip install --upgrade pip
          python -m pip install "$SUPPLYGUARD_PACKAGE"

      - name: Build release artifact
        run: |
          mkdir -p dist
          tar --exclude=.git --exclude=dist -czf "$RELEASE_ARTIFACT" .

      - name: Generate release provenance
        run: |
          supplyguard provenance \
            --artifact "$GITHUB_WORKSPACE/$RELEASE_ARTIFACT" \
            --output "$GITHUB_WORKSPACE/$RELEASE_ATTESTATION" \
            --workflow ".github/workflows/release.yml"

      - name: Verify Artifact Trust Gate
        run: |
          supplyguard gate \
            --mode release \
            --target "$GITHUB_WORKSPACE" \
            --policy "$GITHUB_WORKSPACE/.supplyguard/gate.yml" \
            --artifact "$GITHUB_WORKSPACE/$RELEASE_ARTIFACT" \
            --attestation "$GITHUB_WORKSPACE/$RELEASE_ATTESTATION"

      - name: Upload verified release artifact
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: supplyguard-verified-release
          path: |
            ${{{{ env.RELEASE_ARTIFACT }}}}
            ${{{{ env.RELEASE_ATTESTATION }}}}
"""


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "handler"):
        parser.print_help()
        return 2
    return int(args.handler(args))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="supplyguard", description="SupplyGuard 门禁安装与执行工具。")
    subparsers = parser.add_subparsers(dest="command")

    install = subparsers.add_parser(
        "install",
        aliases=["init"],
        help="在当前用户项目中安装 Git Hook、CI Gate、Release Gate 和 gate.yml。",
    )
    install.add_argument("--target", default=".", help="要接入门禁的用户项目目录，默认当前目录。")
    install.add_argument("--package", dest="package_spec", default="", help="GitHub Actions 中安装 SupplyGuard 的 pip 包或 git+URL。")
    install.add_argument("--force", action="store_true", help="覆盖已有门禁文件。")
    install.add_argument("--skip-hook", action="store_true", help="不安装 Git Hook。")
    install.add_argument("--skip-ci", action="store_true", help="不生成 PR/Push CI 门禁 workflow。")
    install.add_argument("--skip-release", action="store_true", help="不生成发布前 Artifact Trust Gate workflow。")
    install.add_argument("--no-git-init", action="store_true", help="目标目录不是 Git 仓库时不自动 git init。")
    install.set_defaults(handler=handle_install)

    gate = subparsers.add_parser("gate", help="执行 Git Hook、CI Gate 或 Release Gate。")
    gate.add_argument("--target", default=".", help="扫描目标项目目录。")
    gate.add_argument("--policy", default="", help="门禁策略文件，默认 .supplyguard/gate.yml。")
    gate.add_argument("--mode", default="ci", choices=["hook", "ci", "release"], help="门禁模式。")
    gate.add_argument("--staged", action="store_true", help="额外检查 Git 暂存区。")
    gate.add_argument("--artifact", default="", help="发布门禁要校验的产物路径。")
    gate.add_argument("--attestation", default="", help="发布门禁要校验的 provenance/attestation 文件。")
    gate.add_argument("--timeout", type=int, default=90, help="代码扫描超时时间，单位秒。")
    gate.add_argument("--json", action="store_true", help="以 JSON 输出门禁结果。")
    gate.set_defaults(handler=handle_gate)

    provenance = subparsers.add_parser("provenance", help="为发布产物生成本地 in-toto/SLSA provenance。")
    provenance.add_argument("--artifact", required=True, help="待发布产物路径。")
    provenance.add_argument("--output", required=True, help="输出 attestation/provenance JSON 文件。")
    provenance.add_argument("--workflow", default=".github/workflows/release.yml", help="声明的 workflow 路径。")
    provenance.add_argument("--repo", default="", help="声明的源码仓库，默认读取 GITHUB_REPOSITORY。")
    provenance.add_argument("--commit", default="", help="声明的 commit，默认读取 GITHUB_SHA。")
    provenance.add_argument("--ref", default="", help="声明的 ref，默认读取 GITHUB_REF。")
    provenance.add_argument("--builder", default="https://github.com/actions/runner/github-hosted", help="声明的 builder.id。")
    provenance.add_argument("--runner", default="", help="声明的 runner 环境。")
    provenance.set_defaults(handler=handle_provenance)

    return parser


def handle_install(args: argparse.Namespace) -> int:
    target = Path(args.target).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    package_spec = args.package_spec or detect_package_spec()
    installed: list[str] = []
    skipped: list[str] = []

    if not args.no_git_init:
        ensure_git_repo(target)

    if not args.skip_hook:
        hook_path = target / ".githooks" / "pre-commit"
        write_text(hook_path, render_hook_template(), force=args.force, installed=installed, skipped=skipped)
        make_executable(hook_path)
        configure_hooks_path(target)

    policy_path = target / ".supplyguard" / "gate.yml"
    write_text(policy_path, DEFAULT_POLICY, force=args.force, installed=installed, skipped=skipped)

    if not args.skip_ci:
        ci_path = target / ".github" / "workflows" / "supplyguard-gate.yml"
        write_text(ci_path, CI_TEMPLATE.format(package_spec=package_spec), force=args.force, installed=installed, skipped=skipped)

    if not args.skip_release:
        release_path = target / ".github" / "workflows" / "release.yml"
        write_text(release_path, RELEASE_TEMPLATE.format(package_spec=package_spec), force=args.force, installed=installed, skipped=skipped)

    print(f"SupplyGuard 门禁接入完成: {target}")
    if installed:
        print("已生成:")
        for item in installed:
            print(f"- {item}")
    if skipped:
        print("已存在，未覆盖:")
        for item in skipped:
            print(f"- {item}")
        print("如需覆盖，请重新执行并追加 --force。")
    if not args.skip_hook:
        print("Git Hook 已配置为 core.hooksPath=.githooks。")
    print("下一步：正常 git add / git commit，或在 GitHub 上发起 PR / 打 tag 触发门禁。")
    return 0


def handle_gate(args: argparse.Namespace) -> int:
    result = run_gate(
        target=args.target,
        policy_path=args.policy or None,
        mode=args.mode,
        staged=args.staged,
        artifact=args.artifact or None,
        attestation=args.attestation or None,
        timeout_seconds=args.timeout,
    )
    if args.json:
        print_json(result.to_dict())
    else:
        print(render_text_result(result))
    return exit_code_for(result)


def handle_provenance(args: argparse.Namespace) -> int:
    output = create_provenance(
        artifact=args.artifact,
        output=args.output,
        workflow=args.workflow,
        repo=args.repo or None,
        commit=args.commit or None,
        ref=args.ref or None,
        builder=args.builder,
        runner=args.runner or None,
    )
    print(f"SupplyGuard provenance 已生成: {output}")
    return 0


def print_json(payload: object) -> None:
    import json

    print(json.dumps(payload, ensure_ascii=False, indent=2))


def render_hook_template() -> str:
    source_root = Path(__file__).resolve().parents[1]
    return (
        HOOK_TEMPLATE.replace("__SUPPLYGUARD_PYTHON__", shell_path(sys.executable))
        .replace("__SUPPLYGUARD_SOURCE__", shell_path(source_root))
    )


def shell_path(value: str | Path) -> str:
    return str(Path(value).resolve()).replace("\\", "/").replace('"', '\\"')


def write_text(path: Path, content: str, *, force: bool, installed: list[str], skipped: list[str]) -> None:
    display = path.as_posix()
    if path.exists() and not force:
        skipped.append(display)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
    installed.append(display)


def make_executable(path: Path) -> None:
    if not path.exists():
        return
    current = path.stat().st_mode
    path.chmod(current | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def ensure_git_repo(target: Path) -> None:
    if (target / ".git").exists():
        return
    subprocess.run(["git", "init"], cwd=target, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def configure_hooks_path(target: Path) -> None:
    subprocess.run(["git", "config", "core.hooksPath", ".githooks"], cwd=target, check=False)


def detect_package_spec() -> str:
    root = Path(__file__).resolve().parents[1]
    try:
        process = subprocess.run(
            ["git", "-C", str(root), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return os.environ.get("SUPPLYGUARD_PACKAGE", "supplyguard-kg")
    remote = process.stdout.strip()
    if not remote:
        return os.environ.get("SUPPLYGUARD_PACKAGE", "supplyguard-kg")
    if remote.startswith("git@github.com:"):
        remote = "https://github.com/" + remote.removeprefix("git@github.com:").removesuffix(".git") + ".git"
    if remote.startswith("http://") or remote.startswith("https://"):
        return f"git+{remote}"
    return os.environ.get("SUPPLYGUARD_PACKAGE", "supplyguard-kg")


if __name__ == "__main__":
    sys.exit(main())

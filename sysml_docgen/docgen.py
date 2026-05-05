"""Document generation helpers for the SysML course design prototype."""

from __future__ import annotations

import copy
import base64
import hashlib
import html
import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import OUTPUT_DIR
from .metamodel import TYPE_LABELS, validate_repository


Element = dict[str, Any]

TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z]+):([^}]+)\s*\}\}")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def elements_by_type(elements: dict[str, Element], element_type: str) -> list[Element]:
    return sorted(
        [copy.deepcopy(item) for item in elements.values() if item.get("type") == element_type],
        key=lambda item: item.get("id", ""),
    )


def get_path(value: Any, path: str) -> Any:
    current = value
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part, "")
        elif isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return ""
        else:
            return ""
    return current


def resolve_element_token(elements: dict[str, Element], expression: str) -> str:
    if "." not in expression:
        element = elements.get(expression.strip())
        return str(element.get("name", "")) if element else ""

    element_id, path = expression.split(".", 1)
    element = elements.get(element_id.strip())
    if not element:
        return ""
    value = get_path(element, path.strip())
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def render_template(template: str, elements: dict[str, Element]) -> str:
    """Render a compact DocGen-like template into Markdown."""

    def replace(match: re.Match[str]) -> str:
        token_type = match.group(1).lower()
        expression = match.group(2).strip()
        if token_type == "element":
            return resolve_element_token(elements, expression)
        if token_type == "table":
            return render_markdown_table(elements, expression)
        if token_type == "trace":
            return render_traceability_markdown(elements)
        if token_type == "model":
            return render_model_summary_markdown(elements)
        if token_type == "validation":
            return render_validation_markdown(elements)
        return match.group(0)

    return TOKEN_RE.sub(replace, template)


def render_model_summary_markdown(elements: dict[str, Element]) -> str:
    counts: dict[str, int] = {}
    for element in elements.values():
        counts[element.get("type", "Unknown")] = counts.get(element.get("type", "Unknown"), 0) + 1
    rows = [
        f"当前模型共包含 {len(elements)} 个 SysML 元素。以下统计来自 MMS 模型仓库，可随模型更新自动刷新。",
        "",
        "| 类型 | 数量 |",
        "| --- | ---: |",
    ]
    for key in sorted(counts):
        rows.append(f"| {TYPE_LABELS.get(key, key)} | {counts[key]} |")
    return "\n".join(rows)


def render_markdown_table(elements: dict[str, Element], table_name: str) -> str:
    name = table_name.lower()
    if name in {"requirements", "requirement", "req"}:
        return render_requirements_table(elements)
    if name in {"blocks", "block", "structure"}:
        return render_blocks_table(elements)
    if name in {"tests", "testcases", "verification"}:
        return render_tests_table(elements)
    if name in {"interfaces", "ports", "interface"}:
        return render_interfaces_table(elements)
    if name in {"constraints", "constraint"}:
        return render_constraints_table(elements)
    if name in {"states", "state"}:
        return render_states_table(elements)
    return ""


def render_requirements_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 名称 | 需求文本 | 验证方式 |", "| --- | --- | --- | --- |"]
    for item in elements_by_type(elements, "Requirement"):
        rows.append(
            "| {id} | {name} | {text} | {verification} |".format(
                id=item.get("id", ""),
                name=item.get("name", ""),
                text=item.get("attributes", {}).get("text", item.get("description", "")),
                verification=item.get("attributes", {}).get("verification", ""),
            )
        )
    return "\n".join(rows)


def render_blocks_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 名称 | 责任域 | 描述 |", "| --- | --- | --- | --- |"]
    for item in elements_by_type(elements, "Block"):
        rows.append(
            f"| {item.get('id', '')} | {item.get('name', '')} | "
            f"{item.get('owner', '')} | {item.get('description', '')} |"
        )
    return "\n".join(rows)


def render_tests_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 名称 | 方法 | 判据 |", "| --- | --- | --- | --- |"]
    for item in elements_by_type(elements, "TestCase"):
        rows.append(
            f"| {item.get('id', '')} | {item.get('name', '')} | "
            f"{item.get('attributes', {}).get('method', '')} | "
            f"{item.get('attributes', {}).get('criterion', item.get('description', ''))} |"
        )
    return "\n".join(rows)


def render_interfaces_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 类型 | 名称 | 方向/协议 | 描述 |", "| --- | --- | --- | --- | --- |"]
    for item in elements_by_type(elements, "Interface") + elements_by_type(elements, "Port"):
        attrs = item.get("attributes", {})
        protocol = attrs.get("protocol") or attrs.get("direction") or attrs.get("interface", "")
        rows.append(
            f"| {item.get('id', '')} | {TYPE_LABELS.get(item.get('type', ''), item.get('type', ''))} | "
            f"{item.get('name', '')} | {protocol} | {item.get('description', '')} |"
        )
    return "\n".join(rows)


def render_constraints_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 名称 | 表达式 | 描述 |", "| --- | --- | --- | --- |"]
    for item in elements_by_type(elements, "Constraint"):
        rows.append(
            f"| {item.get('id', '')} | {item.get('name', '')} | "
            f"{item.get('attributes', {}).get('expression', '')} | {item.get('description', '')} |"
        )
    return "\n".join(rows)


def render_states_table(elements: dict[str, Element]) -> str:
    rows = ["| ID | 状态 | 描述 |", "| --- | --- | --- |"]
    for item in elements_by_type(elements, "State"):
        rows.append(f"| {item.get('id', '')} | {item.get('name', '')} | {item.get('description', '')} |")
    return "\n".join(rows)


def build_traceability(elements: dict[str, Element]) -> list[dict[str, Any]]:
    requirements = elements_by_type(elements, "Requirement")
    rows: list[dict[str, Any]] = []
    for requirement in requirements:
        requirement_id = str(requirement.get("id", ""))
        satisfy_ids = trace_ids_for_requirement(elements, requirement, "satisfy")
        verify_ids = trace_ids_for_requirement(elements, requirement, "verify")
        refine_ids = trace_ids_for_requirement(elements, requirement, "refine")
        constrain_ids = trace_ids_for_requirement(elements, requirement, "constrain")
        satisfied_refs = refs_from_ids(elements, satisfy_ids, exclude_id=requirement_id)
        verified_refs = refs_from_ids(elements, verify_ids, exclude_id=requirement_id)
        refined_refs = refs_from_ids(elements, refine_ids, exclude_id=requirement_id)
        constrained_refs = refs_from_ids(elements, constrain_ids, exclude_id=requirement_id)
        rows.append(
            {
                "requirement": compact_ref(requirement),
                "satisfied_by": satisfied_refs,
                "verified_by": verified_refs,
                "refined_by": refined_refs,
                "constrained_by": constrained_refs,
                "status": trace_status(satisfied_refs, verified_refs),
            }
        )
    return rows


def trace_ids_for_requirement(elements: dict[str, Element], requirement: Element, relation_type: str) -> list[str]:
    requirement_id = str(requirement.get("id", ""))
    return unique_ids(
        [
            *related_targets(requirement, relation_type),
            *incoming_sources(elements, requirement_id, relation_type),
        ]
    )


def related_targets(element: Element, relation_type: str) -> list[str]:
    return [
        relation.get("target", "")
        for relation in element.get("relations", [])
        if relation.get("type") == relation_type and relation.get("target")
    ]


def incoming_sources(elements: dict[str, Element], target_id: str, relation_type: str) -> list[str]:
    sources = []
    for element_id, element in elements.items():
        for relation in element.get("relations", []):
            if relation.get("type") == relation_type and relation.get("target") == target_id:
                sources.append(element_id)
    return sources


def unique_ids(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def refs_from_ids(elements: dict[str, Element], element_ids: list[str], exclude_id: str = "") -> list[dict[str, str]]:
    return [
        compact_ref(elements[element_id])
        for element_id in element_ids
        if element_id in elements and element_id != exclude_id
    ]


def compact_ref(element: Element) -> dict[str, str]:
    return {
        "id": str(element.get("id", "")),
        "name": str(element.get("name", "")),
        "type": str(element.get("type", "")),
    }


def trace_status(satisfied_refs: list[dict[str, str]], verified_refs: list[dict[str, str]]) -> str:
    if satisfied_refs and verified_refs:
        return "closed"
    if satisfied_refs or verified_refs:
        return "partial"
    return "open"


def render_traceability_markdown(elements: dict[str, Element]) -> str:
    rows = ["| 需求 | 满足元素 | 验证元素 | 细化元素 | 约束 | 状态 |", "| --- | --- | --- | --- | --- | --- |"]
    for row in build_traceability(elements):
        req = row["requirement"]
        satisfied = ", ".join(f"{item['id']} {item['name']}" for item in row["satisfied_by"]) or "-"
        verified = ", ".join(f"{item['id']} {item['name']}" for item in row["verified_by"]) or "-"
        refined = ", ".join(f"{item['id']} {item['name']}" for item in row["refined_by"]) or "-"
        constrained = ", ".join(f"{item['id']} {item['name']}" for item in row["constrained_by"]) or "-"
        rows.append(
            f"| {req['id']} {req['name']} | {satisfied} | {verified} | {refined} | {constrained} | {row['status']} |"
        )
    return "\n".join(rows)


def render_validation_markdown(elements: dict[str, Element]) -> str:
    validation = validate_repository(elements)
    rows = ["| 严重级别 | 元素 | 问题 |", "| --- | --- | --- |"]
    for item in validation["issues"][:50]:
        rows.append(f"| {item['severity']} | {item['element_id']} | {item['message']} |")
    if len(rows) == 2:
        rows.append("| info | - | 未发现语义校验问题 |")
    return "\n".join(rows)


def default_document_template(project: dict[str, Any], branch_name: str) -> str:
    return f"""# {project.get("name", "SysML 模型文档")}

## 1. 文档说明

本文档由 SysML 模型数据自动生成，来源分支为 `{branch_name}`。文档中的需求、结构、接口、约束、验证用例和追踪关系均来自 MMS 模型仓库。

系统采用“一次编辑，处处使用”的模型驱动流程：工程师在 VE 或外部建模工具中维护模型，MDK 将模型同步到 MMS，DocGen 再按视图与模板生成工程文档。因此，文档不再是孤立副本，而是模型在指定提交上的可追溯视图。

## 2. 模型概览

{{{{model:summary}}}}

## 3. 需求基线

需求基线用于记录系统应满足的能力、约束和验证方式。下表直接从 Requirement 元素生成。

{{{{table:requirements}}}}

## 4. 系统结构

系统结构用于描述满足需求的 Block 及其责任域。

{{{{table:blocks}}}}

## 5. 接口与端口

接口与端口用于连接不同结构元素和外部系统，是跨专业协作时保持一致性的关键数据。

{{{{table:interfaces}}}}

## 6. 约束与验证

约束与验证用例共同支撑需求闭环，DocGen 会自动汇总约束表达式和测试判据。

{{{{table:constraints}}}}

{{{{table:tests}}}}

## 7. 追踪矩阵

追踪矩阵用于检查需求是否已被设计元素满足、是否已有验证用例覆盖，以及是否存在进一步细化或工程约束。

{{{{trace:matrix}}}}

## 8. SysML 语义校验

语义校验用于发现缺失属性、非法关系、目标元素不存在或关系目标类型不匹配等问题。

{{{{validation:issues}}}}
"""


def markdown_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    html_parts: list[str] = []
    table_buffer: list[str] = []

    def flush_table() -> None:
        if not table_buffer:
            return
        html_parts.append(markdown_table_to_html(table_buffer))
        table_buffer.clear()

    for raw_line in lines:
        line = raw_line.rstrip()
        if line.startswith("|") and line.endswith("|"):
            table_buffer.append(line)
            continue
        flush_table()
        if not line:
            html_parts.append("")
        elif line.startswith("# "):
            html_parts.append(f"<h1>{html.escape(line[2:].strip())}</h1>")
        elif line.startswith("## "):
            html_parts.append(f"<h2>{html.escape(line[3:].strip())}</h2>")
        elif line.startswith("### "):
            html_parts.append(f"<h3>{html.escape(line[4:].strip())}</h3>")
        elif line.startswith("- "):
            html_parts.append(f"<p class=\"list-item\">{html.escape(line[2:].strip())}</p>")
        else:
            html_parts.append(f"<p>{inline_markdown_to_html(line)}</p>")
    flush_table()
    return "\n".join(part for part in html_parts if part != "")


def inline_markdown_to_html(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)


def markdown_table_to_html(lines: list[str]) -> str:
    if len(lines) < 2:
        return ""
    headers = split_table_row(lines[0])
    body_lines = lines[2:] if set(lines[1].replace("|", "").replace(":", "").replace(" ", "")) == {"-"} else lines[1:]
    parts = ["<table>", "<thead><tr>"]
    for header in headers:
        parts.append(f"<th>{html.escape(header)}</th>")
    parts.append("</tr></thead><tbody>")
    for line in body_lines:
        parts.append("<tr>")
        for cell in split_table_row(line):
            parts.append(f"<td>{html.escape(cell)}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def wrap_document_html(title: str, body: str, metadata: dict[str, Any]) -> str:
    meta_rows = "".join(
        f"<span><strong>{html.escape(str(key))}</strong>{html.escape(str(value))}</span>"
        for key, value in metadata.items()
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    body {{ margin: 0; font-family: "Microsoft YaHei", Arial, sans-serif; color: #1f2937; background: #f7f8fb; }}
    main {{ max-width: 960px; margin: 0 auto; padding: 40px 32px 64px; background: #ffffff; min-height: 100vh; }}
    h1 {{ font-size: 30px; margin: 0 0 20px; color: #0f172a; }}
    h2 {{ font-size: 20px; margin-top: 30px; color: #164e63; border-bottom: 1px solid #d6dde8; padding-bottom: 8px; }}
    p {{ line-height: 1.75; }}
    code {{ background: #eef2f7; border-radius: 4px; padding: 2px 5px; }}
    table {{ width: 100%; border-collapse: collapse; margin: 14px 0 24px; font-size: 14px; }}
    th, td {{ border: 1px solid #d8dee8; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ background: #eef6f7; color: #134e4a; }}
    .metadata {{ display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 12px 0 18px; border-bottom: 1px solid #d8dee8; color: #475569; font-size: 13px; }}
    .metadata strong {{ margin-right: 6px; color: #111827; }}
    @media print {{ body {{ background: #fff; }} main {{ padding: 0; }} }}
  </style>
</head>
<body>
<main>
  <div class="metadata">{meta_rows}</div>
  {body}
</main>
</body>
</html>"""


def html_to_pdf_bytes(html_content: str, markdown: str) -> bytes:
    """Render PDF with wkhtmltopdf when available, otherwise use a tiny fallback."""

    wkhtmltopdf = shutil.which("wkhtmltopdf")
    if wkhtmltopdf:
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                html_path = Path(tmp_dir) / "document.html"
                pdf_path = Path(tmp_dir) / "document.pdf"
                html_path.write_text(html_content, encoding="utf-8")
                subprocess.run(
                    [wkhtmltopdf, str(html_path), str(pdf_path)],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=20,
                )
                return pdf_path.read_bytes()
        except (OSError, subprocess.SubprocessError):
            pass
    return markdown_to_simple_pdf(markdown)


def markdown_to_simple_pdf(markdown: str) -> bytes:
    lines = []
    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if set(line.replace("|", "").replace(":", "").replace(" ", "")) == {"-"}:
            continue
        line = line.lstrip("#").strip().replace("|", "  ")
        lines.append(line[:110])
    if not lines:
        lines = ["SysML DocGen"]

    text_commands = ["BT", "/F1 10 Tf", "14 TL", "48 792 Td"]
    for index, line in enumerate(lines[:52]):
        if index:
            text_commands.append("T*")
        text_commands.append(f"({_pdf_escape(line)}) Tj")
    text_commands.append("ET")
    content = "\n".join(text_commands).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream",
    ]
    payload = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(payload))
        payload.extend(f"{index} 0 obj\n".encode("ascii"))
        payload.extend(obj)
        payload.extend(b"\nendobj\n")

    xref_offset = len(payload)
    payload.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    payload.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        payload.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    payload.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return bytes(payload)


def _pdf_escape(value: str) -> str:
    return (
        value.encode("latin-1", errors="replace")
        .decode("latin-1")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def generate_document(
    project: dict[str, Any],
    branch_name: str,
    template: str | None = None,
    output_format: str = "html",
) -> dict[str, Any]:
    branch = project["branches"][branch_name]
    elements = branch.get("elements", {})
    source_commit = branch.get("head", "working")
    rendered_markdown = render_template(template or default_document_template(project, branch_name), elements)
    model_hash = stable_hash(elements)
    document_id = f"DOC-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{model_hash[:6]}"
    metadata = {
        "项目": project.get("name", ""),
        "分支": branch_name,
        "提交": source_commit,
        "模型指纹": model_hash,
        "生成时间": utc_now(),
    }
    html_body = markdown_to_html(rendered_markdown)
    html_content = wrap_document_html(project.get("name", "SysML 文档"), html_body, metadata)
    pdf_bytes = html_to_pdf_bytes(html_content, rendered_markdown)
    document = {
        "id": document_id,
        "title": project.get("name", "SysML 文档"),
        "created_at": metadata["生成时间"],
        "source_branch": branch_name,
        "source_commit": source_commit,
        "model_hash": model_hash,
        "format": output_format,
        "markdown": rendered_markdown,
        "html": html_content,
        "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
        "pdf_filename": f"{document_id}.pdf",
        "traceability": build_traceability(elements),
        "validation": validate_repository(elements),
    }
    document["files"] = persist_document_outputs(document)
    branch.setdefault("documents", []).insert(0, document)
    branch["documents"] = branch["documents"][:20]
    return document


def persist_document_outputs(document: dict[str, Any], output_dir: Path = OUTPUT_DIR) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    base_name = document["id"]
    html_path = output_dir / f"{base_name}.html"
    markdown_path = output_dir / f"{base_name}.md"
    pdf_path = output_dir / f"{base_name}.pdf"
    html_path.write_text(document["html"], encoding="utf-8")
    markdown_path.write_text(document["markdown"], encoding="utf-8")
    pdf_path.write_bytes(base64.b64decode(document["pdf_base64"]))
    return {
        "html": str(html_path),
        "markdown": str(markdown_path),
        "pdf": str(pdf_path),
    }

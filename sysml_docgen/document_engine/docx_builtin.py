"""Styled builtin DOCX generation helpers extracted from docgen."""

from __future__ import annotations

import html
import io
import re
import zipfile


ACCENT = "0F766E"
ACCENT_DARK = "134E4A"
BODY_TEXT = "111827"
MUTED_TEXT = "475569"
GRID = "CBD5E1"
TOP_BORDER = "E5E7EB"
ROW_ALT = "F8FAFC"
CELL_PAD = "120"
FONT_ASCII = "SimSun"
FONT_FALLBACK = "SimSun"
FONT_EAST_ASIA = "宋体"
FONT_MONO = "Cascadia Mono"


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def markdown_to_docx_builtin(markdown: str) -> bytes:
    """Generate a polished DOCX without Pandoc/Quarto."""
    body_parts: list[str] = []
    table_rows: list[list[str]] = []
    code_lines: list[str] = []
    in_code_block = False

    def flush_table() -> None:
        nonlocal table_rows
        if table_rows:
            body_parts.append(_docx_table(table_rows))
        table_rows = []

    def flush_code() -> None:
        nonlocal code_lines
        if code_lines:
            body_parts.append(_docx_code_block(code_lines))
        code_lines = []

    for raw_line in markdown.splitlines():
        stripped = raw_line.strip()

        if stripped.startswith("```"):
            if in_code_block:
                flush_code()
                in_code_block = False
            else:
                flush_table()
                in_code_block = True
            continue

        if in_code_block:
            code_lines.append(raw_line.rstrip())
            continue

        if not stripped:
            flush_table()
            body_parts.append(_docx_empty_paragraph())
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            cells = split_table_row(stripped)
            if _is_table_separator(stripped):
                continue
            table_rows.append(cells)
            continue

        flush_table()
        if stripped.startswith("# "):
            body_parts.append(_docx_paragraph(stripped[2:].strip(), "Heading1"))
        elif stripped.startswith("## "):
            body_parts.append(_docx_paragraph(stripped[3:].strip(), "Heading2"))
        elif stripped.startswith("### "):
            body_parts.append(_docx_paragraph(stripped[4:].strip(), "Heading3"))
        elif stripped.startswith("#### "):
            body_parts.append(_docx_paragraph(stripped[5:].strip(), "Heading4"))
        elif stripped.startswith("- "):
            body_parts.append(_docx_paragraph(stripped[2:].strip(), "ListBullet", prefix="\u2022 "))
        elif re.match(r"^\d+[.)]\s+", stripped):
            body_parts.append(_docx_paragraph(stripped, "ListNumber"))
        elif stripped.startswith("> "):
            body_parts.append(_docx_paragraph(stripped[2:].strip(), "Quote"))
        else:
            body_parts.append(_docx_paragraph(stripped.lstrip("#").strip(), "Normal"))

    flush_table()
    flush_code()
    return _docx_package("\n".join(body_parts))


def _is_table_separator(line: str) -> bool:
    return set(line.replace("|", "").replace(":", "").replace(" ", "")) == {"-"}


def _docx_package(document_body: str) -> bytes:
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""
    rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""
    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {document_body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""
    core_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SysML DocGen Document</dc:title>
  <dc:creator>SysML DocGen</dc:creator>
  <cp:lastModifiedBy>SysML DocGen</cp:lastModifiedBy>
</cp:coreProperties>"""
    app_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SysML DocGen</Application>
</Properties>"""

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types)
        docx.writestr("_rels/.rels", rels)
        docx.writestr("word/document.xml", document_xml)
        docx.writestr("word/styles.xml", _styles_xml())
        docx.writestr("docProps/core.xml", core_xml)
        docx.writestr("docProps/app.xml", app_xml)
    return buffer.getvalue()


def _styles_xml() -> str:
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>{_docx_run_fonts()}<w:color w:val="{BODY_TEXT}"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>
    <w:rPr>{_docx_run_fonts()}<w:color w:val="{BODY_TEXT}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="360" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="8" w:color="{TOP_BORDER}"/></w:pBdr></w:pPr>
    <w:rPr>{_docx_run_fonts(size="34")}<w:b/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr>
    <w:rPr>{_docx_run_fonts(size="28")}<w:b/><w:color w:val="{ACCENT_DARK}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr>
    <w:rPr>{_docx_run_fonts(size="24")}<w:b/><w:color w:val="334155"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr>{_docx_run_fonts(size="22")}<w:b/><w:color w:val="{MUTED_TEXT}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="420" w:hanging="240"/><w:spacing w:after="80" w:line="320" w:lineRule="auto"/></w:pPr>
    <w:rPr>{_docx_run_fonts()}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber">
    <w:name w:val="List Number"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="420" w:hanging="240"/><w:spacing w:after="80" w:line="320" w:lineRule="auto"/></w:pPr>
    <w:rPr>{_docx_run_fonts()}</w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="360"/><w:spacing w:before="80" w:after="120"/><w:pBdr><w:left w:val="single" w:sz="16" w:space="8" w:color="{ACCENT}"/></w:pBdr></w:pPr>
    <w:rPr>{_docx_run_fonts()}<w:i/><w:color w:val="{MUTED_TEXT}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock">
    <w:name w:val="Code Block"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="40" w:after="40"/><w:shd w:val="clear" w:fill="F1F5F9"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="{FONT_MONO}" w:hAnsi="{FONT_MONO}" w:eastAsia="{FONT_EAST_ASIA}"/><w:sz w:val="19"/><w:color w:val="0F172A"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableCell">
    <w:name w:val="Table Cell"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>
    <w:rPr>{_docx_run_fonts(size="20")}<w:color w:val="{BODY_TEXT}"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader">
    <w:name w:val="Table Header"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>
    <w:rPr>{_docx_run_fonts(size="20")}<w:b/><w:color w:val="FFFFFF"/></w:rPr>
  </w:style>
</w:styles>"""


def _docx_empty_paragraph() -> str:
    return '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>'


def _docx_paragraph(text: str, style: str | None = None, prefix: str = "") -> str:
    style_xml = f'<w:pStyle w:val="{style}"/>' if style else ""
    runs = _docx_inline_runs(f"{prefix}{text}")
    return f"<w:p><w:pPr>{style_xml}</w:pPr>{runs}</w:p>"


def _docx_code_block(lines: list[str]) -> str:
    if not lines:
        return ""
    paragraphs = []
    for line in lines:
        paragraphs.append(
            f'<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>'
            f"{_docx_run(line or ' ', code=True)}</w:p>"
        )
    return "\n".join(paragraphs)


def _docx_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    column_count = max(len(row) for row in rows)
    col_pct = max(1, 5000 // column_count)
    grid = "".join(f'<w:gridCol w:w="{max(900, 9026 // column_count)}"/>' for _ in range(column_count))
    row_xml = []
    for row_index, row in enumerate(rows):
        padded = row + [""] * (column_count - len(row))
        is_header = row_index == 0
        cells = "".join(
            _docx_table_cell(cell, col_pct, is_header, row_index % 2 == 1)
            for cell in padded
        )
        header_xml = "<w:trPr><w:tblHeader/></w:trPr>" if is_header else ""
        row_xml.append(f"<w:tr>{header_xml}{cells}</w:tr>")

    borders = f"""
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="{TOP_BORDER}"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="{GRID}"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{GRID}"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="{GRID}"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{GRID}"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="{GRID}"/>
      </w:tblBorders>"""
    cell_mar = f"""
      <w:tblCellMar>
        <w:top w:w="{CELL_PAD}" w:type="dxa"/>
        <w:left w:w="{CELL_PAD}" w:type="dxa"/>
        <w:bottom w:w="{CELL_PAD}" w:type="dxa"/>
        <w:right w:w="{CELL_PAD}" w:type="dxa"/>
      </w:tblCellMar>"""
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
        '<w:tblLayout w:type="autofit"/>'
        f"{borders}{cell_mar}"
        '<w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
        f"</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{''.join(row_xml)}</w:tbl>"
    )


def _docx_table_cell(text: str, width_pct: int, is_header: bool, alternate: bool) -> str:
    fill = ACCENT if is_header else ROW_ALT if alternate else "FFFFFF"
    paragraph_style = "TableHeader" if is_header else "TableCell"
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width_pct}" w:type="pct"/>'
        f'<w:shd w:val="clear" w:fill="{fill}"/><w:vAlign w:val="center"/></w:tcPr>'
        f"{_docx_paragraph(text, paragraph_style)}</w:tc>"
    )


def _docx_inline_runs(text: str) -> str:
    pattern = re.compile(r"(`[^`]+`|\*\*[^*]+?\*\*|(?<!\*)\*[^*\n]+?\*(?!\*))")
    runs: list[str] = []
    cursor = 0
    for match in pattern.finditer(text):
        if match.start() > cursor:
            runs.append(_docx_run(text[cursor : match.start()]))
        token = match.group(0)
        if token.startswith("`") and token.endswith("`"):
            runs.append(_docx_run(token[1:-1], code=True))
        elif token.startswith("**") and token.endswith("**"):
            runs.append(_docx_run(token[2:-2], bold=True))
        elif token.startswith("*") and token.endswith("*"):
            runs.append(_docx_run(token[1:-1], italic=True))
        cursor = match.end()
    if cursor < len(text):
        runs.append(_docx_run(text[cursor:]))
    return "".join(runs) or _docx_run("")


def _docx_run(
    text: str,
    *,
    bold: bool = False,
    italic: bool = False,
    code: bool = False,
) -> str:
    fonts = (
        f'<w:rFonts w:ascii="{FONT_MONO}" w:hAnsi="{FONT_MONO}" w:eastAsia="{FONT_EAST_ASIA}"/>'
        if code
        else _docx_run_fonts()
    )
    bold_xml = "<w:b/>" if bold else ""
    italic_xml = "<w:i/>" if italic else ""
    code_xml = '<w:shd w:val="clear" w:fill="E2E8F0"/>' if code else ""
    size_xml = '<w:sz w:val="19"/>' if code else ""
    value = html.escape(text)
    return (
        f"<w:r><w:rPr>{fonts}{bold_xml}{italic_xml}{code_xml}{size_xml}</w:rPr>"
        f'<w:t xml:space="preserve">{value}</w:t></w:r>'
    )


def _docx_run_fonts(size: str = "22") -> str:
    return (
        f'<w:rFonts w:ascii="{FONT_ASCII}" w:hAnsi="{FONT_FALLBACK}" '
        f'w:eastAsia="{FONT_EAST_ASIA}"/><w:sz w:val="{size}"/>'
    )

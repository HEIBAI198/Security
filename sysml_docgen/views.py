"""View helpers for treating SysML View elements as first-class scopes."""

from __future__ import annotations

import copy
from typing import Any

from .document_engine.traceability import render_model_summary_markdown, render_traceability_markdown
from .metamodel import TYPE_LABELS, build_diagram


Element = dict[str, Any]


def list_view_elements(elements: dict[str, Element]) -> list[Element]:
    """Return all View elements in deterministic order."""
    return sorted(
        [copy.deepcopy(element) for element in elements.values() if element.get("type") == "View"],
        key=lambda element: element.get("id", ""),
    )


def view_payload(elements: dict[str, Element], view_id: str) -> dict[str, Any]:
    """Build a public payload for a single View and its resolved element scope."""
    view = elements.get(view_id)
    if not view or view.get("type") != "View":
        raise KeyError(view_id)
    viewpoint = resolve_viewpoint(elements, view)
    scoped = resolve_view_scope(elements, view)
    return {
        "view": copy.deepcopy(view),
        "viewpoint": copy.deepcopy(viewpoint) if viewpoint else None,
        "elements": list(scoped.values()),
        "element_count": len(scoped),
        "element_ids": list(scoped),
        "summary": view_scope_summary(scoped),
    }


def resolve_view_scope(elements: dict[str, Element], view: Element) -> dict[str, Element]:
    """Resolve elements selected by a View's manual bindings and query rules."""
    selected_ids: list[str] = [str(view.get("id", ""))]
    viewpoint = resolve_viewpoint(elements, view)
    if viewpoint:
        selected_ids.append(str(viewpoint.get("id", "")))
    selected_ids.extend(_list_attribute(view, "included_elements"))
    selected_ids.extend(_list_attribute(view, "elements"))
    selected_ids.extend(_include_relation_targets(view))

    query = _effective_query(view, viewpoint)
    if isinstance(query, dict):
        selected_ids.extend(_query_matches(elements, query))

    depth = _relation_depth(query)
    relation_filter = _as_set(query.get("relations")) if isinstance(query, dict) else set()
    selected_ids = _expand_by_depth(elements, selected_ids, depth, relation_filter)

    scoped: dict[str, Element] = {}
    for element_id in selected_ids:
        if element_id in elements:
            scoped[element_id] = copy.deepcopy(elements[element_id])
    return scoped


def build_view_diagram(elements: dict[str, Element], view_id: str) -> dict[str, Any]:
    """Build a diagram limited to the elements selected by a View."""
    payload = view_payload(elements, view_id)
    diagram = build_diagram({item["id"]: item for item in payload["elements"]}, "views")
    existing_edges = {
        (edge.get("source"), edge.get("target"), edge.get("type"))
        for edge in diagram.get("edges", [])
    }
    for element_id in payload["element_ids"]:
        if element_id == view_id:
            continue
        edge_key = (view_id, element_id, "include")
        if edge_key in existing_edges:
            continue
        diagram["edges"].append(
            {
                "source": view_id,
                "target": element_id,
                "type": "include",
                "label": "Include",
            }
        )
        existing_edges.add(edge_key)
    viewpoint = payload.get("viewpoint")
    if viewpoint:
        edge_key = (view_id, viewpoint.get("id"), "conform")
        if edge_key not in existing_edges:
            diagram["edges"].append(
                {
                    "source": view_id,
                    "target": viewpoint.get("id"),
                    "type": "conform",
                    "label": "Conform",
                }
            )
    diagram["view"] = payload["view"]
    diagram["viewpoint"] = viewpoint
    diagram["label"] = payload["view"].get("name") or payload["view"].get("id", view_id)
    return diagram


def render_view_markdown(elements: dict[str, Element], view_id: str) -> str:
    """Render a View as a standalone Markdown section."""
    payload = view_payload(elements, view_id)
    view = payload["view"]
    viewpoint_element = payload.get("viewpoint")
    scoped = {element["id"]: element for element in payload["elements"]}
    attrs = view.get("attributes", {})
    title = attrs.get("doc_section_title") or view.get("name") or view.get("id", view_id)
    viewpoint = (
        (viewpoint_element or {}).get("name")
        or attrs.get("viewpoint")
        or attrs.get("viewpoint_id")
        or "General"
    )

    rows = [
        f"## {title}",
        "",
        f"View ID: `{view.get('id', view_id)}`",
        "",
        f"Viewpoint: {viewpoint}",
        "",
        view.get("description", ""),
        "",
        "### View Scope",
        "",
        "| Type | ID | Name |",
        "| --- | --- | --- |",
    ]
    for element in sorted(scoped.values(), key=lambda item: (item.get("type", ""), item.get("id", ""))):
        rows.append(
            f"| {TYPE_LABELS.get(element.get('type', ''), element.get('type', ''))} "
            f"| {element.get('id', '')} | {element.get('name', '')} |"
        )
    rows.extend(["", "### View Summary", "", render_model_summary_markdown(scoped), "", "### View Traceability", ""])
    rows.append(render_traceability_markdown(scoped))
    return "\n".join(line for line in rows if line is not None)


def view_scope_summary(elements: dict[str, Element]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for element in elements.values():
        element_type = str(element.get("type", "Unknown"))
        counts[element_type] = counts.get(element_type, 0) + 1
    return counts


def resolve_viewpoint(elements: dict[str, Element], view: Element) -> Element | None:
    """Resolve the Viewpoint element linked by attributes or conform relation."""
    attrs = view.get("attributes", {})
    viewpoint_id = str(attrs.get("viewpoint_id") or "").strip()
    if not viewpoint_id:
        viewpoint_id = str(attrs.get("viewpoint") or "").strip()
    for relation in view.get("relations", []):
        if relation.get("type") == "conform" and relation.get("target"):
            viewpoint_id = str(relation.get("target", "")).strip()
            break
    viewpoint = elements.get(viewpoint_id)
    if viewpoint and viewpoint.get("type") == "Viewpoint":
        return viewpoint
    return None


def _effective_query(view: Element, viewpoint: Element | None) -> dict[str, Any]:
    view_query = view.get("attributes", {}).get("query", {})
    if not isinstance(view_query, dict):
        view_query = {}
    viewpoint_query = {}
    if viewpoint:
        raw = viewpoint.get("attributes", {}).get("default_query", {})
        if isinstance(raw, dict):
            viewpoint_query = raw
    return _merge_query(viewpoint_query, view_query)


def _merge_query(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if value in (None, "", []):
            continue
        merged[key] = value
    return merged


def _list_attribute(view: Element, name: str) -> list[str]:
    value = view.get("attributes", {}).get(name, [])
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _include_relation_targets(view: Element) -> list[str]:
    return [
        str(relation.get("target", "")).strip()
        for relation in view.get("relations", [])
        if relation.get("type") == "include" and relation.get("target")
    ]


def _query_matches(elements: dict[str, Element], query: dict[str, Any]) -> list[str]:
    requested_types = _as_set(query.get("types"))
    requested_owners = _as_set(query.get("owners"))
    text = str(query.get("text") or query.get("q") or "").strip().lower()
    if not requested_types and not requested_owners and not text:
        return []

    matches: list[str] = []
    for element_id, element in elements.items():
        if requested_types and element.get("type") not in requested_types:
            continue
        if requested_owners and element.get("owner") not in requested_owners:
            continue
        searchable = " ".join(
            [
                str(element.get("id", "")),
                str(element.get("name", "")),
                str(element.get("description", "")),
                str(element.get("owner", "")),
                str(element.get("attributes", "")),
            ]
        ).lower()
        if text and text not in searchable:
            continue
        matches.append(element_id)
    return matches


def _expand_by_depth(
    elements: dict[str, Element],
    selected_ids: list[str],
    depth: int,
    relation_filter: set[str] | None = None,
) -> list[str]:
    selected = [element_id for element_id in selected_ids if element_id]
    seen = set(selected)
    frontier = list(selected)
    relation_filter = relation_filter or set()
    for _ in range(depth):
        next_frontier: list[str] = []
        for element_id in frontier:
            element = elements.get(element_id)
            if not element:
                continue
            for relation in element.get("relations", []):
                if relation_filter and relation.get("type") not in relation_filter:
                    continue
                target = str(relation.get("target", "")).strip()
                if target and target not in seen:
                    seen.add(target)
                    selected.append(target)
                    next_frontier.append(target)
            for source_id, source in elements.items():
                if source_id in seen:
                    continue
                if any(
                    relation.get("target") == element_id
                    and (not relation_filter or relation.get("type") in relation_filter)
                    for relation in source.get("relations", [])
                ):
                    seen.add(source_id)
                    selected.append(source_id)
                    next_frontier.append(source_id)
        frontier = next_frontier
    return selected


def _relation_depth(query: Any) -> int:
    if not isinstance(query, dict):
        return 0
    try:
        return max(0, min(3, int(query.get("relation_depth", 0))))
    except (TypeError, ValueError):
        return 0


def _as_set(value: Any) -> set[str]:
    if isinstance(value, str):
        return {item.strip() for item in value.split(",") if item.strip()}
    if isinstance(value, list):
        return {str(item).strip() for item in value if str(item).strip()}
    return set()

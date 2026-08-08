from __future__ import annotations

import json
import random
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


def normalize_ecosystem(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"pypi", "python"}:
        return "pypi"
    if text in {"npm", "javascript"}:
        return "npm"
    return text or "generic"


def normalize_package_name(name: Any, ecosystem: Any) -> str:
    package = str(name or "").strip().lower()
    if normalize_ecosystem(ecosystem) == "pypi":
        package = re.sub(r"[-_.]+", "-", package)
    return package


def package_group_key(record: dict[str, Any]) -> str:
    ecosystem = normalize_ecosystem(
        record.get("ecosystem") or _ecosystem_from_id(record.get("id"))
    )
    package = normalize_package_name(
        record.get("package") or _package_from_id(record.get("id")),
        ecosystem,
    )
    return f"{ecosystem}:{package}"


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    input_path = Path(path)
    items: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        input_path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if line.strip():
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"{input_path}: line {line_number}: invalid JSON: {exc.msg}"
                ) from exc
            if not isinstance(payload, dict):
                raise ValueError(
                    f"{input_path}: line {line_number}: expected JSON object, "
                    f"got {type(payload).__name__}"
                )
            items.append(payload)
    return items


def write_jsonl(path: str | Path, records: list[dict[str, Any]]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def grouped_train_val_test_split(
    nodes: list[dict[str, Any]],
    *,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    random_state: int = 42,
) -> dict[str, list[str]]:
    _validate_split_ratios(train_ratio, val_ratio)

    groups: dict[str, list[str]] = defaultdict(list)
    for node in nodes:
        node_id = str(node.get("id") or "")
        if node_id:
            groups[package_group_key(node)].append(node_id)

    rng = random.Random(random_state)
    group_items = list(groups.items())
    rng.shuffle(group_items)

    split_groups: dict[str, list[tuple[str, list[str]]]] = {
        "train": [],
        "val": [],
        "test": [],
    }
    if not group_items:
        return _format_split_groups(split_groups)
    if len(group_items) == 1:
        split_groups["train"].append(group_items[0])
        return _format_split_groups(split_groups)
    if len(group_items) == 2:
        split_groups["train"].append(group_items[0])
        split_groups["val"].append(group_items[1])
        return _format_split_groups(split_groups)

    total_nodes = sum(len(ids) for _, ids in group_items)
    train_target = max(1, int(total_nodes * train_ratio))
    val_target = max(1, int(total_nodes * val_ratio)) if val_ratio > 0 else 0

    for group_key, node_ids in group_items:
        if _split_size(split_groups["train"]) < train_target:
            split_groups["train"].append((group_key, node_ids))
        elif val_target and _split_size(split_groups["val"]) < val_target:
            split_groups["val"].append((group_key, node_ids))
        else:
            split_groups["test"].append((group_key, node_ids))

    _ensure_requested_splits_have_groups(split_groups, train_ratio, val_ratio)
    return _format_split_groups(split_groups)


def grouped_time_train_val_test_split(
    nodes: list[dict[str, Any]],
    *,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> dict[str, list[str]] | None:
    """按标签分层并按发布时间切分；时间不完整或类别过少时返回 None。"""
    _validate_split_ratios(train_ratio, val_ratio)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        if str(node.get("id") or ""):
            grouped[package_group_key(node)].append(node)

    rows: list[tuple[int, datetime, str, list[str]]] = []
    for group_key, group_nodes in grouped.items():
        timestamps = [
            parsed
            for node in group_nodes
            if (parsed := _parse_timestamp(node.get("published") or node.get("modified") or node.get("created") or node.get("timestamp")))
        ]
        if len(timestamps) != len(group_nodes):
            return None
        label = max(int(node.get("label") or 0) for node in group_nodes)
        rows.append((label, min(timestamps), group_key, [str(node["id"]) for node in group_nodes]))

    by_label: dict[int, list[tuple[int, datetime, str, list[str]]]] = defaultdict(list)
    for row in rows:
        by_label[row[0]].append(row)
    if set(by_label) != {0, 1} or any(len(items) < 3 for items in by_label.values()):
        return None

    result: dict[str, list[str]] = {"train": [], "val": [], "test": []}
    for label_rows in by_label.values():
        label_rows.sort(key=lambda item: (item[1], item[2]))
        count = len(label_rows)
        train_end = max(1, min(count - 2, int(count * train_ratio)))
        val_size = max(1, int(count * val_ratio))
        val_end = min(count - 1, train_end + val_size)
        for split_name, selected in (
            ("train", label_rows[:train_end]),
            ("val", label_rows[train_end:val_end]),
            ("test", label_rows[val_end:]),
        ):
            result[split_name].extend(
                node_id for _, _, _, node_ids in selected for node_id in node_ids
            )
    return {name: sorted(node_ids) for name, node_ids in result.items()}


def _parse_timestamp(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _format_split_groups(
    split_groups: dict[str, list[tuple[str, list[str]]]],
) -> dict[str, list[str]]:
    return {
        name: sorted(node_id for _, node_ids in groups_for_split for node_id in node_ids)
        for name, groups_for_split in split_groups.items()
    }


def _ecosystem_from_id(value: Any) -> str:
    ecosystem, _ = _parse_package_id(value)
    return ecosystem


def _package_from_id(value: Any) -> str:
    _, package = _parse_package_id(value)
    return package


def _split_size(groups_for_split: list[tuple[str, list[str]]]) -> int:
    return sum(len(node_ids) for _, node_ids in groups_for_split)


def _parse_package_id(value: Any) -> tuple[str, str]:
    text = str(value or "").strip()
    if not text.startswith("pkg:"):
        return "", text

    body = text[4:]
    slash_index = body.find("/")
    colon_index = body.find(":")
    if slash_index != -1 and (colon_index == -1 or slash_index < colon_index):
        ecosystem, package = body.split("/", 1)
        package = package.split("?", 1)[0].split("#", 1)[0]
        version_index = package.rfind("@")
        if version_index > 0:
            package = package[:version_index]
        return ecosystem, package

    if colon_index != -1:
        ecosystem, package_with_version = body.split(":", 1)
        return ecosystem, package_with_version.split(":", 1)[0]

    return "", text


def _validate_split_ratios(train_ratio: float, val_ratio: float) -> None:
    if train_ratio < 0:
        raise ValueError("train_ratio must be non-negative")
    if val_ratio < 0:
        raise ValueError("val_ratio must be non-negative")
    if train_ratio + val_ratio > 1:
        raise ValueError("train_ratio + val_ratio must be less than or equal to 1")


def _ensure_requested_splits_have_groups(
    split_groups: dict[str, list[tuple[str, list[str]]]],
    train_ratio: float,
    val_ratio: float,
) -> None:
    test_ratio = 1 - train_ratio - val_ratio
    required = {
        "train": 1,
        "val": 1 if val_ratio > 0 else 0,
        "test": 1 if test_ratio > 0 else 0,
    }
    for split_name in ("val", "test"):
        if required[split_name] and not split_groups[split_name]:
            source_name = _split_with_surplus_group(split_groups, required)
            if source_name:
                split_groups[split_name].append(split_groups[source_name].pop())


def _split_with_surplus_group(
    split_groups: dict[str, list[tuple[str, list[str]]]],
    required: dict[str, int],
) -> str:
    surplus_sources = [
        split_name
        for split_name, groups_for_split in split_groups.items()
        if len(groups_for_split) > required[split_name]
    ]
    if not surplus_sources:
        return ""
    return max(surplus_sources, key=lambda name: _split_size(split_groups[name]))

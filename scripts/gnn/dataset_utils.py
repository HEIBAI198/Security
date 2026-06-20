from __future__ import annotations

import json
import random
import re
from collections import defaultdict
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
    items: list[dict[str, Any]] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            payload = json.loads(line)
            if isinstance(payload, dict):
                items.append(payload)
    return items


def write_jsonl(path: str | Path, records: list[dict[str, Any]]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )


def grouped_train_val_test_split(
    nodes: list[dict[str, Any]],
    *,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    random_state: int = 42,
) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for node in nodes:
        node_id = str(node.get("id") or "")
        if node_id:
            groups[package_group_key(node)].append(node_id)

    rng = random.Random(random_state)
    group_items = list(groups.items())
    rng.shuffle(group_items)

    total_nodes = sum(len(ids) for _, ids in group_items)
    train_target = max(1, int(total_nodes * train_ratio)) if total_nodes else 0
    val_target = max(1, int(total_nodes * val_ratio)) if total_nodes else 0
    split_groups: dict[str, list[tuple[str, list[str]]]] = {
        "train": [],
        "val": [],
        "test": [],
    }

    for group_key, node_ids in group_items:
        if _split_size(split_groups["train"]) < train_target:
            split_groups["train"].append((group_key, node_ids))
        elif _split_size(split_groups["val"]) < val_target:
            split_groups["val"].append((group_key, node_ids))
        else:
            split_groups["test"].append((group_key, node_ids))

    if not split_groups["test"] and split_groups["val"]:
        split_groups["test"].append(split_groups["val"].pop())
    if not split_groups["val"] and split_groups["train"]:
        split_groups["val"].append(split_groups["train"].pop())

    return {
        name: sorted(node_id for _, node_ids in groups_for_split for node_id in node_ids)
        for name, groups_for_split in split_groups.items()
    }


def _ecosystem_from_id(value: Any) -> str:
    parts = str(value or "").split(":")
    return parts[1] if len(parts) >= 3 and parts[0] == "pkg" else ""


def _package_from_id(value: Any) -> str:
    parts = str(value or "").split(":", 2)
    return parts[2] if len(parts) == 3 and parts[0] == "pkg" else str(value or "")


def _split_size(groups_for_split: list[tuple[str, list[str]]]) -> int:
    return sum(len(node_ids) for _, node_ids in groups_for_split)

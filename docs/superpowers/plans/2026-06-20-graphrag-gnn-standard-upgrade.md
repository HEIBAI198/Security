# GraphRAG + Standard GNN Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing SupplyGuard GraphRAG + lightweight GNN prototype into a PyTorch Geometric GraphSAGE pipeline with better negative samples, fixed train/validation/test splits, model fallback, embedding-assisted GraphRAG retrieval, UI evidence, and evaluation reports.

**Architecture:** Keep the existing scanner, dependency audit, knowledge graph, and assistant flows. Add focused data and model modules under `scripts/gnn` and `supplyguard`, preserve the current public `graph_rag_retrieve()` and `score_dependency_payload()` entry points, and make PyG optional at runtime so the backend still starts without torch installed.

**Tech Stack:** Python 3.11/3.12 dedicated environment for PyTorch + PyTorch Geometric training, existing `D:\Anaconda3\python.exe` for non-PyG tests, NumPy, scikit-learn, NetworkX, React/TypeScript frontend, unittest, Vite build.

---

## Important Context

- Work in `D:\NUAA\信息安全竞赛\Security\.worktrees\graphrag-gnn`.
- The parent checkout has unrelated dirty state. Do not revert parent or worktree files unless this plan explicitly edits them.
- Do not read or edit `.env`.
- Current non-PyG test runner is `D:\Anaconda3\python.exe -m unittest discover -s tests`.
- Current frontend build command is `npm run build` from `frontend`.
- Current data artifacts under `storage/gnn_datasets` and `storage/graph_models` are ignored. Regenerate them as needed.
- Network may require approval. All online package metadata collection must have a local-file fallback.

## File Structure

Create or modify these files:

- Create `requirements-gnn-pyg.txt`: dedicated training environment dependencies.
- Create `docs/graphrag-gnn-environment.md`: environment creation and verification commands.
- Create `scripts/gnn/dataset_utils.py`: package normalization, JSONL helpers, split creation, metrics-safe utilities.
- Create `tests/test_gnn_dataset_utils.py`: split and normalization tests.
- Create `scripts/gnn/build_ecosystem_negatives.py`: local npm/PyPI metadata JSONL to normal negative samples.
- Create `scripts/gnn/build_hard_negatives.py`: sensitive-keyword hard negative selection.
- Create `tests/test_gnn_negative_builders.py`: negative builder tests.
- Modify `scripts/gnn/build_graph_features.py`: accept multiple negative files, add richer features, write `splits.json` and `dataset_card.json`.
- Modify `tests/test_gnn_build_graph_features.py`: verify additional negatives, split files, dataset card.
- Create `scripts/gnn/train_pyg_graphsage_package_risk.py`: lazy-import PyG GraphSAGE trainer and artifact exporter.
- Create `tests/test_gnn_train_pyg_graphsage_contract.py`: PyG missing behavior and tiny-train skip-aware contract tests.
- Create `scripts/gnn/evaluate_package_risk.py`: model-independent classification and ranking metric helpers.
- Create `tests/test_gnn_evaluate_package_risk.py`: metric tests.
- Create `supplyguard/gnn_models.py`: unified model loader and scorer abstraction.
- Modify `supplyguard/gnn_risk.py`: delegate to `gnn_models.py`, preserve public API, return new fields.
- Modify `tests/test_gnn_risk.py`: verify priority, fallback, explanations, similar packages.
- Create `supplyguard/graph_rag_intent.py`: query intent classifier.
- Create `supplyguard/graph_rag_retrievers.py`: keyword, risk, path, and embedding retrieval channels.
- Create `supplyguard/graph_rag_ranker.py`: reranking and `why_selected`.
- Create `supplyguard/graph_rag_context.py`: evidence table, missing evidence, compact LLM context.
- Modify `supplyguard/graph_rag.py`: orchestrate the new modules while preserving current entry point.
- Modify `tests/test_graph_rag.py`: channels, `why_selected`, `retrieval_trace`, `missing_evidence`.
- Create `tests/test_graph_rag_intent.py`: intent tests.
- Create `tests/test_graph_rag_retrievers.py`: retrieval channel tests.
- Modify `supplyguard/llm_assistant.py` and `tests/test_llm_assistant_graphrag_context.py`: inject structured GraphRAG context.
- Modify `supplyguard/routes/security.py`: keep `/assistant` response compatible with new GraphRAG fields.
- Modify `frontend/src/lib/security-api.ts`: extend GraphRAG and GNN response types.
- Modify `frontend/src/features/security-platform/index.tsx`: display model source, confidence, similar packages, channels, and missing evidence.
- Create `scripts/graphrag/evaluate_retrieval.py`: fixed-question GraphRAG evaluator.
- Create `tests/test_graphrag_evaluate_retrieval.py`: evaluator metric tests.
- Modify `docs/graphrag-gnn-implementation.md`: update from NumPy GraphSAGE-style baseline to standard PyG path.
- Create `docs/graphrag-gnn-optimization-report.md`: generated summary template and final result section.

---

### Task 1: Dedicated PyG Environment Documentation

**Files:**
- Create: `requirements-gnn-pyg.txt`
- Create: `docs/graphrag-gnn-environment.md`

- [ ] **Step 1: Add dependency file**

Create `requirements-gnn-pyg.txt` with this content:

```text
numpy>=1.24,<2.4
scikit-learn>=1.4,<2.0
networkx>=3.2,<4.0
torch
torch_geometric
```

- [ ] **Step 2: Add environment documentation**

Create `docs/graphrag-gnn-environment.md` with this content:

```markdown
# GraphRAG + GNN Training Environment

This project keeps PyTorch and PyTorch Geometric in a dedicated environment so the existing SupplyGuard runtime remains stable.

## Recommended Environment

Environment name: `supplyguard-gnn`

Python version: `3.11` or `3.12`

## Create Environment

```powershell
conda create -n supplyguard-gnn python=3.11 -y
conda activate supplyguard-gnn
```

## Install PyTorch

Use the official PyTorch selector before running the install command:

https://pytorch.org/get-started/locally/

The project target machine has an NVIDIA GPU, so choose Windows, pip or conda, Python, and a CUDA build supported by the installed driver.

## Install PyTorch Geometric

Use the official PyG installation guide:

https://pytorch-geometric.readthedocs.io/en/latest/install/installation.html

The minimal install is:

```powershell
pip install torch_geometric
```

## Verify

```powershell
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
python -c "import torch_geometric; print(torch_geometric.__version__)"
```

Expected:

- First command prints a torch version and `True` when CUDA is available.
- Second command prints a torch_geometric version.

## Runtime Rule

The backend must not require this environment. If PyTorch or PyG is unavailable, SupplyGuard falls back to NumPy GraphSAGE, scikit-learn, or rule scoring.
```

- [ ] **Step 3: Verify docs exist**

Run:

```powershell
Test-Path requirements-gnn-pyg.txt
Test-Path docs\graphrag-gnn-environment.md
```

Expected:

```text
True
True
```

- [ ] **Step 4: Commit**

```powershell
git add requirements-gnn-pyg.txt docs\graphrag-gnn-environment.md
git commit -m "docs: add PyG training environment guide"
```

---

### Task 2: Dataset Utility Module and Stable Splits

**Files:**
- Create: `scripts/gnn/dataset_utils.py`
- Create: `tests/test_gnn_dataset_utils.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_gnn_dataset_utils.py`:

```python
import unittest

from scripts.gnn.dataset_utils import (
    grouped_train_val_test_split,
    normalize_package_name,
    package_group_key,
)


class DatasetUtilsTests(unittest.TestCase):
    def test_normalizes_pypi_separators(self):
        self.assertEqual(normalize_package_name("My_Pkg.Name", "pypi"), "my-pkg-name")

    def test_keeps_npm_scope(self):
        self.assertEqual(normalize_package_name("@Scope/My_Pkg", "npm"), "@scope/my_pkg")

    def test_package_group_key_uses_ecosystem_and_package(self):
        node = {"id": "pkg:npm:left-pad", "ecosystem": "npm", "package": "Left-Pad"}
        self.assertEqual(package_group_key(node), "npm:left-pad")

    def test_grouped_split_prevents_same_package_leakage(self):
        nodes = [
            {"id": "pkg:npm:a:1", "ecosystem": "npm", "package": "a", "label": 1},
            {"id": "pkg:npm:a:2", "ecosystem": "npm", "package": "a", "label": 1},
            {"id": "pkg:npm:b", "ecosystem": "npm", "package": "b", "label": 0},
            {"id": "pkg:npm:c", "ecosystem": "npm", "package": "c", "label": 0},
            {"id": "pkg:pypi:d", "ecosystem": "pypi", "package": "d", "label": 1},
            {"id": "pkg:pypi:e", "ecosystem": "pypi", "package": "e", "label": 0},
        ]

        splits = grouped_train_val_test_split(nodes, random_state=7)

        seen = {}
        for split_name, node_ids in splits.items():
            for node in nodes:
                if node["id"] in node_ids:
                    key = package_group_key(node)
                    self.assertNotIn(key, seen)
                    seen[key] = split_name
        self.assertEqual(set(splits), {"train", "val", "test"})
        self.assertEqual(sum(len(value) for value in splits.values()), len(nodes))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_dataset_utils
```

Expected:

```text
ModuleNotFoundError: No module named 'scripts.gnn.dataset_utils'
```

- [ ] **Step 3: Implement dataset utilities**

Create `scripts/gnn/dataset_utils.py` with these public functions:

```python
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
    ecosystem = normalize_ecosystem(record.get("ecosystem") or _ecosystem_from_id(record.get("id")))
    package = normalize_package_name(record.get("package") or _package_from_id(record.get("id")), ecosystem)
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
        "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records),
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
    train_target = max(1, int(total_nodes * train_ratio))
    val_target = max(1, int(total_nodes * val_ratio))
    splits = {"train": [], "val": [], "test": []}

    for _, node_ids in group_items:
        if len(splits["train"]) < train_target:
            splits["train"].extend(node_ids)
        elif len(splits["val"]) < val_target:
            splits["val"].extend(node_ids)
        else:
            splits["test"].extend(node_ids)

    if not splits["test"] and splits["val"]:
        splits["test"].append(splits["val"].pop())
    if not splits["val"] and splits["train"]:
        splits["val"].append(splits["train"].pop())
    return {name: sorted(ids) for name, ids in splits.items()}


def _ecosystem_from_id(value: Any) -> str:
    parts = str(value or "").split(":")
    return parts[1] if len(parts) >= 3 and parts[0] == "pkg" else ""


def _package_from_id(value: Any) -> str:
    parts = str(value or "").split(":", 2)
    return parts[2] if len(parts) == 3 and parts[0] == "pkg" else str(value or "")
```

- [ ] **Step 4: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_dataset_utils
```

Expected:

```text
Ran 4 tests
OK
```

- [ ] **Step 5: Commit**

```powershell
git add scripts\gnn\dataset_utils.py tests\test_gnn_dataset_utils.py
git commit -m "feat: add GNN dataset split utilities"
```

---

### Task 3: Ecosystem and Hard Negative Builders

**Files:**
- Create: `scripts/gnn/build_ecosystem_negatives.py`
- Create: `scripts/gnn/build_hard_negatives.py`
- Create: `tests/test_gnn_negative_builders.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_gnn_negative_builders.py`:

```python
import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.build_ecosystem_negatives import build_ecosystem_negatives
from scripts.gnn.build_hard_negatives import build_hard_negatives


class NegativeBuilderTests(unittest.TestCase):
    def test_builds_ecosystem_negatives_and_excludes_positives(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            metadata = root / "metadata.jsonl"
            positives = root / "positives.jsonl"
            output = root / "negatives.jsonl"
            metadata.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"ecosystem": "npm", "package": "safe-lib", "description": "utility package"},
                        {"ecosystem": "npm", "package": "evil-lib", "description": "known bad"},
                        {"ecosystem": "pypi", "package": "My_Pkg", "description": "python utility"},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            positives.write_text(
                json.dumps({"ecosystem": "npm", "package": "evil-lib"}) + "\n",
                encoding="utf-8",
            )

            summary = build_ecosystem_negatives(metadata, positives, output, limit_per_ecosystem=10)

            rows = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(summary["written"], 2)
            self.assertEqual({row["package"] for row in rows}, {"safe-lib", "my-pkg"})
            self.assertTrue(all(row["label"] == 0 for row in rows))

    def test_builds_hard_negatives_from_sensitive_terms(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            negatives = root / "negatives.jsonl"
            output = root / "hard.jsonl"
            negatives.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"ecosystem": "npm", "package": "token-helper", "text": "token helper", "label": 0},
                        {"ecosystem": "npm", "package": "left-pad", "text": "string padding", "label": 0},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            summary = build_hard_negatives(negatives, output, keywords=["token"])

            rows = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(summary["written"], 1)
            self.assertEqual(rows[0]["package"], "token-helper")
            self.assertIn("hard_negative", rows[0]["evidence_sources"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_negative_builders
```

Expected:

```text
ModuleNotFoundError
```

- [ ] **Step 3: Implement ecosystem negative builder**

Create `scripts/gnn/build_ecosystem_negatives.py` with a function:

```python
def build_ecosystem_negatives(
    metadata_path: str | Path,
    positive_path: str | Path,
    output_path: str | Path,
    *,
    limit_per_ecosystem: int = 10000,
) -> dict[str, int]:
```

Implementation requirements:

- Read local JSONL metadata only.
- Accept keys `package`, `name`, `ecosystem`, `description`, `keywords`, `maintainers`, `versions`, and `latest_version`.
- Normalize package names with `dataset_utils.normalize_package_name`.
- Exclude any `(ecosystem, package)` present in the positive JSONL.
- Write rows with `label=0`, `source="ecosystem_metadata_negative"`, `evidence_sources=["ecosystem_metadata"]`, and a `text` field built from package, description, and keywords.
- Respect `limit_per_ecosystem`.
- Provide CLI args `--metadata`, `--positive-path`, `--output`, and `--limit-per-ecosystem`.
- Keep this file-path execution shim: `if __package__ in {None, ""}: sys.path.append(str(Path(__file__).resolve().parents[2]))`.

- [ ] **Step 4: Implement hard negative builder**

Create `scripts/gnn/build_hard_negatives.py` with a function:

```python
def build_hard_negatives(
    negative_path: str | Path,
    output_path: str | Path,
    *,
    keywords: list[str] | None = None,
    limit: int = 5000,
) -> dict[str, int]:
```

Implementation requirements:

- Default keywords: `token`, `auth`, `crypto`, `shell`, `install`, `download`, `proxy`, `credential`, `password`, `secret`.
- Match against normalized package name and text.
- Preserve original fields.
- Add `hard_negative` to `evidence_sources`.
- Set `source="hard_negative_keyword_filter"`.
- Provide CLI args `--negative-path`, `--output`, `--keyword`, and `--limit`.

- [ ] **Step 5: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_negative_builders
```

Expected:

```text
Ran 2 tests
OK
```

- [ ] **Step 6: Commit**

```powershell
git add scripts\gnn\build_ecosystem_negatives.py scripts\gnn\build_hard_negatives.py tests\test_gnn_negative_builders.py
git commit -m "feat: add ecosystem and hard negative builders"
```

---

### Task 4: Graph Feature Builder with Splits and Dataset Card

**Files:**
- Modify: `scripts/gnn/build_graph_features.py`
- Modify: `tests/test_gnn_build_graph_features.py`

- [ ] **Step 1: Extend failing test**

Add a test to `tests/test_gnn_build_graph_features.py`:

```python
def test_builds_features_from_multiple_negative_files_and_writes_splits(self):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        positive = root / "positive.jsonl"
        weak_negative = root / "weak.jsonl"
        ecosystem_negative = root / "ecosystem.jsonl"
        output = root / "features"
        positive.write_text(
            json.dumps({"ecosystem": "npm", "package": "evil", "text": "postinstall token", "label": 1, "evidence_sources": ["osv"]}) + "\n",
            encoding="utf-8",
        )
        weak_negative.write_text(
            json.dumps({"ecosystem": "npm", "package": "safe", "text": "safe package", "label": 0, "evidence_sources": ["local"]}) + "\n",
            encoding="utf-8",
        )
        ecosystem_negative.write_text(
            json.dumps({"ecosystem": "pypi", "package": "requests", "text": "http client", "label": 0, "evidence_sources": ["ecosystem_metadata"]}) + "\n",
            encoding="utf-8",
        )

        summary = build_graph_features(positive, [weak_negative, ecosystem_negative], output)

        self.assertEqual(summary["negative_records"], 2)
        self.assertTrue((output / "splits.json").exists())
        self.assertTrue((output / "dataset_card.json").exists())
        splits = json.loads((output / "splits.json").read_text(encoding="utf-8"))
        self.assertEqual(set(splits), {"train", "val", "test"})
```

Update imports if the test file does not already import `json`, `tempfile`, and `Path`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_build_graph_features
```

Expected:

```text
FAIL or TypeError showing build_graph_features does not accept multiple negative files or does not write splits.json
```

- [ ] **Step 3: Update implementation**

Modify `scripts/gnn/build_graph_features.py`:

- Import `grouped_train_val_test_split` from `scripts.gnn.dataset_utils`.
- Change `build_graph_features(positive_path, negative_path, output_path)` so `negative_path` can be a single path or list of paths.
- Merge all negative JSONL records.
- Preserve existing output files.
- Write `splits.json` using package nodes only.
- Write `dataset_card.json` with:
  - `positive_records`
  - `negative_records`
  - `node_count`
  - `edge_count`
  - `negative_sources`
  - `split_counts`
  - `created_by`

- [ ] **Step 4: Update CLI**

Modify CLI arguments:

```text
--positive storage\gnn_datasets\malicious_packages.jsonl
--negative storage\gnn_datasets\weak_negative_packages.jsonl
--negative storage\gnn_datasets\ecosystem_negative_packages.jsonl
--negative storage\gnn_datasets\hard_negative_packages.jsonl
--output storage\gnn_datasets\features
```

Keep backward compatibility with one `--negative`.

- [ ] **Step 5: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_build_graph_features tests.test_gnn_dataset_utils tests.test_gnn_negative_builders
```

Expected:

```text
OK
```

- [ ] **Step 6: Commit**

```powershell
git add scripts\gnn\build_graph_features.py tests\test_gnn_build_graph_features.py
git commit -m "feat: write grouped GNN dataset splits"
```

---

### Task 5: PyG GraphSAGE Trainer Contract

**Files:**
- Create: `scripts/gnn/train_pyg_graphsage_package_risk.py`
- Create: `tests/test_gnn_train_pyg_graphsage_contract.py`

- [ ] **Step 1: Write missing-dependency and tiny-train tests**

Create `tests/test_gnn_train_pyg_graphsage_contract.py`:

```python
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.train_pyg_graphsage_package_risk import (
    PYG_MODEL_TYPE,
    train_pyg_graphsage_package_risk,
)


class PyGGraphSageContractTests(unittest.TestCase):
    def _write_tiny_dataset(self, root: Path) -> Path:
        data = root / "features"
        data.mkdir()
        (data / "feature_schema.json").write_text(
            json.dumps({"features": ["ecosystem_npm", "ecosystem_pypi", "risk_keyword_count", "text_length"]}),
            encoding="utf-8",
        )
        nodes = [
            {"id": "pkg:npm:evil", "ecosystem": "npm", "package": "evil", "label": 1, "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 20}},
            {"id": "pkg:npm:stealer", "ecosystem": "npm", "package": "stealer", "label": 1, "features": {"ecosystem_npm": 1, "ecosystem_pypi": 0, "risk_keyword_count": 2, "text_length": 22}},
            {"id": "pkg:pypi:requests", "ecosystem": "pypi", "package": "requests", "label": 0, "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 10}},
            {"id": "pkg:pypi:flask", "ecosystem": "pypi", "package": "flask", "label": 0, "features": {"ecosystem_npm": 0, "ecosystem_pypi": 1, "risk_keyword_count": 0, "text_length": 8}},
        ]
        edges = [
            {"source": "pkg:npm:evil", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:npm:stealer", "target": "signal:token", "type": "has_risk_signal"},
            {"source": "pkg:pypi:requests", "target": "source:requirements", "type": "observed_in"},
            {"source": "pkg:pypi:flask", "target": "source:requirements", "type": "observed_in"},
        ]
        splits = {
            "train": ["pkg:npm:evil", "pkg:pypi:requests"],
            "val": ["pkg:npm:stealer"],
            "test": ["pkg:pypi:flask"],
        }
        (data / "train_nodes.jsonl").write_text("".join(json.dumps(node) + "\n" for node in nodes), encoding="utf-8")
        (data / "train_edges.jsonl").write_text("".join(json.dumps(edge) + "\n" for edge in edges), encoding="utf-8")
        (data / "splits.json").write_text(json.dumps(splits), encoding="utf-8")
        return data

    def test_model_type_constant_is_stable(self):
        self.assertEqual(PYG_MODEL_TYPE, "pyg_graphsage_package_risk")

    @unittest.skipUnless(importlib.util.find_spec("torch") and importlib.util.find_spec("torch_geometric"), "torch/PyG not installed")
    def test_trains_tiny_graph_and_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self._write_tiny_dataset(root)
            output = root / "model"

            metrics = train_pyg_graphsage_package_risk(data, output, epochs=3, hidden_dim=8, random_state=5)

            self.assertEqual(metrics["model_type"], PYG_MODEL_TYPE)
            self.assertTrue((output / "package_risk_graphsage.pt").exists())
            self.assertTrue((output / "package_risk_graphsage_metadata.json").exists())
            self.assertTrue((output / "package_embeddings.npy").exists())
            self.assertTrue((output / "package_embedding_index.json").exists())


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_train_pyg_graphsage_contract
```

Expected:

```text
ModuleNotFoundError: No module named 'scripts.gnn.train_pyg_graphsage_package_risk'
```

- [ ] **Step 3: Implement PyG trainer with lazy imports**

Create `scripts/gnn/train_pyg_graphsage_package_risk.py`.

Public API:

```python
PYG_MODEL_TYPE = "pyg_graphsage_package_risk"

def train_pyg_graphsage_package_risk(
    data_dir: str | Path,
    output_dir: str | Path,
    *,
    hidden_dim: int = 64,
    epochs: int = 80,
    learning_rate: float = 0.01,
    dropout: float = 0.3,
    random_state: int = 42,
) -> dict[str, Any]:
```

Implementation requirements:

- Import torch and torch_geometric inside helper functions, not at module import time.
- If torch or PyG is missing, raise `RuntimeError("PyTorch and PyTorch Geometric are required for PyG GraphSAGE training. See docs/graphrag-gnn-environment.md.")`.
- Read `feature_schema.json`, `train_nodes.jsonl`, `train_edges.jsonl`, and `splits.json`.
- Use only package nodes as supervised nodes.
- Build package-package edges by shared `has_risk_signal` and `observed_in` targets.
- Create `torch_geometric.data.Data(x=x, edge_index=edge_index, y=y)`.
- Use two `SAGEConv` layers and a linear classifier head.
- Use train/val/test masks from `splits.json`.
- Use weighted cross entropy.
- Save:
  - model state dict to `package_risk_graphsage.pt`
  - metadata JSON to `package_risk_graphsage_metadata.json`
  - embeddings to `package_embeddings.npy`
  - node/package index to `package_embedding_index.json`
  - metrics to `graphsage_eval.json`
- CLI args: `--data`, `--output`, `--hidden-dim`, `--epochs`, `--learning-rate`, `--dropout`, `--random-state`.

- [ ] **Step 4: Run contract tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_train_pyg_graphsage_contract
```

Expected without torch/PyG in base environment:

```text
Ran 2 tests
OK (skipped=1)
```

Expected inside `supplyguard-gnn` after installing torch/PyG:

```text
Ran 2 tests
OK
```

- [ ] **Step 5: Commit**

```powershell
git add scripts\gnn\train_pyg_graphsage_package_risk.py tests\test_gnn_train_pyg_graphsage_contract.py
git commit -m "feat: add PyG GraphSAGE training contract"
```

---

### Task 6: Package Risk Evaluation Helpers

**Files:**
- Create: `scripts/gnn/evaluate_package_risk.py`
- Create: `tests/test_gnn_evaluate_package_risk.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_gnn_evaluate_package_risk.py`:

```python
import unittest

from scripts.gnn.evaluate_package_risk import classification_metrics, top_k_hit_rate


class PackageRiskEvaluationTests(unittest.TestCase):
    def test_classification_metrics_include_pr_auc_and_confusion_matrix(self):
        metrics = classification_metrics([1, 1, 0, 0], [0.9, 0.8, 0.4, 0.1], threshold=0.5)

        self.assertEqual(metrics["accuracy"], 1.0)
        self.assertEqual(metrics["f1"], 1.0)
        self.assertIn("pr_auc", metrics)
        self.assertEqual(metrics["confusion_matrix"], {"tp": 2, "fp": 0, "tn": 2, "fn": 0})

    def test_top_k_hit_rate_counts_positive_labels(self):
        self.assertEqual(top_k_hit_rate([0, 1, 0, 1], [0.2, 0.9, 0.8, 0.1], k=2), 0.5)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_evaluate_package_risk
```

Expected:

```text
ModuleNotFoundError
```

- [ ] **Step 3: Implement evaluator**

Create `scripts/gnn/evaluate_package_risk.py` with:

```python
def classification_metrics(labels: list[int], scores: list[float], *, threshold: float = 0.5) -> dict[str, Any]:
```

and:

```python
def top_k_hit_rate(labels: list[int], scores: list[float], *, k: int = 10) -> float:
```

Implementation requirements:

- Use scikit-learn metrics for accuracy, precision, recall, f1, roc_auc, and average precision as `pr_auc`.
- Return zero for roc_auc and pr_auc when labels contain only one class.
- Return confusion matrix as `{"tp": int, "fp": int, "tn": int, "fn": int}`.
- Provide CLI args `--labels-scores-jsonl`, `--output`, `--threshold`, `--top-k`.

- [ ] **Step 4: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_evaluate_package_risk
```

Expected:

```text
Ran 2 tests
OK
```

- [ ] **Step 5: Commit**

```powershell
git add scripts\gnn\evaluate_package_risk.py tests\test_gnn_evaluate_package_risk.py
git commit -m "feat: add package risk evaluation helpers"
```

---

### Task 7: Unified GNN Model Loader and Backend Risk Output

**Files:**
- Create: `supplyguard/gnn_models.py`
- Modify: `supplyguard/gnn_risk.py`
- Modify: `tests/test_gnn_risk.py`

- [ ] **Step 1: Add failing tests for loader priority and fallback**

Extend `tests/test_gnn_risk.py` with:

```python
def test_pyg_artifact_failure_falls_back_to_numpy_model(self):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        model_dir = root / "model"
        data_dir = root / "features"
        model_dir.mkdir()
        data_dir.mkdir()
        (model_dir / "package_risk_graphsage.pt").write_bytes(b"not a valid torch model")
        (model_dir / "package_risk_graphsage_metadata.json").write_text(
            json.dumps({"model_type": "pyg_graphsage_package_risk"}),
            encoding="utf-8",
        )
        self._write_graphsage_fixture(data_dir)
        train_graphsage_package_risk(data_dir, model_dir, epochs=4, hidden_dim=4, random_state=11)

        scorer = PackageRiskScorer(model_dir)
        result = scorer.score_package("npm", "evil", "1.0.0", ["postinstall token"], [])

        self.assertTrue(result["model_available"])
        self.assertEqual(result["gnn_model_type"], "numpy_graphsage_mean_aggregator")
        self.assertIn("gnn_confidence", result)
        self.assertIn("gnn_explanations", result)
        self.assertIn("similar_malicious_packages", result)
```

Add helper `_write_graphsage_fixture(self, data_dir: Path)` by moving the tiny GraphSAGE dataset creation already present in `test_prefers_graphsage_model_when_available` into a reusable test helper.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_risk
```

Expected:

```text
FAIL showing missing gnn_model_type, gnn_confidence, gnn_explanations, or similar_malicious_packages
```

- [ ] **Step 3: Implement `supplyguard/gnn_models.py`**

Create a focused loader with:

```python
from pathlib import Path
from typing import Any


class PackageRiskModelRegistry:
    def __init__(self, model_dir: str | Path = Path("storage/graph_models")) -> None:
        self.model_dir = Path(model_dir)
        self.model_available = False
        self.model_type = "rule_fallback"
        self.load_error: str | None = None

    def predict(self, feature_values: dict[str, float]) -> dict[str, Any]:
        return {
            "score": 0.0,
            "model_available": self.model_available,
            "model_type": self.model_type,
            "confidence": 0.0,
            "explanations": [],
            "model_error": self.load_error,
        }

    def similar_packages(self, feature_values: dict[str, float], *, limit: int = 3) -> list[dict[str, Any]]:
        return []
```

Implementation requirements:

- Try PyG artifact first.
- PyG loading must be lazy and wrapped in exception handling.
- If PyG load fails, store the load error and try NumPy `.npz`.
- If NumPy load fails, try sklearn `.pkl`.
- If all load attempts fail, registry reports unavailable.
- For NumPy and sklearn paths, reuse the logic currently in `PackageRiskScorer`.
- For `similar_packages`, return an empty list when embeddings are missing.
- Do not import torch at module import time.

- [ ] **Step 4: Refactor `supplyguard/gnn_risk.py`**

Modify `PackageRiskScorer`:

- Keep `score_package()` signature.
- Use `PackageRiskModelRegistry`.
- Return both legacy and new keys:
  - `model_available`
  - `model_type`
  - `gnn_model_available`
  - `gnn_model_type`
  - `gnn_score`
  - `gnn_label`
  - `gnn_reasons`
  - `gnn_confidence`
  - `gnn_explanations`
  - `similar_malicious_packages`
- Preserve rule fallback output when no model is available.

- [ ] **Step 5: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_gnn_risk tests.test_dependency_gnn_serialization tests.test_knowledge_graph_gnn_properties
```

Expected:

```text
OK
```

- [ ] **Step 6: Commit**

```powershell
git add supplyguard\gnn_models.py supplyguard\gnn_risk.py tests\test_gnn_risk.py
git commit -m "feat: add unified GNN model fallback loader"
```

---

### Task 8: GraphRAG Intent, Retrieval Channels, Ranker, and Context

**Files:**
- Create: `supplyguard/graph_rag_intent.py`
- Create: `supplyguard/graph_rag_retrievers.py`
- Create: `supplyguard/graph_rag_ranker.py`
- Create: `supplyguard/graph_rag_context.py`
- Modify: `supplyguard/graph_rag.py`
- Create: `tests/test_graph_rag_intent.py`
- Create: `tests/test_graph_rag_retrievers.py`
- Modify: `tests/test_graph_rag.py`

- [ ] **Step 1: Write intent tests**

Create `tests/test_graph_rag_intent.py`:

```python
import unittest

from supplyguard.graph_rag_intent import classify_graph_rag_intent


class GraphRagIntentTests(unittest.TestCase):
    def test_dependency_question(self):
        self.assertEqual(classify_graph_rag_intent("哪些依赖与恶意包模式相似？"), "dependency_risk")

    def test_build_question(self):
        self.assertEqual(classify_graph_rag_intent("构建流程有什么风险？"), "build_risk")

    def test_runtime_question(self):
        self.assertEqual(classify_graph_rag_intent("运行期日志有没有异常外联？"), "runtime_evidence")

    def test_attack_path_question(self):
        self.assertEqual(classify_graph_rag_intent("解释这条攻击路径为什么高风险"), "attack_path")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Write retrieval channel tests**

Create `tests/test_graph_rag_retrievers.py`:

```python
import unittest

from supplyguard.graph_rag_retrievers import retrieve_channels


class GraphRagRetrieverTests(unittest.TestCase):
    def test_retrieves_keyword_risk_and_path_channels(self):
        graph = {
            "nodes": [
                {"id": "dep:evil", "label": "npm:evil", "type": "DependencyPackage", "risk": "critical", "score": 90, "description": "postinstall token", "properties": {"properties": {"gnn_score": 0.95}}},
                {"id": "ci:build", "label": "release build", "type": "CIStep", "risk": "high", "score": 70, "description": "build step", "properties": {}},
            ],
            "edges": [
                {"id": "edge:1", "source": "dep:evil", "target": "ci:build", "type": "DEPENDENCY_REACHES_BUILD"}
            ],
            "attack_paths": [
                {"id": "path:1", "title": "evil reaches build", "score": 88, "node_ids": ["dep:evil", "ci:build"]}
            ],
        }

        channels = retrieve_channels(graph, "evil build risk", intent="dependency_risk")

        self.assertTrue(channels["keyword"])
        self.assertTrue(channels["risk"])
        self.assertTrue(channels["attack_path"])
        self.assertIn("embedding", channels)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Extend end-to-end GraphRAG test**

Update `tests/test_graph_rag.py`:

```python
self.assertIn("channels", result)
self.assertIn("retrieval_trace", result)
self.assertIn("evidence_table", result)
self.assertIn("missing_evidence", result)
self.assertTrue(result["top_nodes"][0].get("why_selected"))
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_graph_rag_intent tests.test_graph_rag_retrievers tests.test_graph_rag
```

Expected:

```text
ModuleNotFoundError or FAIL for missing new GraphRAG fields
```

- [ ] **Step 5: Implement intent module**

Create `supplyguard/graph_rag_intent.py`:

```python
def classify_graph_rag_intent(query: str) -> str:
    text = query.lower()
    if any(word in text for word in ("攻击路径", "attack path", "path", "链路")):
        return "attack_path"
    if any(word in text for word in ("运行", "日志", "runtime", "log", "外联")):
        return "runtime_evidence"
    if any(word in text for word in ("构建", "ci", "cd", "build", "artifact", "流水线")):
        return "build_risk"
    if any(word in text for word in ("依赖", "包", "package", "dependency", "恶意包")):
        return "dependency_risk"
    return "general"
```

- [ ] **Step 6: Implement retrievers, ranker, and context modules**

Implementation requirements:

- `retrieve_channels(graph_payload, query, intent)` returns `keyword`, `risk`, `attack_path`, and `embedding` lists.
- `graph_rag_ranker.py` exports `rank_graph_rag_candidates(graph_payload: dict[str, Any], channels: dict[str, list[dict[str, Any]]], query: str, intent: str, *, max_nodes: int, max_edges: int, max_paths: int, hops: int) -> dict[str, list[dict[str, Any]]]` and adds `why_selected` lists to selected nodes, edges, and paths.
- `graph_rag_context.py` exports `build_evidence_table(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], paths: list[dict[str, Any]]) -> list[dict[str, Any]]`, `find_missing_evidence(intent: str, nodes: list[dict[str, Any]], paths: list[dict[str, Any]]) -> list[dict[str, Any]]`, and `build_graph_rag_context(evidence_table: list[dict[str, Any]], missing_evidence: list[dict[str, Any]], retrieval_trace: list[dict[str, Any]]) -> str`.
- Preserve current GNN score weighting and PageRank behavior.
- Add intent edge preference:
  - `dependency_risk`: `DEPENDENCY_REACHES_BUILD`, `FINDING_AFFECTS`, `PACKAGE_HAS_VULN`
  - `build_risk`: CI/CD, artifact, provenance edge names
  - `runtime_evidence`: `BUILD_TO_RUNTIME`, log/event edge names
  - `attack_path`: path overlap
- If embedding files are missing, `embedding` channel returns an empty list and retrieval continues.

- [ ] **Step 7: Update `supplyguard/graph_rag.py` orchestration**

Keep public signature:

```python
def graph_rag_retrieve(graph_payload: dict[str, Any], query: str, *, max_nodes: int = 8, max_edges: int = 12, max_paths: int = 3, hops: int = 2) -> dict[str, Any]:
```

Return old keys plus:

- `intent`
- `channels`
- `evidence_table`
- `retrieval_trace`
- `missing_evidence`

- [ ] **Step 8: Run GraphRAG tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_graph_rag_intent tests.test_graph_rag_retrievers tests.test_graph_rag
```

Expected:

```text
OK
```

- [ ] **Step 9: Commit**

```powershell
git add supplyguard\graph_rag.py supplyguard\graph_rag_intent.py supplyguard\graph_rag_retrievers.py supplyguard\graph_rag_ranker.py supplyguard\graph_rag_context.py tests\test_graph_rag.py tests\test_graph_rag_intent.py tests\test_graph_rag_retrievers.py
git commit -m "feat: add multi-channel GraphRAG retrieval"
```

---

### Task 9: Assistant and API Compatibility

**Files:**
- Modify: `supplyguard/llm_assistant.py`
- Modify: `supplyguard/routes/security.py`
- Modify: `tests/test_llm_assistant_graphrag_context.py`
- Modify: `tests/test_security_assistant_graphrag.py`

- [ ] **Step 1: Extend assistant context tests**

Update `tests/test_llm_assistant_graphrag_context.py` so the fixture includes:

```python
graph_rag = {
    "context": "GraphRAG context:\n- npm:evil gnn_score=0.91",
    "intent": "dependency_risk",
    "evidence_table": [{"kind": "dependency", "id": "dep:evil", "summary": "high risk dependency"}],
    "missing_evidence": [{"kind": "runtime_log", "reason": "no runtime log"}],
    "retrieval_trace": [{"stage": "keyword", "detail": "matched evil"}],
    "explanation": {"method": "GraphRAG", "hop_limit": 2},
}
```

Assert the generated context includes:

```python
self.assertIn("dependency_risk", context)
self.assertIn("high risk dependency", context)
self.assertIn("no runtime log", context)
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_llm_assistant_graphrag_context tests.test_security_assistant_graphrag
```

Expected:

```text
FAIL for missing structured GraphRAG fields in assistant context
```

- [ ] **Step 3: Update assistant context builder**

Modify `supplyguard/llm_assistant.py`:

- Include GraphRAG intent.
- Include evidence table rows.
- Include missing evidence rows.
- Include retrieval trace summary.
- Keep existing `graph_rag["context"]` behavior.
- Keep `assistant_retrieval_with_graph_rag()` putting GraphRAG context first.

- [ ] **Step 4: Verify route compatibility**

Review `supplyguard/routes/security.py`:

- `/assistant` still calls `graph_rag_retrieve(workspace["graph"], question)`.
- Response still contains `graph_rag`.
- Do not rename existing response keys.
- Wrap GraphRAG retrieval failure in existing defensive try/except.

- [ ] **Step 5: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_llm_assistant_graphrag_context tests.test_security_assistant_graphrag
```

Expected:

```text
OK
```

- [ ] **Step 6: Commit**

```powershell
git add supplyguard\llm_assistant.py supplyguard\routes\security.py tests\test_llm_assistant_graphrag_context.py tests\test_security_assistant_graphrag.py
git commit -m "feat: include structured GraphRAG evidence in assistant context"
```

---

### Task 10: Frontend Type and Evidence Display Upgrade

**Files:**
- Modify: `frontend/src/lib/security-api.ts`
- Modify: `frontend/src/features/security-platform/index.tsx`

- [ ] **Step 1: Extend frontend API types**

Modify `frontend/src/lib/security-api.ts`:

Add or extend:

```typescript
export interface SecurityGraphRagChannelHit {
  node_id?: string
  path_id?: string
  score?: number
  similarity?: number
  reason?: string
}

export interface SecurityGraphRagEvidenceRow {
  kind?: string
  id?: string
  summary?: string
  source?: string
}

export interface SecurityGraphRagTraceItem {
  stage?: string
  detail?: string
}

export interface SecurityGraphRagMissingEvidence {
  kind?: string
  reason?: string
}
```

Extend existing GraphRAG result type with:

```typescript
intent?: string
channels?: Record<string, SecurityGraphRagChannelHit[]>
evidence_table?: SecurityGraphRagEvidenceRow[]
retrieval_trace?: SecurityGraphRagTraceItem[]
missing_evidence?: SecurityGraphRagMissingEvidence[]
```

Extend dependency type with:

```typescript
gnn_confidence?: number
gnn_explanations?: string[]
similar_malicious_packages?: Array<{ package?: string; ecosystem?: string; score?: number; reason?: string }>
```

- [ ] **Step 2: Update UI display**

Modify `frontend/src/features/security-platform/index.tsx`:

- In dependency details, show:
  - `gnn_model_type`
  - `gnn_confidence`
  - first three `similar_malicious_packages`
  - `gnn_explanations`
- In GraphRAG evidence card, show:
  - intent
  - channel hit counts
  - first five evidence table rows
  - first five retrieval trace rows
  - first five missing evidence rows
  - `why_selected` when present on top nodes or paths

Keep layout within existing panels. Do not redesign navigation.

- [ ] **Step 3: Build frontend**

Run:

```powershell
npm run build
```

Workdir:

```text
D:\NUAA\信息安全竞赛\Security\.worktrees\graphrag-gnn\frontend
```

Expected:

```text
✓ built
```

- [ ] **Step 4: Commit**

```powershell
git add frontend\src\lib\security-api.ts frontend\src\features\security-platform\index.tsx
git commit -m "feat: show GraphRAG channels and GNN model evidence"
```

---

### Task 11: GraphRAG Retrieval Evaluator

**Files:**
- Create: `scripts/graphrag/evaluate_retrieval.py`
- Create: `tests/test_graphrag_evaluate_retrieval.py`

- [ ] **Step 1: Write failing evaluator test**

Create `tests/test_graphrag_evaluate_retrieval.py`:

```python
import unittest

from scripts.graphrag.evaluate_retrieval import evaluate_retrieval_cases


class GraphRagEvaluationTests(unittest.TestCase):
    def test_evaluates_dependency_and_path_recall(self):
        cases = [
            {
                "query": "evil dependency risk",
                "expected_node_ids": ["dep:evil"],
                "expected_path_ids": ["path:1"],
                "result": {
                    "top_nodes": [{"id": "dep:evil"}],
                    "top_attack_paths": [{"id": "path:1"}],
                    "evidence_table": [{"id": "dep:evil"}],
                    "retrieval_trace": [{"stage": "keyword"}],
                },
            }
        ]

        metrics = evaluate_retrieval_cases(cases)

        self.assertEqual(metrics["case_count"], 1)
        self.assertEqual(metrics["target_dependency_recall"], 1.0)
        self.assertEqual(metrics["target_attack_path_recall"], 1.0)
        self.assertEqual(metrics["retrieval_trace_completeness"], 1.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_graphrag_evaluate_retrieval
```

Expected:

```text
ModuleNotFoundError
```

- [ ] **Step 3: Implement evaluator**

Create `scripts/graphrag/evaluate_retrieval.py`.

Public API:

```python
def evaluate_retrieval_cases(cases: list[dict[str, Any]]) -> dict[str, Any]:
```

Implementation requirements:

- `target_dependency_recall`: average per-case hit rate for expected node ids in top nodes.
- `target_attack_path_recall`: average per-case hit rate for expected path ids in top attack paths.
- `evidence_coverage`: fraction of cases with non-empty evidence table.
- `retrieval_trace_completeness`: fraction of cases with non-empty retrieval trace.
- CLI supports `--cases-json`, `--output`.

- [ ] **Step 4: Run tests**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest tests.test_graphrag_evaluate_retrieval
```

Expected:

```text
Ran 1 test
OK
```

- [ ] **Step 5: Commit**

```powershell
git add scripts\graphrag\evaluate_retrieval.py tests\test_graphrag_evaluate_retrieval.py
git commit -m "feat: add GraphRAG retrieval evaluator"
```

---

### Task 12: Run Data Pipeline and PyG Training

**Files:**
- Generated ignored artifacts under `storage/gnn_datasets`
- Generated ignored artifacts under `storage/graph_models`

- [ ] **Step 1: Rebuild weak negatives**

Run:

```powershell
D:\Anaconda3\python.exe scripts\gnn\build_weak_negatives.py --root . --output storage\gnn_datasets\weak_negative_packages.jsonl --positive-path storage\gnn_datasets\malicious_packages.jsonl
```

Expected:

```text
JSON summary with written greater than 0
```

- [ ] **Step 2: Build ecosystem negatives from local metadata if available**

If local metadata exists, run:

```powershell
D:\Anaconda3\python.exe scripts\gnn\build_ecosystem_negatives.py --metadata D:\datasets\package-metadata\npm_pypi_metadata.jsonl --positive-path storage\gnn_datasets\malicious_packages.jsonl --output storage\gnn_datasets\ecosystem_negative_packages.jsonl --limit-per-ecosystem 10000
```

If the metadata file does not exist, create a small local seed file from current weak negatives:

```powershell
Copy-Item storage\gnn_datasets\weak_negative_packages.jsonl storage\gnn_datasets\ecosystem_negative_packages.jsonl
```

Expected:

```text
ecosystem_negative_packages.jsonl exists
```

- [ ] **Step 3: Build hard negatives**

Run:

```powershell
D:\Anaconda3\python.exe scripts\gnn\build_hard_negatives.py --negative-path storage\gnn_datasets\ecosystem_negative_packages.jsonl --output storage\gnn_datasets\hard_negative_packages.jsonl --limit 5000
```

Expected:

```text
JSON summary with written key
```

- [ ] **Step 4: Rebuild graph features**

Run:

```powershell
D:\Anaconda3\python.exe scripts\gnn\build_graph_features.py --positive storage\gnn_datasets\malicious_packages.jsonl --negative storage\gnn_datasets\weak_negative_packages.jsonl --negative storage\gnn_datasets\ecosystem_negative_packages.jsonl --negative storage\gnn_datasets\hard_negative_packages.jsonl --output storage\gnn_datasets\features
```

Expected files:

```text
storage\gnn_datasets\features\train_nodes.jsonl
storage\gnn_datasets\features\train_edges.jsonl
storage\gnn_datasets\features\feature_schema.json
storage\gnn_datasets\features\splits.json
storage\gnn_datasets\features\dataset_card.json
```

- [ ] **Step 5: Train PyG model in dedicated environment**

Run inside `supplyguard-gnn`:

```powershell
python scripts\gnn\train_pyg_graphsage_package_risk.py --data storage\gnn_datasets\features --output storage\graph_models --epochs 80 --hidden-dim 64 --learning-rate 0.01 --dropout 0.3 --random-state 42
```

Expected files:

```text
storage\graph_models\package_risk_graphsage.pt
storage\graph_models\package_risk_graphsage_metadata.json
storage\graph_models\package_embeddings.npy
storage\graph_models\package_embedding_index.json
storage\graph_models\graphsage_eval.json
```

- [ ] **Step 6: Verify backend can still load fallback in base env**

Run:

```powershell
D:\Anaconda3\python.exe -c "from supplyguard.gnn_risk import PackageRiskScorer; s=PackageRiskScorer('storage/graph_models'); print(s.score_package('npm','evil','1.0.0',['postinstall token'],[]))"
```

Expected:

```text
Printed dictionary includes gnn_score and gnn_model_type
```

- [ ] **Step 7: Do not commit generated model artifacts**

Run:

```powershell
git status --short storage
```

Expected:

```text
No tracked storage artifacts are staged
```

---

### Task 13: Documentation and Optimization Report

**Files:**
- Modify: `docs/graphrag-gnn-implementation.md`
- Create: `docs/graphrag-gnn-optimization-report.md`

- [ ] **Step 1: Update implementation doc**

Modify `docs/graphrag-gnn-implementation.md`:

- Add PyG GraphSAGE as preferred model.
- Keep NumPy GraphSAGE and sklearn as fallback.
- Add `splits.json` and `dataset_card.json`.
- Add GraphRAG channels, intent, reranking, evidence table, retrieval trace, and missing evidence.
- Add commands from Task 12.

- [ ] **Step 2: Add optimization report**

Create `docs/graphrag-gnn-optimization-report.md` with sections:

```markdown
# GraphRAG + GNN 优化报告

## 摘要

本轮优化将原有 NumPy GraphSAGE 风格模型升级为 PyTorch Geometric GraphSAGE，并将 GraphRAG 从关键词 + 2 跳扩展增强为多路召回、路径约束、GNN embedding 重排和结构化证据压缩。

## 数据集

- 正样本：
- 弱负样本：
- 生态负样本：
- hard negatives：
- train/validation/test：

## GNN 训练结果

从 `storage/graph_models/graphsage_eval.json` 填入 accuracy、precision、recall、F1、ROC-AUC、PR-AUC 和 top-k hit rate。

## GraphRAG 检索结果

从 `storage/eval/graphrag_eval.json` 填入 target dependency recall、target attack path recall、evidence coverage 和 retrieval trace completeness。

## 系统集成

- 后端模型加载优先级：
- GraphRAG 输出字段：
- 前端展示增强：

## 风险与限制

- 负样本仍可能包含未发现风险包。
- PyG 模型质量依赖生态负样本覆盖。
- 运行时单包推理缺少完整邻居上下文时会使用 fallback 特征。
```

- [ ] **Step 3: Verify docs render as text**

Run:

```powershell
Get-Content -Encoding UTF8 docs\graphrag-gnn-implementation.md | Select-Object -First 5
Get-Content -Encoding UTF8 docs\graphrag-gnn-optimization-report.md | Select-Object -First 5
```

Expected:

```text
Readable Chinese Markdown headings
```

- [ ] **Step 4: Commit**

```powershell
git add docs\graphrag-gnn-implementation.md docs\graphrag-gnn-optimization-report.md
git commit -m "docs: update GraphRAG GNN optimization report"
```

---

### Task 14: Full Verification

**Files:**
- No source edits unless verification reveals failures.

- [ ] **Step 1: Run Python test suite**

Run:

```powershell
D:\Anaconda3\python.exe -m unittest discover -s tests
```

Expected:

```text
OK
```

- [ ] **Step 2: Run Python compile check**

Run:

```powershell
D:\Anaconda3\python.exe -m py_compile supplyguard\gnn_models.py supplyguard\gnn_risk.py supplyguard\graph_rag.py supplyguard\graph_rag_intent.py supplyguard\graph_rag_retrievers.py supplyguard\graph_rag_ranker.py supplyguard\graph_rag_context.py supplyguard\llm_assistant.py supplyguard\routes\security.py scripts\gnn\dataset_utils.py scripts\gnn\build_ecosystem_negatives.py scripts\gnn\build_hard_negatives.py scripts\gnn\build_graph_features.py scripts\gnn\train_pyg_graphsage_package_risk.py scripts\gnn\evaluate_package_risk.py scripts\graphrag\evaluate_retrieval.py
```

Expected:

```text
No output and exit code 0
```

- [ ] **Step 3: Run frontend build**

Run:

```powershell
npm run build
```

Workdir:

```text
D:\NUAA\信息安全竞赛\Security\.worktrees\graphrag-gnn\frontend
```

Expected:

```text
✓ built
```

- [ ] **Step 4: Run PyG smoke test in dedicated environment**

Run inside `supplyguard-gnn`:

```powershell
python -m unittest tests.test_gnn_train_pyg_graphsage_contract
```

Expected:

```text
OK
```

- [ ] **Step 5: Check git status**

Run:

```powershell
git status --short
```

Expected:

```text
Only intended source, test, and doc files are modified or untracked. storage artifacts remain ignored.
```

- [ ] **Step 6: Commit final verification fixes if any**

If verification required fixes, commit them:

```powershell
git add supplyguard scripts tests docs frontend\src\lib\security-api.ts frontend\src\features\security-platform\index.tsx requirements-gnn-pyg.txt
git commit -m "test: verify GraphRAG GNN standard upgrade"
```

Do not commit generated files under `storage/gnn_datasets`, `storage/graph_models`, `storage/eval`, `frontend/dist`, or `frontend/node_modules`.

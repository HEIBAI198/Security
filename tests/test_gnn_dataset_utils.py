import json
import tempfile
import unittest
from pathlib import Path

from scripts.gnn.dataset_utils import (
    grouped_train_val_test_split,
    normalize_package_name,
    package_group_key,
    read_jsonl,
    write_jsonl,
)


class GNNDatasetUtilsTests(unittest.TestCase):
    def test_normalizes_package_names_for_supported_ecosystems(self):
        self.assertEqual(normalize_package_name("My_Pkg.Name", "pypi"), "my-pkg-name")
        self.assertEqual(normalize_package_name("@Scope/My_Pkg", "npm"), "@scope/my_pkg")

    def test_package_group_key_uses_ecosystem_and_normalized_package(self):
        node = {"id": "pkg:npm:left-pad", "ecosystem": "npm", "package": "Left-Pad"}

        self.assertEqual(package_group_key(node), "npm:left-pad")

    def test_grouped_split_keeps_versions_from_same_package_in_one_split(self):
        nodes = [
            {"id": "pkg:npm:a:1", "ecosystem": "npm", "package": "a", "label": 1},
            {"id": "pkg:npm:a:2", "ecosystem": "npm", "package": "a", "label": 1},
            {"id": "pkg:npm:b", "ecosystem": "npm", "package": "b", "label": 0},
            {"id": "pkg:npm:c", "ecosystem": "npm", "package": "c", "label": 0},
            {"id": "pkg:pypi:d", "ecosystem": "pypi", "package": "d", "label": 1},
            {"id": "pkg:pypi:e", "ecosystem": "pypi", "package": "e", "label": 0},
        ]

        splits = grouped_train_val_test_split(
            nodes,
            train_ratio=0.5,
            val_ratio=0.25,
            random_state=7,
        )

        group_split = {}
        id_to_node = {node["id"]: node for node in nodes}
        for split_name, node_ids in splits.items():
            for node_id in node_ids:
                key = package_group_key(id_to_node[node_id])
                previous = group_split.setdefault(key, split_name)
                self.assertEqual(previous, split_name)

        self.assertEqual(set(splits), {"train", "val", "test"})
        self.assertEqual(sum(len(value) for value in splits.values()), len(nodes))

    def test_jsonl_helpers_create_parent_directories_and_preserve_utf8(self):
        records = [
            {"ecosystem": "npm", "package": "left-pad", "text": "安装脚本"},
            {"ecosystem": "pypi", "package": "requests-toolbelt", "label": 0},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "nested" / "dataset.jsonl"

            write_jsonl(output_path, records)

            self.assertTrue(output_path.exists())
            self.assertEqual(read_jsonl(output_path), records)
            first_line = output_path.read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(json.loads(first_line)["text"], "安装脚本")


if __name__ == "__main__":
    unittest.main()

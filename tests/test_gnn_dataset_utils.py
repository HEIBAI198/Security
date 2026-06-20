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

    def test_package_group_key_parses_ids_when_package_is_absent(self):
        cases = [
            ({"id": "pkg:npm:a:1"}, "npm:a"),
            ({"id": "pkg:npm:a:2"}, "npm:a"),
            ({"id": "pkg:pypi:My_Pkg:1.0.0"}, "pypi:my-pkg"),
            ({"id": "pkg:npm/left-pad@1.0.0"}, "npm:left-pad"),
            ({"id": "pkg:pypi/Requests_Toolbelt@0.10.1"}, "pypi:requests-toolbelt"),
            ({"id": "pkg:npm/@scope/pkg@1.2.3"}, "npm:@scope/pkg"),
        ]

        for record, expected in cases:
            with self.subTest(record=record):
                self.assertEqual(package_group_key(record), expected)

    def test_grouped_split_handles_empty_and_small_group_counts(self):
        self.assertEqual(
            grouped_train_val_test_split([]),
            {"train": [], "val": [], "test": []},
        )

        one_group_nodes = [
            {"id": "pkg:npm:a:1", "ecosystem": "npm", "package": "a"},
            {"id": "pkg:npm:a:2", "ecosystem": "npm", "package": "a"},
        ]
        one_group_splits = grouped_train_val_test_split(one_group_nodes)
        self.assertEqual(one_group_splits["train"], ["pkg:npm:a:1", "pkg:npm:a:2"])
        self.assertEqual(one_group_splits["val"], [])
        self.assertEqual(one_group_splits["test"], [])

        two_group_nodes = [
            {"id": "pkg:npm:a", "ecosystem": "npm", "package": "a"},
            {"id": "pkg:npm:b", "ecosystem": "npm", "package": "b"},
        ]
        two_group_splits = grouped_train_val_test_split(
            two_group_nodes,
            random_state=11,
        )
        self.assertTrue(two_group_splits["train"])
        self.assertTrue(two_group_splits["val"])
        self.assertEqual(two_group_splits["test"], [])
        self.assertEqual(
            sum(len(value) for value in two_group_splits.values()),
            len(two_group_nodes),
        )
        _assert_group_keys_stay_in_one_split(two_group_nodes, two_group_splits)

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

        _assert_group_keys_stay_in_one_split(nodes, splits)
        self.assertEqual(set(splits), {"train", "val", "test"})
        self.assertEqual(sum(len(value) for value in splits.values()), len(nodes))

    def test_grouped_split_uses_id_fallback_without_version_leakage(self):
        nodes = [
            {"id": "pkg:npm:a:1", "label": 1},
            {"id": "pkg:npm:a:2", "label": 1},
            {"id": "pkg:pypi/Requests_Toolbelt@0.10.1", "label": 0},
            {"id": "pkg:pypi/Requests_Toolbelt@0.10.2", "label": 0},
            {"id": "pkg:npm/@scope/pkg@1.2.3", "label": 1},
            {"id": "pkg:npm/@scope/pkg@1.2.4", "label": 1},
        ]

        splits = grouped_train_val_test_split(
            nodes,
            train_ratio=0.5,
            val_ratio=0.25,
            random_state=3,
        )

        _assert_group_keys_stay_in_one_split(nodes, splits)
        self.assertTrue(splits["train"])
        self.assertEqual(sum(len(value) for value in splits.values()), len(nodes))

    def test_grouped_split_rejects_invalid_ratios(self):
        nodes = [{"id": "pkg:npm:a", "ecosystem": "npm", "package": "a"}]

        with self.assertRaisesRegex(ValueError, "train_ratio"):
            grouped_train_val_test_split(nodes, train_ratio=-0.1)

        with self.assertRaisesRegex(ValueError, "train_ratio \\+ val_ratio"):
            grouped_train_val_test_split(nodes, train_ratio=0.8, val_ratio=0.3)

    def test_jsonl_helpers_create_parent_directories_and_preserve_utf8(self):
        records = [
            {
                "ecosystem": "npm",
                "package": "left-pad",
                "text": "install script \u5b89\u88c5",
            },
            {"ecosystem": "pypi", "package": "requests-toolbelt", "label": 0},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "nested" / "dataset.jsonl"

            write_jsonl(output_path, records)

            self.assertTrue(output_path.exists())
            self.assertEqual(read_jsonl(output_path), records)
            first_line = output_path.read_text(encoding="utf-8").splitlines()[0]
            self.assertEqual(json.loads(first_line)["text"], "install script \u5b89\u88c5")

    def test_read_jsonl_reports_non_object_rows_with_path_and_line_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "dataset.jsonl"
            input_path.write_text('{"ok": true}\n["not", "object"]\n', encoding="utf-8")

            with self.assertRaises(ValueError) as raised:
                read_jsonl(input_path)

            message = str(raised.exception)
            self.assertIn(str(input_path), message)
            self.assertIn("line 2", message)
            self.assertIn("object", message)

    def test_read_jsonl_wraps_decode_errors_with_path_and_line_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "dataset.jsonl"
            input_path.write_text('{"ok": true}\n{bad json}\n', encoding="utf-8")

            with self.assertRaises(ValueError) as raised:
                read_jsonl(input_path)

            message = str(raised.exception)
            self.assertIn(str(input_path), message)
            self.assertIn("line 2", message)
            self.assertIn("invalid JSON", message)


def _assert_group_keys_stay_in_one_split(
    nodes: list[dict[str, object]],
    splits: dict[str, list[str]],
) -> None:
    group_split: dict[str, str] = {}
    id_to_node = {str(node["id"]): node for node in nodes}
    for split_name, node_ids in splits.items():
        for node_id in node_ids:
            key = package_group_key(id_to_node[node_id])
            previous = group_split.setdefault(key, split_name)
            if previous != split_name:
                raise AssertionError(
                    f"group {key!r} appears in both {previous!r} and {split_name!r}"
                )


if __name__ == "__main__":
    unittest.main()

"""Packages reserved as held-out demo/business cases.

These packages are used by the runtime acceptance and business evaluation, so
they must never appear in the training/validation/test data. The list mirrors
DEMO_CALIBRATED_PACKAGES in supplyguard.gnn_risk plus the trainer sanity cases.
"""

from __future__ import annotations


HELD_OUT_DEMO_PACKAGES: list[str] = [
    "npm:axios",
    "npm:codecov-uploader-mirror",
    "npm:electron",
    "npm:event-stream",
    "npm:express",
    "npm:flatmap-stream",
    "npm:got",
    "npm:jest",
    "npm:left-pad",
    "npm:node-fetch",
    "npm:npm-audit-helper",
    "npm:orion-build-utils",
    "npm:react",
    "npm:third-party-release-helper",
    "npm:vendor-electron-builder",
    "npm:x-trader-codec",
    "pypi:flask",
    "pypi:numpy",
    "pypi:requests",
]

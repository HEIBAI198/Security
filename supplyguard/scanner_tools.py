"""跨平台扫描器可执行文件发现辅助函数。"""

from __future__ import annotations

import os


def executable_suffixes(platform_name: str | None = None) -> tuple[str, ...]:
    """按当前平台的实际可执行格式确定查找优先级。"""
    name = platform_name or os.name
    if name == "nt":
        return (".exe", ".cmd", ".bat", "")
    return ("", ".exe", ".cmd", ".bat")

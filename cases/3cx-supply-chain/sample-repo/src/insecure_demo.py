"""仅用于 SupplyGuard 静态扫描演示，请勿在生产代码中使用。"""

import pickle
import subprocess


# 以下均为不可用的演示凭据，只用于验证密钥泄露检测规则。
AWS_ACCESS_KEY_ID = "AKIAZ3N7C5X9Q2M8R4T6"
AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYZ7q1X9Fake"
GITHUB_TOKEN = "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4P5q6"


def package_release(output_name: str) -> subprocess.CompletedProcess[str]:
    """演示命令注入风险：外部输入被拼接后交给 shell 执行。"""
    command = f"tar -czf {output_name} ./dist"
    return subprocess.run(command, shell=True, check=False, text=True)


def restore_cache(payload: bytes) -> object:
    """演示不安全反序列化风险：直接读取不可信的 pickle 数据。"""
    return pickle.loads(payload)

# Codecov Bash Uploader Defensive Replay

本案例是 Codecov Bash Uploader 事件的防御性复盘夹具，只模拟 CI 覆盖率上传脚本被污染后的检测信号，不包含真实恶意脚本或有效外联地址。

## 演示重点

- CI workflow 使用未固定第三方 Action。
- workflow 具有 `permissions: write-all`。
- 覆盖率上传步骤存在 `curl | bash` 风险。
- artifact attestation 中的 subject digest 与真实产物不一致。
- 构建日志出现合成的外联和凭据轮换证据。

## 手动导入路径

```text
cases/codecov-bash-uploader/sample-repo
```

产物和日志：

```text
cases/codecov-bash-uploader/artifacts/coverage-report.tar.gz
cases/codecov-bash-uploader/artifacts/coverage-report.intoto.jsonl
cases/codecov-bash-uploader/logs/ci-build.jsonl
cases/codecov-bash-uploader/logs/security-response.log
```

# event-stream / flatmap-stream Defensive Replay

本案例是 event-stream 事件的防御性复盘夹具，只模拟 npm 传递依赖投毒的检测信号。所有脚本均为占位输出，不包含真实恶意逻辑。

## 演示重点

- `event-stream` 作为顶层依赖进入项目。
- `flatmap-stream` 作为传递依赖出现在 lockfile，并带有安装脚本信号。
- CI workflow 存在未固定 Action、过宽权限和远程脚本执行风险。
- 发布产物的 attestation subject digest 不匹配。
- 运行日志中出现合成的外联和敏感接口访问证据。

## 手动导入路径

```text
cases/event-stream-flatmap/sample-repo
```

产物和日志：

```text
cases/event-stream-flatmap/artifacts/wallet-web-bundle.tar.gz
cases/event-stream-flatmap/artifacts/wallet-web-bundle.intoto.jsonl
cases/event-stream-flatmap/logs/wallet-runtime.jsonl
cases/event-stream-flatmap/logs/build-runner.log
```

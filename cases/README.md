# APT Supply Chain Replay Cases

This directory contains four defensive replay cases for the contest topic
`APT 供应链攻击检测与溯源系统`.

The cases do not contain real malware, real exploit payloads, or live attacker
infrastructure. They are safe simulations built from public reporting patterns
so SupplyGuard KG can demonstrate detection, evidence fusion, graph tracing, and
report generation.

## Cases

| Case | Public reference | Simulated focus |
| --- | --- | --- |
| `solarwinds-sunburst` | CISA SolarWinds advisory and MITRE C0024 | Build/update chain contamination, artifact trust failure, runtime egress |
| `3cx-supply-chain` | Mandiant 3CX report and MITRE C0057 | Cascaded X_TRADER to 3CX build compromise, desktop artifact risk, endpoint egress |
| `codecov-bash-uploader` | Codecov Bash Uploader security update and CISA alert | CI uploader script contamination, workflow secret exposure risk, artifact trust failure |
| `event-stream-flatmap` | npm event-stream incident write-up | npm transitive dependency compromise, install script signal, runtime sensitive API evidence |

## One-command replay

Start the backend first:

```powershell
python server.py --host 127.0.0.1 --port 8000
```

Run one case:

```powershell
.\scripts\run-case-replay.ps1 -Case solarwinds
.\scripts\run-case-replay.ps1 -Case 3cx
.\scripts\run-case-replay.ps1 -Case codecov
.\scripts\run-case-replay.ps1 -Case eventstream
```

Run both:

```powershell
.\scripts\run-case-replay.ps1 -Case all
```

The script writes JSON scan results and a Markdown workspace report to each
case's `results/` directory.

## Manual UI replay

Open:

```text
http://127.0.0.1:8000/project-import
```

Import one local directory:

```text
cases/solarwinds-sunburst/sample-repo
cases/3cx-supply-chain/sample-repo
cases/codecov-bash-uploader/sample-repo
cases/event-stream-flatmap/sample-repo
```

Then review:

```text
溯源总览
供应链组件
CI/CD 构建链
产物可信
日志印证
攻击路径图谱
溯源报告
```

For artifact trust and logs, use files from the selected case's `artifacts/`
and `logs/` directories.

## Defense-only boundary

- Domains use `example.invalid`; IP addresses are synthetic indicators for
  scanner validation and are not used by any executable payload.
- Payload files are text placeholders.
- Suspicious scripts only echo simulated behavior.
- The purpose is to verify detection and traceability, not to reproduce an
  intrusion.

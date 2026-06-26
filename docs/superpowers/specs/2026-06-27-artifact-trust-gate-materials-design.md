# Artifact Trust Gate Materials Design

## Goal

Refine the artifact trust gate frontend so users can clearly prepare release gate materials before verification. The UI must show which materials are required, which are optional, and what status each material is in. The content of uploaded files does not need to be displayed in the frontend.

This is a frontend design and state-marking change only. It does not expand the backend upload contract. The current verification path still requires the artifact file and the attestation/provenance file when using upload verification.

## Existing Context

The security workspace already has an `ArtifactTrustPanel` in `frontend/src/features/security-platform/index.tsx`. It can run the artifact trust scan and upload an artifact plus attestation through `uploadArtifactTrustScan`.

The backend upload endpoint currently accepts:

- `artifact`
- `attestation`
- policy-related form fields such as expected repo, expected commit, allowed workflows, allowed builders, signature requirement, runner policy, and max age

The frontend currently exposes artifact and attestation file inputs, plus some policy configuration fields. It does not yet present the full release gate material set as a structured checklist with required and optional status.

## Material Model

The artifact trust gate should present a material checklist with five user-facing material groups.

Required:

- Artifact: release or build output, such as `3cx-desktop-app.tar.gz`, `app.exe`, `app.zip`, `npm-package.tgz`, or a Docker image digest.
- Attestation / Provenance: source proof, such as `3cx-desktop-app.intoto.jsonl`, `provenance.json`, SLSA provenance, or GitHub Artifact Attestation.

Optional:

- Policy: release gate policy, such as `.supplyguard/trust-policy.yml`, allowed workflow, trusted builder, branch, runner, freshness, and signature requirements.
- Signature / Certificate / Transparency Log Proof: signature material, certificate chain, cosign proof, GitHub attestation verification proof, Rekor or other transparency log evidence.
- Expected Release Information: expected repository, commit, branch or tag, release workflow, builder identity, subject name, expected digest, release version, or publish target.

Only the two required material groups are needed to start upload verification. Optional groups improve clarity and explainability but do not block the basic gate run.

## UI Design

Use a "gate material checklist" panel in the current artifact trust gate input area. The panel should replace the plain pair of file inputs with a more explicit preparation surface.

Each material row or card should contain:

- Material name
- Required or optional badge
- Status badge
- Short examples
- Control area for file selection or configuration
- A concise note describing how the material affects the gate

The design should stay compact and operational, matching the existing security console style. It should not become a marketing-style upload page or a long wizard.

Suggested layout:

```text
补充文件 / 门禁材料

[必填] Artifact                         [待补充 / 已选择]
       示例: 3cx-desktop-app.tar.gz, app.exe, app.zip, npm-package.tgz, docker image digest
       [选择文件]

[必填] Attestation / Provenance          [待补充 / 已选择]
       示例: .intoto.jsonl, provenance.json, SLSA provenance, GitHub Artifact Attestation
       [选择文件]

[选填] Policy                            [未提供 / 已配置]
       示例: .supplyguard/trust-policy.yml, allowed workflow, trusted builder
       [展开配置]

[选填] Signature / Certificate / Log      [未提供]
       示例: cosign proof, certificate chain, Rekor log proof
       [占位状态]

[选填] Expected Release Information       [未提供 / 已配置]
       示例: repo, commit, workflow, builder, release version
       [展开配置]
```

## Status Rules

Required material states:

- `待补充`: no file selected and no verified result is available.
- `已选择`: the user has selected a file but has not run verification yet.
- `已用于验证`: the latest verification result includes the material.
- `缺失`: a verification attempt was requested without the material.

Optional material states:

- `未提供`: no optional material or configuration has been supplied.
- `已配置`: the user has entered configuration or selected a frontend-only readiness marker for optional material.
- `可增强判断`: optional evidence is absent, but the gate can still run with required materials.
- `已纳入说明`: the latest result or detail panel can explain that this material was considered through policy fields or verification output.

Button behavior:

- If Artifact and Attestation / Provenance are both selected, the primary action is enabled and reads `执行门禁验证`.
- If either required file is missing, the primary action is disabled and reads `补齐必填材料后验证`.
- If the user triggers verification through another affordance while required files are missing, show a toast: `请先补充产物文件和来源证明`.
- Optional missing materials must not disable the primary action.

Gate summary behavior:

- If required materials are missing, show `材料不完整，暂不能执行可信验证`.
- If optional materials are missing but required materials are present, show `未提供选填增强材料，验证将基于 artifact 与 provenance 执行`.
- If optional configuration is present, show it as part of the gate material readiness summary without exposing file contents.

## Data Flow

The upload verification data flow remains unchanged:

1. User selects Artifact.
2. User selects Attestation / Provenance.
3. User may fill optional policy and expected release information fields.
4. Frontend calls `uploadArtifactTrustScan` with the existing supported payload.
5. Result is applied to the current security workspace through the existing `onScanned` path.

Optional file-like materials that do not have backend fields yet should be represented as frontend readiness states and explanatory text only. They should not be silently sent or packed into unrelated fields.

Policy and expected release information can continue to map to the existing supported fields:

- `expectedRepo`
- `expectedCommit`
- `allowedWorkflows`
- `allowedBuilders`
- `requireSignature`
- `allowSelfHostedRunner`
- `maxAgeHours`

## Error Handling

Required file missing:

- Keep the related row/card in a warning state.
- Do not call the backend upload endpoint.
- Show a direct message naming the missing material.

Unsupported optional material:

- Do not treat it as an error because this design is frontend-only.
- Mark the row as `未提供` or `占位状态`.
- Explain through helper copy that this material can enhance future verification but is not required for the current upload path.

Backend verification failure:

- Preserve the current error handling path.
- Keep selected material states visible so the user can see what was submitted.
- Do not clear selected files automatically.

## Testing And Verification

Frontend tests should cover:

- Artifact and Attestation / Provenance are labeled as required.
- Policy, Signature / Certificate / Transparency Log Proof, and Expected Release Information are labeled as optional.
- The primary verification button is disabled when either required file is missing.
- Missing optional materials do not disable verification.
- The UI shows the correct helper text for incomplete required materials and missing optional enhancement materials.

Build verification should include:

- `npm run build` in `frontend`

## Scope Boundaries

In scope:

- Artifact trust gate frontend material checklist.
- Required and optional badges.
- Material status labels.
- Disabled/enabled verification affordance based on required files.
- Explanatory frontend copy for missing required and optional materials.

Out of scope:

- Backend endpoint changes.
- Storing optional uploaded policy, signature, certificate, transparency log, or release metadata files.
- Parsing or previewing uploaded file contents in the frontend.
- Changing artifact trust scoring logic.
- Changing graph, report, or workspace data models.

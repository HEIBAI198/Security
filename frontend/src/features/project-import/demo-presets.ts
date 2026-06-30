export type DemoPresetKey = '3cx' | 'solarwinds' | 'codecov' | 'eventstream'

export type DemoPreset = {
  label: string
  description: string
  projectName: string
  localPath: string
  artifactPath: string
  attestationPath: string
  expectedRepo: string
  expectedCommit: string
  allowedWorkflows: string[]
  allowedBuilders: string[]
  logPaths: string[]
  allowSelfHostedRunner: boolean
}

export const demoPresets: Record<DemoPresetKey, DemoPreset> = {
  '3cx': {
    label: '3CX X_TRADER replay',
    description: '演示依赖包、构建链、产物可信和运行期外联如何互相印证。',
    projectName: '3CX X_TRADER replay',
    localPath: 'cases/3cx-supply-chain/sample-repo',
    artifactPath: 'cases/3cx-supply-chain/artifacts/3cx-desktop-app.tar.gz',
    attestationPath: 'cases/3cx-supply-chain/artifacts/3cx-desktop-app.intoto.jsonl',
    expectedRepo: 'https://github.com/3cx/desktop-app',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/desktop-release.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    logPaths: [
      'cases/3cx-supply-chain/logs/build-runner.jsonl',
      'cases/3cx-supply-chain/logs/customer-endpoint.jsonl',
    ],
    allowSelfHostedRunner: false,
  },
  solarwinds: {
    label: 'SolarWinds SUNBURST replay',
    description: '演示构建/更新链污染、产物来源异常和运行期外联证据。',
    projectName: 'SolarWinds SUNBURST replay',
    localPath: 'cases/solarwinds-sunburst/sample-repo',
    artifactPath: 'cases/solarwinds-sunburst/artifacts/orion-update.tar.gz',
    attestationPath: 'cases/solarwinds-sunburst/artifacts/orion-update.intoto.jsonl',
    expectedRepo: 'https://github.com/solarwinds/orion-platform',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/release.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    logPaths: [
      'cases/solarwinds-sunburst/logs/build-runner.jsonl',
      'cases/solarwinds-sunburst/logs/orion-runtime.jsonl',
    ],
    allowSelfHostedRunner: false,
  },
  codecov: {
    label: 'Codecov Bash Uploader replay',
    description: '演示 CI 上传脚本污染、凭据暴露风险、产物证明异常和响应日志如何串联。',
    projectName: 'Codecov Bash Uploader replay',
    localPath: 'cases/codecov-bash-uploader/sample-repo',
    artifactPath: 'cases/codecov-bash-uploader/artifacts/coverage-report.tar.gz',
    attestationPath: 'cases/codecov-bash-uploader/artifacts/coverage-report.intoto.jsonl',
    expectedRepo: 'https://github.com/codecov/example-service',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/coverage.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    logPaths: [
      'cases/codecov-bash-uploader/logs/ci-build.jsonl',
      'cases/codecov-bash-uploader/logs/security-response.log',
    ],
    allowSelfHostedRunner: false,
  },
  eventstream: {
    label: 'event-stream / flatmap-stream replay',
    description: '演示 npm 传递依赖投毒、安装脚本信号、构建链风险和运行期敏感访问如何形成证据链。',
    projectName: 'event-stream flatmap-stream replay',
    localPath: 'cases/event-stream-flatmap/sample-repo',
    artifactPath: 'cases/event-stream-flatmap/artifacts/wallet-web-bundle.tar.gz',
    attestationPath: 'cases/event-stream-flatmap/artifacts/wallet-web-bundle.intoto.jsonl',
    expectedRepo: 'https://github.com/example/wallet-web',
    expectedCommit: '8f42c19',
    allowedWorkflows: ['.github/workflows/wallet-release.yml'],
    allowedBuilders: ['https://github.com/actions/runner'],
    logPaths: [
      'cases/event-stream-flatmap/logs/build-runner.log',
      'cases/event-stream-flatmap/logs/wallet-runtime.jsonl',
    ],
    allowSelfHostedRunner: false,
  },
}

export function presetKeyFromProject(projectName?: string, sourcePath?: string) {
  const value = `${projectName || ''} ${sourcePath || ''}`.toLowerCase()
  if (value.includes('3cx') || value.includes('x_trader')) return '3cx'
  if (value.includes('solarwinds') || value.includes('sunburst')) return 'solarwinds'
  if (value.includes('codecov') || value.includes('bash-uploader')) return 'codecov'
  if (value.includes('event-stream') || value.includes('flatmap')) return 'eventstream'
  return null
}

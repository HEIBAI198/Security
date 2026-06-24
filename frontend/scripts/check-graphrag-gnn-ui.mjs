import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'src/features/security-platform/index.tsx'), 'utf-8')

const requiredSnippets = [
  'function DependencyGnnEvidence',
  'function DependencyGnnSummary',
  'function ReachabilityGnnSummary',
  '<DependencyGnnEvidence dependency={selectedDependency} />',
  '<DependencyGnnSummary dependencies={dependencies} />',
  '<ReachabilityGnnSummary items={reachabilityItems} />',
  'GNN 模型证据',
  'GNN 依赖风险证据',
  'function ReachabilityGnnPill',
  '<ReachabilityGnnPill dependency={item.dependency} />',
  'function ReachabilityGnnEvidence',
  '<ReachabilityGnnEvidence dependency={item.dependency} />',
  'function GraphRagGnnWorkspaceCard',
  '<GraphRagGnnWorkspaceCard workspace={workspace}',
  'GraphRAG + GNN 智能证据',
  'function GraphRagEvidenceCard',
  '<GraphRagEvidenceCard graphRag={graphRag} />',
  'GraphRAG 证据',
]

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet))

if (missing.length) {
  console.error('Missing GraphRAG/GNN UI wiring:')
  for (const snippet of missing) {
    console.error(`- ${snippet}`)
  }
  process.exit(1)
}

console.log('GraphRAG/GNN UI wiring is present.')

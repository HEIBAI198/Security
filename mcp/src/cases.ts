import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import YAML from 'yaml'
import { casesRoot } from './config.js'

export type CaseMeta = {
  caseId: string
  caseName: string
  path: string
  scenario?: string
  contestTopic?: string
  safetyBoundary: Record<string, unknown>
  expectedStages: string[]
  expectedFindings: Record<string, unknown>
  publicReferences: Array<Record<string, unknown>>
  defenseStory?: Record<string, unknown>
  judgeTalkingPoints: string[]
  raw: Record<string, unknown>
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function objectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length > 0) : []
}

export async function listCases(): Promise<CaseMeta[]> {
  const entries = await readdir(casesRoot, { withFileTypes: true })
  const cases: CaseMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const casePath = resolve(casesRoot, entry.name)
    if (!casePath.startsWith(casesRoot)) continue
    const caseFile = join(casePath, 'case.yml')
    try {
      const rawText = await readFile(caseFile, 'utf8')
      const raw = objectValue(YAML.parse(rawText))
      cases.push({
        caseId: String(raw.case_id || entry.name),
        caseName: String(raw.case_name || entry.name),
        path: `cases/${entry.name}`,
        scenario: raw.scenario ? String(raw.scenario) : undefined,
        contestTopic: raw.contest_topic ? String(raw.contest_topic) : undefined,
        safetyBoundary: objectValue(raw.safety_boundary),
        expectedStages: stringList(raw.expected_stages),
        expectedFindings: objectValue(raw.expected_findings),
        publicReferences: objectList(raw.public_references),
        defenseStory: Object.keys(objectValue(raw.defense_story)).length ? objectValue(raw.defense_story) : undefined,
        judgeTalkingPoints: stringList(raw.judge_talking_points),
        raw,
      })
    } catch {
      // 没有 case.yml 的目录不是比赛案例，跳过。
    }
  }
  return cases.sort((left, right) => left.caseId.localeCompare(right.caseId))
}

export async function getCase(caseId: string) {
  const cases = await listCases()
  return cases.find((item) => item.caseId === caseId)
}

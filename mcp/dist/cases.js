import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import { casesRoot } from './config.js';
function objectValue(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function stringList(value) {
    return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
function objectList(value) {
    return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length > 0) : [];
}
export async function listCases() {
    const entries = await readdir(casesRoot, { withFileTypes: true });
    const cases = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const casePath = resolve(casesRoot, entry.name);
        if (!casePath.startsWith(casesRoot))
            continue;
        const caseFile = join(casePath, 'case.yml');
        try {
            const rawText = await readFile(caseFile, 'utf8');
            const raw = objectValue(YAML.parse(rawText));
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
            });
        }
        catch {
            // 没有 case.yml 的目录不是比赛案例，跳过。
        }
    }
    return cases.sort((left, right) => left.caseId.localeCompare(right.caseId));
}
export async function getCase(caseId) {
    const cases = await listCases();
    return cases.find((item) => item.caseId === caseId);
}

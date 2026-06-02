export type ProjectImportLanguage = {
  name: string
  percent: number
  files: number
  bytes: number
}

export type ProjectImportSummary = {
  projectName: string
  sourceType: 'upload' | 'git' | 'local'
  sourceRef: Record<string, string | number>
  fileStats: {
    total: number
    scannable: number
    ignored: number
    binary: number
  }
  languages: ProjectImportLanguage[]
  dependencyFiles: string[]
  ciFiles: string[]
  warnings: string[]
  scanScope: string
}

export type ProjectImportRecord = {
  importId: string
  status: string
  projectName: string
  sourceType: ProjectImportSummary['sourceType']
  sourceRef: ProjectImportSummary['sourceRef']
  sourcePath: string
  createdAt: string
  updatedAt: string
  summary: ProjectImportSummary
}

export type GitImportPayload = {
  url: string
  ref?: string
  commit?: string
  projectName?: string
}

export type LocalImportPayload = {
  path: string
  projectName?: string
}

export type ScanJob = {
  scanId: string
  importId: string
  projectName: string
  status: string
  scope: string
  engines: string[]
  createdAt: string
  message: string
}

export type ApiReady = {
  ready: boolean
  service: string
  version: string
  frontend_ready: boolean
}

const apiBase = (import.meta.env.VITE_SECURITY_API_BASE || '').replace(/\/$/, '')

async function readError(response: Response) {
  const fallback = response.statusText || 'Request failed'
  const text = await response.text()
  if (!text) return fallback
  try {
    const payload = JSON.parse(text)
    return payload.detail || payload.error || fallback
  } catch {
    return text
  }
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return response.json() as Promise<T>
}

export async function uploadProjectArchive(file: File) {
  const response = await fetch(`${apiBase}/api/imports/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Project-Filename': encodeURIComponent(file.name),
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return response.json() as Promise<ProjectImportRecord>
}

export async function importGitProject(payload: GitImportPayload) {
  return apiJson<ProjectImportRecord>('/api/imports/git', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function importLocalProject(payload: LocalImportPayload) {
  return apiJson<ProjectImportRecord>('/api/imports/local', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function startProjectScan(importId: string, scope = '.') {
  return apiJson<ScanJob>(`/api/imports/${importId}/scan`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

export async function loadLatestProjectImport() {
  return apiJson<ProjectImportRecord>('/api/imports/latest')
}

export async function checkImportApiReady() {
  return apiJson<ApiReady>('/api/ready')
}

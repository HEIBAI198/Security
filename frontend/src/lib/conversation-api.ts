export type SecurityConversation = {
  conversationId: string
  title: string
  workspaceId: string
  importId?: string
  projectName?: string
  sourceType?: 'upload' | 'git' | 'local' | string
  sourcePath?: string
  createdAt: string
  updatedAt: string
  summary: {
    scanStatus?: string
    riskScore?: number | null
    riskLevel: string
    attackPaths?: number | null
    dependencies: number
    findings: number
    preflightFiles?: number
    preflightScannable?: number
    dependencyFiles?: number
    ciFiles?: number
    primaryLanguage?: string
  }
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
  const response = await fetch(`${apiBase}${path}`, { ...options, headers })
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<T>
}

export async function listConversations() {
  return apiJson<{ conversations: SecurityConversation[] }>('/api/conversations')
}

export async function createConversation(payload: {
  workspaceId: string
  importId?: string
  title?: string
}) {
  return apiJson<SecurityConversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function renameConversation(conversationId: string, title: string) {
  return apiJson<SecurityConversation>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export async function deleteConversation(conversationId: string) {
  const response = await fetch(`${apiBase}/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(await readError(response))
}

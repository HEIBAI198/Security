import { create } from 'zustand'
import { getCookie, setCookie, removeCookie } from '@/lib/cookies'

const ACCESS_TOKEN = 'thisisjustarandomstring'
const LOCAL_USERS_KEY = 'supplyguard.local-users'
const LOCAL_SESSION_KEY = 'supplyguard.local-session'

export type AuthMethod = 'phone' | 'qq' | 'wechat' | 'github' | 'email'

export const authMethodLabels: Record<AuthMethod, string> = {
  phone: '手机号',
  qq: 'QQ',
  wechat: '微信',
  github: 'GitHub',
  email: '邮箱',
}

interface AuthUser {
  accountNo: string
  email: string
  displayName?: string
  method?: AuthMethod
  identifier?: string
  role: string[]
  exp: number
}

interface StoredUser {
  id: string
  method: AuthMethod
  identifier: string
  displayName: string
  passwordHash: string
  createdAt: string
}

interface LocalSession {
  userId: string
  token: string
  expiresAt: number
}

interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage
}

function normalizeIdentifier(method: AuthMethod, value: string) {
  const trimmed = value.trim()
  if (method === 'phone') return trimmed.replace(/\s+/g, '')
  return trimmed.toLowerCase()
}

function readStoredUsers(): StoredUser[] {
  const storage = browserStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_USERS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredUsers(users: StoredUser[]) {
  browserStorage()?.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
}

function readLocalSession(): LocalSession | null {
  const storage = browserStorage()
  if (!storage) return null
  try {
    const session = JSON.parse(storage.getItem(LOCAL_SESSION_KEY) || 'null') as LocalSession | null
    if (!session || session.expiresAt < Date.now()) {
      storage.removeItem(LOCAL_SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

function writeLocalSession(session: LocalSession) {
  browserStorage()?.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
}

function removeLocalSession() {
  browserStorage()?.removeItem(LOCAL_SESSION_KEY)
}

async function hashPassword(value: string) {
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function toAuthUser(user: StoredUser): AuthUser {
  return {
    accountNo: user.id,
    email: user.method === 'email' ? user.identifier : `${user.identifier}@${user.method}.local`,
    displayName: user.displayName,
    method: user.method,
    identifier: user.identifier,
    role: ['security-analyst'],
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  }
}

function currentSessionUser() {
  const session = readLocalSession()
  if (!session) return null
  return readStoredUsers().find((user) => user.id === session.userId) ?? null
}

export async function registerLocalUser({
  method,
  identifier,
  password,
  displayName,
}: {
  method: AuthMethod
  identifier: string
  password: string
  displayName?: string
}) {
  const normalizedIdentifier = normalizeIdentifier(method, identifier)
  const users = readStoredUsers()
  if (users.some((user) => user.method === method && user.identifier === normalizedIdentifier)) {
    throw new Error(`${authMethodLabels[method]}账号已注册，请直接登录。`)
  }

  const nextUser: StoredUser = {
    id: crypto.randomUUID(),
    method,
    identifier: normalizedIdentifier,
    displayName:
      displayName?.trim() ||
      `${authMethodLabels[method]}用户 ${normalizedIdentifier.slice(-4)}`,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  }
  writeStoredUsers([...users, nextUser])
  return toAuthUser(nextUser)
}

export async function authenticateLocalUser({
  method,
  identifier,
  password,
}: {
  method: AuthMethod
  identifier: string
  password: string
}) {
  const normalizedIdentifier = normalizeIdentifier(method, identifier)
  const users = readStoredUsers()
  const user = users.find(
    (item) => item.method === method && item.identifier === normalizedIdentifier
  )
  if (!user) throw new Error('该账号尚未注册，请先完成注册。')

  const passwordHash = await hashPassword(password)
  if (user.passwordHash !== passwordHash) {
    throw new Error('账号或密码不正确，请重新输入。')
  }

  const token = `sg_${user.id}_${Date.now()}`
  writeLocalSession({
    userId: user.id,
    token,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
  })
  return { user: toAuthUser(user), token }
}

export const useAuthStore = create<AuthState>()((set) => {
  const cookieState = getCookie(ACCESS_TOKEN)
  const localSession = readLocalSession()
  const initToken = cookieState ? JSON.parse(cookieState) : localSession?.token || ''
  const initUser = currentSessionUser()
  return {
    auth: {
      user: initUser ? toAuthUser(initUser) : null,
      setUser: (user) =>
        set((state) => ({ ...state, auth: { ...state.auth, user } })),
      accessToken: initToken,
      setAccessToken: (accessToken) =>
        set((state) => {
          setCookie(ACCESS_TOKEN, JSON.stringify(accessToken))
          return { ...state, auth: { ...state.auth, accessToken } }
        }),
      resetAccessToken: () =>
        set((state) => {
          removeCookie(ACCESS_TOKEN)
          return { ...state, auth: { ...state.auth, accessToken: '' } }
        }),
      reset: () =>
        set((state) => {
          removeCookie(ACCESS_TOKEN)
          removeLocalSession()
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '' },
          }
        }),
    },
  }
})

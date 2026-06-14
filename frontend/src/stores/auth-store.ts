import { create } from 'zustand'
import { getCookie, removeCookie, setCookie } from '@/lib/cookies'

const ACCESS_TOKEN = 'thisisjustarandomstring'
const USER_SESSION = 'supplyguard.auth-user'

export type AuthMethod = 'phone' | 'github' | 'email'

export const authMethodLabels: Record<AuthMethod, string> = {
  phone: '手机号',
  github: 'GitHub',
  email: '邮箱',
}

export interface AuthUser {
  accountNo: string
  email: string
  displayName?: string
  method?: AuthMethod
  identifier?: string
  role: string[]
  exp: number
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

type AuthPayload = {
  method: AuthMethod
  identifier: string
  password: string
  displayName?: string
}

type AuthResponse = {
  accessToken: string
  user: AuthUser
}

function readStoredUser() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(USER_SESSION) || 'null') as AuthUser | null
  } catch {
    return null
  }
}

function writeStoredUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  if (user) window.localStorage.setItem(USER_SESSION, JSON.stringify(user))
  else window.localStorage.removeItem(USER_SESSION)
}

async function requestAuth(path: 'login' | 'register', payload: AuthPayload) {
  const response = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: payload.method,
      identifier: payload.identifier,
      password: payload.password,
      display_name: payload.displayName,
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.detail || '认证失败，请稍后重试。')
  }
  return body as AuthResponse
}

export function registerUser(payload: AuthPayload) {
  return requestAuth('register', payload)
}

export function loginUser(payload: AuthPayload) {
  return requestAuth('login', payload)
}

export const useAuthStore = create<AuthState>()((set) => {
  const cookieState = getCookie(ACCESS_TOKEN)
  const initToken = cookieState ? JSON.parse(cookieState) : ''
  const initUser = initToken ? readStoredUser() : null
  return {
    auth: {
      user: initUser,
      setUser: (user) =>
        set((state) => {
          writeStoredUser(user)
          return { ...state, auth: { ...state.auth, user } }
        }),
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
          writeStoredUser(null)
          return {
            ...state,
            auth: { ...state.auth, user: null, accessToken: '' },
          }
        }),
    },
  }
})

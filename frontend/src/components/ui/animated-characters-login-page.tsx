import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { IconGithub } from '@/assets/brand-icons'
import { cn } from '@/lib/utils'
import {
  authMethodLabels,
  loginUser,
  registerUser,
  type AuthMethod,
  useAuthStore,
} from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AuthMode = 'login' | 'register'

const authMethods: Array<{
  id: AuthMethod
  icon: React.ComponentType<{ className?: string }>
  placeholder: string
}> = [
  { id: 'phone', icon: Phone, placeholder: '13800000000' },
  { id: 'github', icon: IconGithub, placeholder: 'security-analyst' },
  { id: 'email', icon: Mail, placeholder: 'analyst@example.com' },
]

function Pupil({
  size = 10,
  maxDistance = 5,
  forceLookX,
  forceLookY,
}: {
  size?: number
  maxDistance?: number
  forceLookX?: number
  forceLookY?: number
}) {
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) =>
      setMouse({ x: event.clientX, y: event.clientY })
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  const position = useMemo(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY }
    }
    if (!ref.current) return { x: 0, y: 0 }
    const rect = ref.current.getBoundingClientRect()
    const dx = mouse.x - (rect.left + rect.width / 2)
    const dy = mouse.y - (rect.top + rect.height / 2)
    const distance = Math.min(Math.hypot(dx, dy), maxDistance)
    const angle = Math.atan2(dy, dx)
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
  }, [forceLookX, forceLookY, maxDistance, mouse.x, mouse.y])

  return (
    <div
      ref={ref}
      className='rounded-full bg-slate-950 transition-transform duration-150 ease-out'
      style={{
        width: size,
        height: size,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    />
  )
}

function EyeBall({
  size = 18,
  pupilSize = 7,
  isBlinking,
  forceLookX,
  forceLookY,
}: {
  size?: number
  pupilSize?: number
  isBlinking?: boolean
  forceLookX?: number
  forceLookY?: number
}) {
  return (
    <div
      className='flex items-center justify-center overflow-hidden rounded-full bg-white transition-all duration-150'
      style={{ width: size, height: isBlinking ? 2 : size }}
    >
      {!isBlinking && (
        <Pupil
          size={pupilSize}
          maxDistance={4}
          forceLookX={forceLookX}
          forceLookY={forceLookY}
        />
      )}
    </div>
  )
}

function SentinelStage({
  typing,
  passwordActive,
  revealingPassword,
}: {
  typing: boolean
  passwordActive: boolean
  revealingPassword: boolean
}) {
  const [purpleBlink, setPurpleBlink] = useState(false)
  const [blackBlink, setBlackBlink] = useState(false)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const isWatchingInput = typing || passwordActive
  const isPeeking = isWatchingInput && !revealingPassword

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) =>
      setMouse({ x: event.clientX, y: event.clientY })
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  useEffect(() => {
    const pulse = window.setInterval(() => {
      setPurpleBlink(true)
      window.setTimeout(() => setPurpleBlink(false), 140)
    }, 4800)
    return () => window.clearInterval(pulse)
  }, [])

  useEffect(() => {
    const pulse = window.setInterval(() => {
      setBlackBlink(true)
      window.setTimeout(() => setBlackBlink(false), 140)
    }, 6200)
    return () => window.clearInterval(pulse)
  }, [])

  const pointer = useMemo(() => {
    if (!stageRef.current) return { x: 0, y: 0, lean: 0 }
    const rect = stageRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = mouse.x - centerX
    const dy = mouse.y - centerY
    return {
      x: Math.max(-5, Math.min(5, dx / 46)),
      y: Math.max(-4, Math.min(4, dy / 54)),
      lean: Math.max(-5, Math.min(5, -dx / 150)),
    }
  }, [mouse.x, mouse.y])

  const look = revealingPassword
    ? { x: -5, y: -4 }
    : isPeeking
      ? { x: 5, y: 4 }
      : { x: pointer.x, y: pointer.y }

  const bodyLean = revealingPassword
    ? 6
    : isPeeking
      ? -8
      : pointer.lean
  const purpleHeight = revealingPassword ? 306 : isPeeking ? 362 : 318
  const blackHeight = revealingPassword ? 238 : isPeeking ? 270 : 250
  const orangeHeight = revealingPassword ? 158 : isPeeking ? 180 : 168
  const yellowHeight = revealingPassword ? 194 : isPeeking ? 220 : 206

  return (
    <div ref={stageRef} className='relative mx-auto h-[390px] w-[560px] max-w-full'>
      <div
        className='absolute inset-x-0 bottom-0 h-[340px] transition-transform duration-500 ease-out'
        style={{ transform: 'translate(0, 0)', transformOrigin: 'bottom center' }}
      >
        <div
          className='absolute bottom-0 left-[172px] z-10 w-[150px] rounded-t-lg bg-[#4f46e5] shadow-2xl shadow-indigo-950/40 transition-all duration-300 ease-out'
          style={{
            height: `${purpleHeight}px`,
            transform: `skewX(${bodyLean - 1}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <div className='absolute left-10 top-12 flex gap-7'>
            <EyeBall
              isBlinking={purpleBlink}
              forceLookX={look.x}
              forceLookY={look.y}
            />
            <EyeBall
              isBlinking={purpleBlink}
              forceLookX={look.x}
              forceLookY={look.y}
            />
          </div>
        </div>

        <div
          className='absolute bottom-0 left-[292px] z-20 w-[112px] rounded-t-md bg-slate-950 shadow-2xl shadow-black/40 transition-all duration-300 ease-out'
          style={{
            height: `${blackHeight}px`,
            transform: `skewX(${bodyLean - 2}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <div className='absolute left-6 top-10 flex gap-5'>
            <EyeBall
              size={16}
              pupilSize={6}
              isBlinking={blackBlink}
              forceLookX={look.x}
              forceLookY={look.y}
            />
            <EyeBall
              size={16}
              pupilSize={6}
              isBlinking={blackBlink}
              forceLookX={look.x}
              forceLookY={look.y}
            />
          </div>
        </div>

        <div
          className='absolute bottom-0 left-[58px] z-30 w-[224px] rounded-t-full bg-[#f59f6a] shadow-2xl shadow-orange-950/30 transition-all duration-300 ease-out'
          style={{
            height: `${orangeHeight}px`,
            transform: `skewX(${bodyLean * 0.55}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <div className='absolute left-[82px] top-[84px] flex gap-8'>
            <Pupil forceLookX={look.x * 1.45} forceLookY={look.y * 1.35} />
            <Pupil forceLookX={look.x * 1.45} forceLookY={look.y * 1.35} />
          </div>
        </div>

        <div
          className='absolute bottom-0 left-[356px] z-40 w-[128px] rounded-t-full bg-[#d9c85b] shadow-2xl shadow-yellow-950/30 transition-all duration-300 ease-out'
          style={{
            height: `${yellowHeight}px`,
            transform: `skewX(${bodyLean * 0.65}deg)`,
            transformOrigin: 'bottom center',
          }}
        >
          <div className='absolute left-[42px] top-11 flex gap-5'>
            <Pupil forceLookX={look.x * 1.45} forceLookY={look.y * 1.35} />
            <Pupil forceLookX={look.x * 1.45} forceLookY={look.y * 1.35} />
          </div>
          <div className='absolute left-9 top-[96px] h-1 w-16 rounded-full bg-slate-950' />
        </div>
      </div>
    </div>
  )
}

function methodInputType(method: AuthMethod) {
  if (method === 'phone') return 'tel'
  if (method === 'email') return 'email'
  return 'text'
}

export function Component() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const [mode, setMode] = useState<AuthMode>('login')
  const [method, setMethod] = useState<AuthMethod>('phone')
  const [identifier, setIdentifier] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [typing, setTyping] = useState(false)
  const [passwordActive, setPasswordActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const activeMethod = authMethods.find((item) => item.id === method) ?? authMethods[0]
  const ActiveMethodIcon = activeMethod.icon

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!identifier.trim()) {
      setError(`请输入${authMethodLabels[method]}账号。`)
      return
    }
    if (password.length < 6) {
      setError('密码至少需要 6 位。')
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }

    setBusy(true)
    try {
      const payload = { method, identifier, password, displayName }
      if (mode === 'register') {
        await registerUser(payload)
        toast.success('注册成功，请登录')
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setDisplayName('')
        setShowPassword(false)
        return
      }

      const session = await loginUser(payload)
      auth.setUser(session.user)
      auth.setAccessToken(session.accessToken)
      if (!remember) window.sessionStorage.setItem('supplyguard.short-session', '1')
      toast.success('登录成功')
      navigate({ to: '/', replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className='min-h-dvh bg-slate-950 text-slate-50'>
      <div className='grid min-h-dvh lg:grid-cols-[1.08fr_0.92fr]'>
        <section className='relative hidden overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.18),transparent_28%),linear-gradient(135deg,#07111f,#0f172a_48%,#101827)] px-12 py-10 lg:flex lg:flex-col'>
          <div className='relative z-10 flex items-center gap-3'>
            <div className='grid size-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10'>
              <ShieldCheck className='size-5 text-cyan-200' />
            </div>
            <div className='text-base font-semibold'>SupplyGuard KG</div>
          </div>

          <div className='relative z-10 flex flex-1 flex-col items-center justify-center gap-12'>
            <h1 className='max-w-2xl text-center text-4xl font-semibold leading-tight text-white xl:text-5xl'>
              统一身份入口，守护溯源工作台
            </h1>
            <SentinelStage
              typing={typing}
              passwordActive={passwordActive && password.length > 0}
              revealingPassword={showPassword && password.length > 0}
            />
          </div>
        </section>

        <section className='flex items-center justify-center bg-[linear-gradient(180deg,#020617,#0f172a)] px-5 py-10 sm:px-8'>
          <div className='w-full max-w-[440px]'>
            <div className='mb-10 flex items-center gap-3 lg:hidden'>
              <div className='grid size-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10'>
                <ShieldCheck className='size-5 text-cyan-200' />
              </div>
              <div className='font-semibold'>SupplyGuard KG</div>
            </div>

            <div className='rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8'>
              <div className='mb-7'>
                <h2 className='text-2xl font-semibold'>
                  {mode === 'login' ? '登录账号' : '注册账号'}
                </h2>
              </div>

              <div className='mb-5 grid grid-cols-2 rounded-lg bg-slate-950/70 p-1'>
                {(['login', 'register'] as const).map((item) => (
                  <Button
                    key={item}
                    type='button'
                    variant='ghost'
                    className={cn(
                      'h-10 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white',
                      mode === item &&
                        'bg-cyan-300 text-slate-950 hover:bg-cyan-300 hover:text-slate-950'
                    )}
                    onClick={() => {
                      setMode(item)
                      setError('')
                    }}
                  >
                    {item === 'login' ? '登录' : '注册'}
                  </Button>
                ))}
              </div>

              <form className='space-y-5' onSubmit={handleSubmit}>
                <div className='space-y-2'>
                  <Label className='text-slate-200'>登录方式</Label>
                  <div className='grid grid-cols-3 gap-2'>
                    {authMethods.map((item) => {
                      const Icon = item.icon
                      return (
                        <Button
                          key={item.id}
                          type='button'
                          variant='outline'
                          aria-label={authMethodLabels[item.id]}
                          className={cn(
                            'h-11 border-white/10 bg-slate-950/60 px-0 text-slate-300 hover:bg-slate-800 hover:text-white',
                            method === item.id &&
                              'border-cyan-300/60 bg-cyan-300/10 text-cyan-100'
                          )}
                          onClick={() => {
                            setMethod(item.id)
                            setError('')
                          }}
                        >
                          <Icon className='size-4' />
                        </Button>
                      )
                    })}
                  </div>
                </div>

                {mode === 'register' && (
                  <div className='space-y-2'>
                    <Label htmlFor='displayName' className='text-slate-200'>
                      昵称
                    </Label>
                    <Input
                      id='displayName'
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder='安全分析员'
                      className='h-12 border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-600'
                    />
                  </div>
                )}

                <div className='space-y-2'>
                  <Label htmlFor='identifier' className='text-slate-200'>
                    {authMethodLabels[method]}账号
                  </Label>
                  <div className='relative'>
                    <ActiveMethodIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500' />
                    <Input
                      id='identifier'
                      type={methodInputType(method)}
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      onFocus={() => setTyping(true)}
                      onBlur={() => setTyping(false)}
                      placeholder={activeMethod.placeholder}
                      className='h-12 border-white/10 bg-slate-950/60 pl-10 text-slate-100 placeholder:text-slate-600'
                      autoComplete={method === 'phone' ? 'tel' : 'username'}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='password' className='text-slate-200'>
                    密码
                  </Label>
                  <div className='relative'>
                    <KeyRound className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500' />
                    <Input
                      id='password'
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onFocus={() => {
                        setTyping(true)
                        setPasswordActive(true)
                      }}
                      onBlur={() => {
                        setTyping(false)
                        setPasswordActive(false)
                      }}
                      placeholder='至少 6 位'
                      className='h-12 border-white/10 bg-slate-950/60 px-10 text-slate-100 placeholder:text-slate-600'
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type='button'
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((value) => !value)}
                      className='absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100'
                    >
                      {showPassword ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div className='space-y-2'>
                    <Label htmlFor='confirmPassword' className='text-slate-200'>
                      确认密码
                    </Label>
                    <Input
                      id='confirmPassword'
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onFocus={() => setPasswordActive(true)}
                      onBlur={() => setPasswordActive(false)}
                      placeholder='再次输入密码'
                      className='h-12 border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-600'
                      autoComplete='new-password'
                    />
                  </div>
                )}

                <div className='flex items-center justify-between gap-4 text-sm'>
                  <label className='flex items-center gap-2 text-slate-400'>
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(value) => setRemember(Boolean(value))}
                      className='border-slate-600 data-[state=checked]:border-cyan-300 data-[state=checked]:bg-cyan-300 data-[state=checked]:text-slate-950'
                    />
                    记住我
                  </label>
                </div>

                {error && (
                  <div
                    role='alert'
                    className='rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200'
                  >
                    {error}
                  </div>
                )}

                <Button
                  type='submit'
                  disabled={busy}
                  className='h-12 w-full bg-cyan-300 text-base font-semibold text-slate-950 hover:bg-cyan-200'
                >
                  {busy && <Loader2 className='size-4 animate-spin' />}
                  {mode === 'login' ? '登录' : '注册'}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

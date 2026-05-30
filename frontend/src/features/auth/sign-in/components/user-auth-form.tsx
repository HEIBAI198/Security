import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { login, saveIdentity } from '@/lib/sysml-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, '请输入用户名。')
    .regex(/^[A-Za-z0-9_-]{3,30}$/, '用户名需为 3-30 位字母、数字、下划线或连字符。'),
  password: z
    .string()
    .min(1, '请输入密码。')
    .min(7, '密码至少需要 7 位。'),
  rememberPassword: z.boolean(),
})

const rememberedLoginKey = 'sysml_remembered_login'

interface RememberedLoginStore {
  lastUsername: string
  credentials: Record<string, string>
}

function loadRememberedLoginStore(): RememberedLoginStore {
  if (typeof window === 'undefined') {
    return { lastUsername: '', credentials: {} }
  }

  try {
    const raw = window.localStorage.getItem(rememberedLoginKey)
    if (!raw) return { lastUsername: '', credentials: {} }

    const parsed = JSON.parse(raw) as Partial<{
      lastUsername: string
      username: string
      password: string
      credentials: Record<string, string>
    }>

    if (parsed.credentials && typeof parsed.credentials === 'object') {
      const credentials = Object.fromEntries(
        Object.entries(parsed.credentials).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === 'string' && typeof entry[1] === 'string'
        )
      )

      return {
        lastUsername: parsed.lastUsername ?? Object.keys(credentials)[0] ?? '',
        credentials,
      }
    }

    if (parsed.username && parsed.password) {
      return {
        lastUsername: parsed.username,
        credentials: {
          [parsed.username]: parsed.password,
        },
      }
    }

    return { lastUsername: '', credentials: {} }
  } catch {
    window.localStorage.removeItem(rememberedLoginKey)
    return { lastUsername: '', credentials: {} }
  }
}

function loadRememberedLogin() {
  const store = loadRememberedLoginStore()
  const username = store.lastUsername
  const password = username ? store.credentials[username] ?? '' : ''

  return {
    username,
    password,
    rememberPassword: Boolean(username && password),
  }
}

function getRememberedPassword(username: string) {
  const store = loadRememberedLoginStore()
  const password = store.credentials[username]
  return typeof password === 'string' ? password : null
}

function saveRememberedLogin(username: string, password: string) {
  if (typeof window === 'undefined') return

  const store = loadRememberedLoginStore()
  const nextStore: RememberedLoginStore = {
    lastUsername: username,
    credentials: {
      ...store.credentials,
      [username]: password,
    },
  }

  window.localStorage.setItem(rememberedLoginKey, JSON.stringify(nextStore))
}

function clearRememberedLogin(username: string) {
  if (typeof window === 'undefined') return

  const store = loadRememberedLoginStore()
  const credentials = { ...store.credentials }
  delete credentials[username]

  if (Object.keys(credentials).length === 0) {
    window.localStorage.removeItem(rememberedLoginKey)
    return
  }

  window.localStorage.setItem(
    rememberedLoginKey,
    JSON.stringify({
      lastUsername:
        store.lastUsername === username
          ? Object.keys(credentials)[0]
          : store.lastUsername,
      credentials,
    })
  )
}

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {}

export function UserAuthForm({ className, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const rememberedLogin = loadRememberedLogin()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: rememberedLogin.username,
      password: rememberedLogin.password,
      rememberPassword: rememberedLogin.rememberPassword,
    },
  })
  const watchedUsername = form.watch('username')

  useEffect(() => {
    const username = watchedUsername.trim()
    const password = username ? getRememberedPassword(username) : null

    form.setValue('password', password ?? '')
    form.setValue('rememberPassword', Boolean(password))
  }, [form, watchedUsername])

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    setServerError('')

    try {
      const username = data.username.trim()
      const payload = await login(username, data.password)
      const identity = payload.identity
      saveIdentity(identity)
      if (data.rememberPassword) {
        saveRememberedLogin(username, data.password)
      } else {
        clearRememberedLogin(username)
      }
      auth.setUser({
        accountNo: 'ACC001',
        email: identity.username,
        role: [identity.role],
        exp: identity.exp ?? Date.now(),
      })
      auth.setAccessToken(identity.token ?? '')

      navigate({ to: '/', replace: true })
      toast.success(`欢迎回来：${identity.display || identity.username}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      setServerError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        {serverError ? (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel className='text-sm font-semibold'>Username</FormLabel>
              <FormControl>
                <Input
                  autoComplete='username'
                  className='h-9 rounded-md border-slate-200 bg-white px-3 text-sm shadow-xs'
                  placeholder='请输入用户名'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel className='text-sm font-semibold'>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='current-password'
                  className='[&_input]:h-9 [&_input]:rounded-md [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:shadow-xs'
                  placeholder='请输入密码'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='flex items-center justify-between gap-3 py-0.5'>
          <FormField
            control={form.control}
            name='rememberPassword'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center gap-2 space-y-0'>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                </FormControl>
                <FormLabel className='cursor-pointer text-sm font-normal text-slate-700'>
                  记住密码
                </FormLabel>
              </FormItem>
            )}
          />
          <Link
            to='/forgot-password'
            className='shrink-0 text-sm font-medium text-slate-500 hover:text-slate-950'
          >
            忘记密码？
          </Link>
        </div>
        <Button
          type='submit'
          className='mt-2 h-9 rounded-md bg-slate-950 text-sm shadow-sm hover:bg-slate-800'
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          登录
        </Button>
        <Button
          variant='outline'
          className='h-9 w-full rounded-md border-slate-200 bg-white text-sm shadow-xs hover:bg-slate-50'
          asChild
        >
          <Link to='/sign-up'>注册</Link>
        </Button>
      </form>
    </Form>
  )
}

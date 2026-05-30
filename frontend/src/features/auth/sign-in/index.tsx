import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  return (
    <AuthLayout>
      <Card className='w-full max-w-[360px] gap-4 rounded-xl border-slate-200 bg-white py-6 shadow-[0_16px_48px_rgba(15,23,42,0.12)]'>
        <CardHeader className='px-6 pb-0'>
          <CardTitle className='text-lg tracking-tight'>Sysml Login</CardTitle>
          <CardDescription className='mt-2 text-sm leading-5'>
            Enter your username and password below to log into your account.
          </CardDescription>
        </CardHeader>
        <CardContent className='px-6'>
          <UserAuthForm />
        </CardContent>
        <CardFooter className='px-6 pt-0'>
          <p className='text-center text-sm leading-5 text-muted-foreground'>
            By clicking sign in, you agree to our{' '}
            <a
              href='/terms'
              className='underline underline-offset-4 hover:text-primary'
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href='/privacy'
              className='underline underline-offset-4 hover:text-primary'
            >
              Privacy Policy
            </a>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}

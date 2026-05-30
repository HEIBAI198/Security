type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className='min-h-svh bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]'>
      <div className='container grid min-h-svh max-w-none items-center justify-center px-4 py-10'>
        {children}
      </div>
    </div>
  )
}

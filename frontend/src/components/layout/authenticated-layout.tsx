import { Outlet, useRouterState } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const content = children ?? <Outlet />
  const useAgentWorkspaceShell = pathname === '/'

  if (useAgentWorkspaceShell) {
    return (
      <LayoutProvider>
        <SidebarProvider defaultOpen={false}>
          <SkipToMain />
          <SidebarInset className='@container/content'>
            {content}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    )
  }

  return (
    <LayoutProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <SkipToMain />
        <AppSidebar />
        <SidebarInset
          className={cn(
            '@container/content',
            'has-data-[layout=fixed]:h-svh',
            'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
          )}
        >
          {content}
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  )
}

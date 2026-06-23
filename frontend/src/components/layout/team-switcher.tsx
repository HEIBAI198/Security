import * as React from 'react'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type TeamSwitcherProps = {
  teams: {
    name: string
    logo: React.ElementType
    plan: string
  }[]
}

export function TeamSwitcher({ teams }: TeamSwitcherProps) {
  const activeTeam = teams[0]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='cursor-default hover:bg-transparent active:bg-transparent'
        >
            <div className='flex aspect-square size-9 items-center justify-center rounded-xl border border-sidebar-border bg-background text-primary shadow-sm'>
              <activeTeam.logo className='size-5' />
            </div>
          <div className='grid flex-1 text-start text-sm leading-tight'>
            <span className='truncate font-semibold'>{activeTeam.name}</span>
            <span className='truncate text-xs'>{activeTeam.plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

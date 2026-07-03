import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      id='supplyguard-logo'
      viewBox='0 0 256 256'
      xmlns='http://www.w3.org/2000/svg'
      height='24'
      width='24'
      className={cn('size-6', className)}
      {...props}
    >
      <title>SupplyGuard KG</title>
      <path
        fill='#19c6b8'
        d='M128 16 91.5 34.2 44 26v93.4c0 55.8 34.2 92.5 84 120.6 49.8-28.1 84-64.8 84-120.6V26l-47.5 8.2L128 16Z'
      />
      <path
        fill='none'
        stroke='#f6ffff'
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth='13'
        d='M73 124.5 111 86v97M183 130.5 145 169V73'
      />
    </svg>
  )
}

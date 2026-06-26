import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-500 group-hover:[&_svg]:scale-110 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/[0.03] after:to-transparent after:-translate-x-full hover:after:translate-x-full after:transition-transform after:duration-700 after:pointer-events-none after:rounded-[inherit]",
  {
    variants: {
      variant: {
        default:
          'border border-primary/70 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-[var(--shadow-interactive)]',
        destructive:
          'border border-destructive/60 bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-[0_10px_24px_rgba(239,68,68,0.18)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'border border-input bg-[color:var(--surface-panel)] shadow-sm hover:border-ring/50 hover:bg-[color:var(--surface-hover)] hover:text-accent-foreground hover:shadow-[var(--shadow-soft)]',
        secondary:
          'border border-border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-[var(--shadow-soft)]',
        ghost:
          'hover:bg-[color:var(--surface-hover)] hover:text-accent-foreground hover:shadow-[var(--shadow-soft)]',
        link: 'text-primary underline-offset-4 hover:underline hover:translate-y-0 active:scale-100',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot='button'
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

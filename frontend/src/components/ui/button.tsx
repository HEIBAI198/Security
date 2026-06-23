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
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-[0_4px_16px_rgba(0,0,0,0.2)]',
        destructive:
          'bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-[0_4px_16px_rgba(239,68,68,0.15)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]',
        ghost:
          'hover:bg-accent hover:text-accent-foreground hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-accent/50',
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

import { createFileRoute } from '@tanstack/react-router'
import { SecurityPlatform } from '@/features/security-platform'

export const Route = createFileRoute('/_authenticated/')({
  component: SecurityPlatform,
})

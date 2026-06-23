import { createFileRoute } from '@tanstack/react-router'
import { ProjectImportPage } from '@/features/project-import'

export const Route = createFileRoute('/_authenticated/project-import')({
  component: ProjectImportPage,
})

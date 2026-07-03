import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: '/', replace: true })
  }, [navigate])

  return null
}

import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Component as AnimatedCharactersLoginPage } from '@/components/ui/animated-characters-login-page'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/login')({
  component: LoginRoute,
})

function LoginRoute() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()

  useEffect(() => {
    if (auth.accessToken) {
      navigate({ to: '/', replace: true })
    }
  }, [auth.accessToken, navigate])

  return <AnimatedCharactersLoginPage />
}


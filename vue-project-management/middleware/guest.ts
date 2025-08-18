export default defineNuxtRouteMiddleware(() => {
  const { isAuthenticated } = useAuthStore()

  // If user is authenticated, redirect to dashboard
  if (isAuthenticated) {
    return navigateTo('/dashboard')
  }
})
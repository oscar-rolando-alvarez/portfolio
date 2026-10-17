export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  await auth.fetchUser()
  if (auth.isAuthenticated) {
    return navigateTo('/dashboard')
  }
})

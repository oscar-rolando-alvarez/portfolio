export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated } = useAuthStore()

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return navigateTo({
      path: '/auth/login',
      query: { redirect: to.fullPath }
    })
  }
})
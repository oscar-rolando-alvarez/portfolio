export default defineNuxtRouteMiddleware((to, from) => {
  const authStore = useAuthStore()

  // Check if user is authenticated
  if (!authStore.isAuthenticated) {
    // Redirect to login page
    return navigateTo('/auth/login')
  }
})
export default defineNuxtRouteMiddleware(() => {
  const authStore = useAuthStore()
  const { isAuthenticated, isAdmin } = storeToRefs(authStore)

  // Check if user is authenticated
  if (!isAuthenticated.value) {
    return navigateTo('/auth/login')
  }

  // Check if user has admin role
  if (!isAdmin.value) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access Denied - Admin privileges required'
    })
  }
})
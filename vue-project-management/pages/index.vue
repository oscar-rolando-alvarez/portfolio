<template>
  <div>
    <!-- Redirect to dashboard if authenticated, otherwise show landing page -->
  </div>
</template>

<script setup lang="ts">
const { isAuthenticated } = useAuthStore()

// Redirect based on authentication status
if (isAuthenticated) {
  await navigateTo('/dashboard')
} else {
  await navigateTo('/auth/login')
}
</script>
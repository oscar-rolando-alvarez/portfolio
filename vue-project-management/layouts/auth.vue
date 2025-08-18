<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo and Brand -->
      <div class="text-center">
        <NuxtLink to="/" class="inline-flex items-center">
          <Icon name="heroicons:squares-2x2-solid" class="h-12 w-12 text-primary-600" />
          <span class="ml-2 text-2xl font-bold text-gray-900 dark:text-white">
            Vue PM
          </span>
        </NuxtLink>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
          <slot name="title">Welcome back</slot>
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <slot name="subtitle">Sign in to your account to continue</slot>
        </p>
      </div>

      <!-- Auth Form Content -->
      <div class="bg-white dark:bg-gray-800 py-8 px-6 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700">
        <slot />
      </div>

      <!-- Footer Links -->
      <div class="text-center">
        <slot name="footer">
          <p class="text-xs text-gray-500 dark:text-gray-400">
            By signing in, you agree to our
            <NuxtLink to="/terms" class="text-primary-600 hover:text-primary-500">
              Terms of Service
            </NuxtLink>
            and
            <NuxtLink to="/privacy" class="text-primary-600 hover:text-primary-500">
              Privacy Policy
            </NuxtLink>
          </p>
        </slot>
      </div>

      <!-- Theme Toggle -->
      <div class="flex justify-center">
        <ThemeToggle />
      </div>
    </div>

    <!-- Background Pattern -->
    <div class="absolute inset-0 -z-10 overflow-hidden">
      <svg
        class="absolute left-[max(50%,25rem)] top-0 h-[64rem] w-[128rem] -translate-x-1/2 stroke-gray-200 dark:stroke-gray-800 [mask-image:radial-gradient(64rem_64rem_at_top,white,transparent)]"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="auth-pattern"
            width="200"
            height="200"
            x="50%"
            y="-1"
            patternUnits="userSpaceOnUse"
          >
            <path d="M100 200V.5M.5 .5H200" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" stroke-width="0" fill="url(#auth-pattern)" />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
// No specific logic needed for auth layout
// All authentication logic is handled in the page components
</script>

<style scoped>
/* Auth layout specific styles */
.auth-form {
  @apply space-y-6;
}

.auth-input {
  @apply block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm;
}

.auth-button {
  @apply w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed;
}

.auth-link {
  @apply text-primary-600 hover:text-primary-500 font-medium;
}
</style>
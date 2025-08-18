<template>
  <div>
    <Head>
      <Title>Sign In - Vue Project Management</Title>
    </Head>

    <NuxtLayout name="auth">
      <template #title>
        Welcome back
      </template>
      
      <template #subtitle>
        Sign in to your account to continue
      </template>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <!-- Email Field -->
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address
          </label>
          <div class="mt-1">
            <input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              required
              :disabled="isLoading"
              class="auth-input"
              :class="{ 'border-red-500 dark:border-red-400': errors.email }"
              placeholder="Enter your email"
            />
            <p v-if="errors.email" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.email }}
            </p>
          </div>
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <div class="mt-1 relative">
            <input
              id="password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              :disabled="isLoading"
              class="auth-input pr-10"
              :class="{ 'border-red-500 dark:border-red-400': errors.password }"
              placeholder="Enter your password"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              @click="showPassword = !showPassword"
            >
              <Icon
                :name="showPassword ? 'heroicons:eye-slash' : 'heroicons:eye'"
                class="h-5 w-5 text-gray-400"
              />
            </button>
            <p v-if="errors.password" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.password }}
            </p>
          </div>
        </div>

        <!-- Remember Me & Forgot Password -->
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <input
              id="remember-me"
              v-model="form.rememberMe"
              type="checkbox"
              class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label for="remember-me" class="ml-2 block text-sm text-gray-900 dark:text-gray-300">
              Remember me
            </label>
          </div>

          <div class="text-sm">
            <NuxtLink to="/auth/forgot-password" class="auth-link">
              Forgot your password?
            </NuxtLink>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="authStore.error" class="rounded-md bg-red-50 dark:bg-red-900/50 p-4">
          <div class="flex">
            <Icon name="heroicons:x-circle" class="h-5 w-5 text-red-400" />
            <div class="ml-3">
              <p class="text-sm text-red-800 dark:text-red-200">
                {{ authStore.error }}
              </p>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div>
          <button
            type="submit"
            :disabled="isLoading || !isFormValid"
            class="auth-button"
          >
            <Icon v-if="isLoading" name="heroicons:arrow-path" class="animate-spin -ml-1 mr-3 h-5 w-5" />
            {{ isLoading ? 'Signing in...' : 'Sign in' }}
          </button>
        </div>

        <!-- Demo Accounts -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <p class="text-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            Demo accounts for testing:
          </p>
          <div class="space-y-2">
            <button
              type="button"
              @click="loginAsDemo('admin')"
              :disabled="isLoading"
              class="w-full text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span class="font-medium">Admin:</span> admin@example.com / admin123
            </button>
            <button
              type="button"
              @click="loginAsDemo('manager')"
              :disabled="isLoading"
              class="w-full text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span class="font-medium">Manager:</span> manager@example.com / manager123
            </button>
            <button
              type="button"
              @click="loginAsDemo('user')"
              :disabled="isLoading"
              class="w-full text-left px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span class="font-medium">Member:</span> user@example.com / user123
            </button>
          </div>
        </div>
      </form>

      <template #footer>
        <p class="text-center text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?
          <NuxtLink to="/auth/register" class="auth-link">
            Sign up here
          </NuxtLink>
        </p>
      </template>
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// Define page meta
definePageMeta({
  layout: false,
  middleware: 'guest'
})

// Stores
const authStore = useAuthStore()

// Reactive state
const form = reactive({
  email: '',
  password: '',
  rememberMe: false
})

const errors = reactive({
  email: '',
  password: ''
})

const showPassword = ref(false)

// Computed
const isLoading = computed(() => authStore.isLoading)

const isFormValid = computed(() => {
  return form.email && form.password && !errors.email && !errors.password
})

// Methods
const validateForm = () => {
  errors.email = ''
  errors.password = ''

  if (!form.email) {
    errors.email = 'Email is required'
  } else if (!/\S+@\S+\.\S+/.test(form.email)) {
    errors.email = 'Please enter a valid email address'
  }

  if (!form.password) {
    errors.password = 'Password is required'
  } else if (form.password.length < 6) {
    errors.password = 'Password must be at least 6 characters'
  }

  return !errors.email && !errors.password
}

const handleLogin = async () => {
  if (!validateForm()) {
    return
  }

  authStore.clearError()

  const result = await authStore.login({
    email: form.email,
    password: form.password,
    rememberMe: form.rememberMe
  })

  if (result.success) {
    const route = useRoute()
    const redirectTo = (route.query.redirect as string) || '/dashboard'
    await navigateTo(redirectTo)
  }
}

const loginAsDemo = async (type: 'admin' | 'manager' | 'user') => {
  const credentials = {
    admin: { email: 'admin@example.com', password: 'admin123' },
    manager: { email: 'manager@example.com', password: 'manager123' },
    user: { email: 'user@example.com', password: 'user123' }
  }

  form.email = credentials[type].email
  form.password = credentials[type].password
  
  await handleLogin()
}

// Clear errors on input change
watch(() => form.email, () => {
  if (errors.email) errors.email = ''
})

watch(() => form.password, () => {
  if (errors.password) errors.password = ''
})

// Clear auth error when component unmounts
onUnmounted(() => {
  authStore.clearError()
})
</script>
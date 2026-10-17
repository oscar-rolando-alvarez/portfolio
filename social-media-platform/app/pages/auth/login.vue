<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <!-- Logo -->
      <div class="flex justify-center">
        <div class="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center">
          <span class="text-white font-bold text-xl">SC</span>
        </div>
      </div>
      <h2 class="mt-6 text-center text-3xl font-bold text-gray-900">
        Welcome back
      </h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        Sign in to your account to continue
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <form @submit.prevent="handleLogin" class="space-y-6">
          <!-- Email/Username -->
          <div>
            <label for="identifier" class="block text-sm font-medium text-gray-700">
              Email or Username
            </label>
            <div class="mt-1">
              <input
                id="identifier"
                v-model="form.identifier"
                type="text"
                autocomplete="email username"
                required
                class="input"
                :class="{ 'border-red-300': errors.identifier }"
                placeholder="Enter your email or username"
              />
              <p v-if="errors.identifier" class="mt-1 text-sm text-red-600">
                {{ errors.identifier }}
              </p>
            </div>
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div class="mt-1 relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                required
                class="input pr-10"
                :class="{ 'border-red-300': errors.password }"
                placeholder="Enter your password"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <EyeIcon v-if="!showPassword" class="w-5 h-5 text-gray-400" />
                <EyeSlashIcon v-else class="w-5 h-5 text-gray-400" />
              </button>
              <p v-if="errors.password" class="mt-1 text-sm text-red-600">
                {{ errors.password }}
              </p>
            </div>
          </div>

          <!-- Remember me & Forgot password -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <input
                id="remember-me"
                v-model="form.rememberMe"
                type="checkbox"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label for="remember-me" class="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>

            <div class="text-sm">
              <NuxtLink
                to="/auth/forgot-password"
                class="font-medium text-primary-600 hover:text-primary-500"
              >
                Forgot your password?
              </NuxtLink>
            </div>
          </div>

          <!-- Error message -->
          <div v-if="authStore.error" class="bg-red-50 border border-red-200 rounded-md p-4">
            <div class="flex">
              <ExclamationTriangleIcon class="w-5 h-5 text-red-400" />
              <div class="ml-3">
                <p class="text-sm text-red-800">
                  {{ authStore.error }}
                </p>
              </div>
            </div>
          </div>

          <!-- Submit button -->
          <div>
            <button
              type="submit"
              :disabled="isLoading || !isFormValid"
              class="w-full btn-primary"
              :class="{ 'opacity-50 cursor-not-allowed': isLoading || !isFormValid }"
            >
              <div v-if="isLoading" class="flex items-center justify-center">
                <div class="loading-spinner mr-2"></div>
                Signing in...
              </div>
              <span v-else>Sign in</span>
            </button>
          </div>

          <!-- Divider -->
          <div class="mt-6">
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-300" />
              </div>
              <div class="relative flex justify-center text-sm">
                <span class="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <!-- Social login buttons -->
            <div class="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="loginWithGoogle"
                class="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span class="ml-2">Google</span>
              </button>

              <button
                type="button"
                @click="loginWithGithub"
                class="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span class="ml-2">GitHub</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Sign up link -->
        <div class="mt-6">
          <div class="text-center">
            <span class="text-sm text-gray-600">
              Don't have an account?
            </span>
            <NuxtLink
              to="/auth/register"
              class="font-medium text-primary-600 hover:text-primary-500 ml-1"
            >
              Sign up
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import {
  EyeIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

// Meta
definePageMeta({
  layout: false,
  middleware: 'guest'
})

useHead({
  title: 'Sign In - SocialConnect',
  meta: [
    {
      name: 'description',
      content: 'Sign in to your SocialConnect account'
    }
  ]
})

// Stores
const authStore = useAuthStore()

// Reactive data
const showPassword = ref(false)
const form = reactive({
  identifier: '',
  password: '',
  rememberMe: false
})

const errors = reactive({
  identifier: '',
  password: ''
})

const isLoading = computed(() => authStore.isLoading)

const isFormValid = computed(() => {
  return form.identifier.trim() && form.password.trim() && !Object.values(errors).some(error => error)
})

// Methods
const validateForm = () => {
  errors.identifier = ''
  errors.password = ''

  if (!form.identifier.trim()) {
    errors.identifier = 'Email or username is required'
  }

  if (!form.password.trim()) {
    errors.password = 'Password is required'
  } else if (form.password.length < 6) {
    errors.password = 'Password must be at least 6 characters'
  }

  return !Object.values(errors).some(error => error)
}

const handleLogin = async () => {
  if (!validateForm()) return

  try {
    await authStore.login({
      identifier: form.identifier.trim(),
      password: form.password
    })
  } catch (error) {
    console.error('Login error:', error)
  }
}

const loginWithGoogle = () => {
  // TODO: Implement Google OAuth
  console.log('Login with Google')
}

const loginWithGithub = () => {
  // TODO: Implement GitHub OAuth
  console.log('Login with GitHub')
}

// Clear errors when user types
watch(() => form.identifier, () => {
  if (errors.identifier) errors.identifier = ''
})

watch(() => form.password, () => {
  if (errors.password) errors.password = ''
})
</script>
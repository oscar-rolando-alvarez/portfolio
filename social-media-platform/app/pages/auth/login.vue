<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        Welcome back
      </h1>
      <p class="text-sm text-muted">
        Sign in with your email or username
      </p>
    </div>

    <UForm
      :schema="loginSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Email or username"
        name="identifier"
      >
        <UInput
          v-model="state.identifier"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Password"
        name="password"
      >
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        :title="error"
      />
      <UButton
        type="submit"
        block
        :loading="pending"
        label="Sign in"
      />
    </UForm>

    <p class="text-center text-sm text-muted">
      New here?
      <ULink
        to="/auth/register"
        class="font-medium text-primary"
      >
        Create an account
      </ULink>
    </p>
    <p class="text-center text-xs text-muted">
      Seeded demo account: <code>alice</code> / <code>Password123</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign in' })

type Schema = z.output<typeof loginSchema>
const state = reactive<Schema>({ identifier: '', password: '' })
const pending = ref(false)
const error = ref('')
const auth = useAuthStore()
const route = useRoute()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  pending.value = true
  error.value = ''
  try {
    await auth.login(event.data.identifier, event.data.password)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch {
    error.value = 'Invalid credentials'
  } finally {
    pending.value = false
  }
}
</script>

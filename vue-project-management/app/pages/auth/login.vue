<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        Welcome back
      </h1>
      <p class="mt-1 text-sm text-muted">
        Sign in to your workspace
      </p>
    </div>

    <UForm
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Email"
        name="email"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
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
        icon="i-lucide-circle-alert"
        :title="error"
      />

      <UButton
        type="submit"
        block
        :loading="pending"
        label="Sign in"
      />
    </UForm>

    <div class="rounded-md bg-muted p-3 text-xs text-muted">
      <p class="mb-1 font-medium text-default">
        Demo accounts
      </p>
      <ul class="space-y-0.5">
        <li
          v-for="demo in demoAccounts"
          :key="demo.email"
        >
          <button
            type="button"
            class="hover:underline"
            @click="fill(demo)"
          >
            {{ demo.email }} / {{ demo.password }}
          </button>
          <span class="ml-1">({{ demo.role }})</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Sign in' })

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})
type Schema = z.output<typeof schema>

const demoAccounts = [
  { email: 'manager@example.com', password: 'manager123', role: 'manager' },
  { email: 'user@example.com', password: 'user123', role: 'member' }
]

const state = reactive<Schema>({ email: '', password: '' })
const pending = ref(false)
const error = ref('')
const route = useRoute()
const auth = useAuthStore()

function fill(demo: { email: string, password: string }) {
  state.email = demo.email
  state.password = demo.password
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  pending.value = true
  error.value = ''
  try {
    await auth.login(event.data.email, event.data.password)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/dashboard'
    await navigateTo(redirect)
  } catch {
    error.value = 'Invalid email or password'
  } finally {
    pending.value = false
  }
}
</script>

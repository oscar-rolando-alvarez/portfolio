<template>
  <div class="space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        Create your account
      </h1>
      <p class="text-sm text-muted">
        Join the conversation in under a minute
      </p>
    </div>

    <UForm
      :schema="registerSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Display name"
        name="displayName"
      >
        <UInput
          v-model="state.displayName"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Username"
        name="username"
      >
        <UInput
          v-model="state.username"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>
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
        help="8+ characters with upper, lower case and a number"
      >
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="new-password"
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
        label="Create account"
      />
    </UForm>

    <p class="text-center text-sm text-muted">
      Already have an account?
      <ULink
        to="/auth/login"
        class="font-medium text-primary"
      >
        Sign in
      </ULink>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

definePageMeta({ layout: 'auth', middleware: 'guest' })
useHead({ title: 'Create account' })

type Schema = z.input<typeof registerSchema>
const state = reactive<Schema>({ email: '', username: '', password: '', displayName: '' })
const pending = ref(false)
const error = ref('')
const auth = useAuthStore()

async function onSubmit(event: FormSubmitEvent<z.output<typeof registerSchema>>) {
  pending.value = true
  error.value = ''
  try {
    await auth.register(event.data)
    await navigateTo('/')
  } catch (err) {
    const message = (err as { data?: { statusMessage?: string } }).data?.statusMessage
    error.value = message ?? 'Registration failed'
  } finally {
    pending.value = false
  }
}
</script>

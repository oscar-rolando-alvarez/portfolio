<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">
        Who to follow
      </h2>
    </template>
    <p
      v-if="!suggestions?.length"
      class="text-sm text-muted"
    >
      You're following everyone. Nice!
    </p>
    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="person in suggestions"
        :key="person.id"
        class="flex items-center justify-between gap-2"
      >
        <NuxtLink
          :to="`/u/${person.username}`"
          class="flex min-w-0 items-center gap-2"
        >
          <UAvatar
            :src="person.avatar ?? undefined"
            :alt="person.displayName"
            size="sm"
          />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium">{{ person.displayName }}</span>
            <span class="block truncate text-xs text-muted">@{{ person.username }}</span>
          </span>
        </NuxtLink>
        <UButton
          size="xs"
          :label="followed.has(person.username) ? 'Following' : 'Follow'"
          :variant="followed.has(person.username) ? 'outline' : 'solid'"
          @click="toggle(person.username)"
        />
      </li>
    </ul>
  </UCard>
</template>

<script setup lang="ts">
import type { UserSummary } from '#shared/types'

const { data: suggestions } = await useFetch<UserSummary[]>('/api/users/suggestions', { key: 'suggestions' })
const followed = ref(new Set<string>())

async function toggle(username: string) {
  const res = await $fetch<{ following: boolean }>(`/api/users/${username}/follow`, { method: 'POST' })
  const next = new Set(followed.value)
  if (res.following) next.add(username)
  else next.delete(username)
  followed.value = next
}
</script>

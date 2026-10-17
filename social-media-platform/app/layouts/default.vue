<template>
  <div class="min-h-screen bg-muted/40">
    <header class="sticky top-0 z-20 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-semibold"
        >
          <img
            src="/icon.svg"
            alt=""
            class="size-7"
          >
          <span class="hidden sm:inline">SocialConnect</span>
        </NuxtLink>

        <nav
          v-if="user"
          class="flex items-center gap-1"
          aria-label="Primary"
        >
          <UButton
            to="/"
            icon="i-lucide-house"
            color="neutral"
            variant="ghost"
            aria-label="Home"
          />
          <UChip
            :show="unreadConversations > 0"
            :text="unreadConversations"
            size="xl"
          >
            <UButton
              to="/messages"
              icon="i-lucide-message-circle"
              color="neutral"
              variant="ghost"
              aria-label="Messages"
            />
          </UChip>
          <UChip
            :show="unreadNotifications > 0"
            :text="unreadNotifications"
            size="xl"
          >
            <UButton
              to="/notifications"
              icon="i-lucide-bell"
              color="neutral"
              variant="ghost"
              aria-label="Notifications"
            />
          </UChip>
          <UColorModeButton />
          <UDropdownMenu :items="menu">
            <UButton
              color="neutral"
              variant="ghost"
              :aria-label="`Account menu for ${user.displayName}`"
            >
              <UAvatar
                :src="user.avatar ?? undefined"
                :alt="user.displayName"
                size="sm"
              />
            </UButton>
          </UDropdownMenu>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const auth = useAuthStore()
const inbox = useInboxStore()
const { user } = storeToRefs(auth)
const { unreadConversations, unreadNotifications } = storeToRefs(inbox)

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: `@${user.value?.username ?? ''}`, type: 'label' }],
  [{ label: 'Profile', icon: 'i-lucide-user', to: `/u/${user.value?.username}` }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: async () => {
      await auth.logout()
      await navigateTo('/auth/login')
    }
  }]
])

const loadInbox = () => Promise.all([inbox.fetchConversations(), inbox.fetchNotifications()])

if (user.value) await callOnce('inbox', loadInbox)

// Reload when a different account signs in without a full page reload.
watch(() => user.value?.id, (id, previous) => {
  if (id && previous !== undefined && id !== previous) loadInbox()
})
</script>

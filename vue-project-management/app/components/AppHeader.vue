<template>
  <header class="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-default bg-default/80 px-4 backdrop-blur lg:px-6">
    <UButton
      class="lg:hidden"
      icon="i-lucide-menu"
      color="neutral"
      variant="ghost"
      aria-label="Toggle navigation"
      @click="emit('toggle-sidebar')"
    />

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search tasks..."
      class="max-w-sm flex-1"
      aria-label="Search tasks"
    />

    <div class="flex items-center gap-2">
      <ThemeToggle />
      <UDropdownMenu
        v-if="user"
        :items="menu"
      >
        <UButton
          color="neutral"
          variant="ghost"
          :label="user.name"
          trailing-icon="i-lucide-chevron-down"
        >
          <template #leading>
            <UAvatar
              :alt="user.name"
              size="xs"
            />
          </template>
        </UButton>
      </UDropdownMenu>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const auth = useAuthStore()
const tasks = useTasksStore()
const { user } = storeToRefs(auth)

const search = computed({
  get: () => tasks.filters.search ?? '',
  set: value => tasks.setFilters({ search: value })
})

const menu = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.email ?? '', type: 'label' }],
  [{
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: async () => {
      await auth.logout()
      await navigateTo('/auth/login')
    }
  }]
])
</script>

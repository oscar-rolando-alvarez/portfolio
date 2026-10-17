<template>
  <div>
    <div
      v-if="open"
      class="fixed inset-0 z-30 bg-black/40 lg:hidden"
      @click="emit('close')"
    />
    <aside
      class="fixed inset-y-0 left-0 z-40 w-64 border-r border-default bg-elevated transition-transform lg:translate-x-0"
      :class="open ? 'translate-x-0' : '-translate-x-full'"
      aria-label="Main navigation"
    >
      <div class="flex h-16 items-center gap-2 px-6 border-b border-default">
        <UIcon
          name="i-lucide-layout-grid"
          class="size-7 text-primary"
        />
        <span class="text-lg font-semibold">{{ appName }}</span>
      </div>

      <UNavigationMenu
        orientation="vertical"
        :items="links"
        class="p-4"
      />

      <div class="px-6 pt-2">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Active projects
        </p>
        <ul class="space-y-1">
          <li
            v-for="project in activeProjects"
            :key="project.id"
            class="flex items-center gap-2 text-sm"
          >
            <span
              class="size-2.5 rounded-full"
              :style="{ backgroundColor: project.color }"
            />
            <span class="truncate">{{ project.name }}</span>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { appName } = useRuntimeConfig().public
const { activeProjects } = storeToRefs(useProjectsStore())

const links: NavigationMenuItem[] = [
  { label: 'Dashboard', icon: 'i-lucide-gauge', to: '/dashboard' },
  { label: 'Tasks', icon: 'i-lucide-kanban', to: '/tasks' },
  { label: 'Projects', icon: 'i-lucide-folder-kanban', to: '/projects' }
]
</script>

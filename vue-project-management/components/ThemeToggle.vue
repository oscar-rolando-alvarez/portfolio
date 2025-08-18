<template>
  <UDropdown
    :items="themeOptions"
    :popper="{ placement: 'bottom-end' }"
  >
    <UButton
      :icon="currentThemeIcon"
      variant="ghost"
      size="sm"
      :aria-label="`Current theme: ${currentTheme}`"
    />
  </UDropdown>
</template>

<script setup lang="ts">
import { useThemeStore } from '~/stores/theme'

const themeStore = useThemeStore()
const { theme, currentTheme } = storeToRefs(themeStore)

const themeOptions = [
  [{
    label: 'Light',
    icon: 'heroicons:sun',
    click: () => themeStore.setTheme('light'),
    active: theme.value === 'light'
  }, {
    label: 'Dark', 
    icon: 'heroicons:moon',
    click: () => themeStore.setTheme('dark'),
    active: theme.value === 'dark'
  }, {
    label: 'System',
    icon: 'heroicons:computer-desktop',
    click: () => themeStore.setTheme('system'),
    active: theme.value === 'system'
  }]
]

const currentThemeIcon = computed(() => {
  if (theme.value === 'light') return 'heroicons:sun'
  if (theme.value === 'dark') return 'heroicons:moon'
  return 'heroicons:computer-desktop'
})
</script>
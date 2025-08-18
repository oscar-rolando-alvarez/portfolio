<template>
  <div id="app" :data-theme="theme">
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <UNotifications />
  </div>
</template>

<script setup lang="ts">
import { useThemeStore } from '~/stores/theme'

// Use theme store to manage theme state
const themeStore = useThemeStore()
const { theme } = storeToRefs(themeStore)

// Initialize theme on app start
onMounted(() => {
  themeStore.initializeTheme()
})

// SEO and meta configuration
useHead({
  titleTemplate: (title?: string) => {
    return title ? `${title} - Vue Project Management` : 'Vue Project Management'
  },
  meta: [
    { name: 'description', content: 'Comprehensive project management application built with Vue 3, Nuxt 3, and TypeScript' },
    { name: 'keywords', content: 'project management, kanban, gantt, vue3, nuxt3, typescript, collaboration' },
    { name: 'author', content: 'Vue Project Management Team' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: 'Vue Project Management' },
    { property: 'og:description', content: 'Comprehensive project management application built with Vue 3' },
    { property: 'og:image', content: '/og-image.png' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Vue Project Management' },
    { name: 'twitter:description', content: 'Comprehensive project management application built with Vue 3' },
    { name: 'twitter:image', content: '/og-image.png' }
  ],
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.json' }
  ]
})

// Register service worker for PWA
if (process.client && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
</script>

<style>
/* Global styles are imported in main.scss */
</style>
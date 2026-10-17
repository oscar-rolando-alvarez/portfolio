<template>
  <div class="min-h-screen bg-default">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-50 rounded-md bg-primary px-4 py-2 text-white"
    >
      Skip to main content
    </a>

    <AppSidebar
      :open="sidebarOpen"
      @close="sidebarOpen = false"
    />

    <div class="lg:pl-64">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main
        id="main-content"
        class="p-4 lg:p-6"
      >
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
const sidebarOpen = ref(false)
const route = useRoute()
watch(() => route.path, () => {
  sidebarOpen.value = false
})
</script>

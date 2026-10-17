<template>
  <div class="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 px-4 py-12">
    <div class="w-full max-w-md space-y-8">
      <div class="text-center">
        <div class="inline-flex items-center gap-2">
          <UIcon
            name="i-lucide-layout-grid"
            class="size-10 text-primary"
          />
          <span class="text-2xl font-bold">Vue PM</span>
        </div>
      </div>
      <UCard>
        <slot />
      </UCard>
      <div class="flex justify-center">
        <UColorModeButton />
      </div>
    </div>
  </div>
</template>

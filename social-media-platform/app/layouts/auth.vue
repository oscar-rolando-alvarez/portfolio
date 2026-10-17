<template>
  <div class="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 to-zinc-100 px-4 py-12 dark:from-zinc-950 dark:to-zinc-900">
    <div class="w-full max-w-md space-y-6">
      <div class="flex items-center justify-center gap-2">
        <img
          src="/icon.svg"
          alt=""
          class="size-10"
        >
        <span class="text-2xl font-bold">SocialConnect</span>
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

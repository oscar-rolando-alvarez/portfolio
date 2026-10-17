<template>
  <UCard>
    <div class="flex items-center gap-4">
      <div
        class="flex size-11 items-center justify-center rounded-lg"
        :class="tone.bg"
      >
        <UIcon
          :name="icon"
          class="size-6"
          :class="tone.fg"
        />
      </div>
      <div>
        <p class="text-sm text-muted">
          {{ title }}
        </p>
        <p
          class="text-2xl font-semibold"
          data-testid="stats-value"
        >
          {{ value }}
          <span
            v-if="total !== undefined"
            class="text-sm font-normal text-muted"
          >/ {{ total }}</span>
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string
  value: number
  total?: number
  icon: string
  color: 'blue' | 'orange' | 'green' | 'red'
}>()

const tones = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-950', fg: 'text-blue-600 dark:text-blue-400' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-950', fg: 'text-orange-600 dark:text-orange-400' },
  green: { bg: 'bg-green-100 dark:bg-green-950', fg: 'text-green-600 dark:text-green-400' },
  red: { bg: 'bg-red-100 dark:bg-red-950', fg: 'text-red-600 dark:text-red-400' }
} as const

const tone = computed(() => tones[props.color])
</script>

<template>
  <NuxtLink
    :to="to"
    class="group flex items-center rounded-md text-sm font-medium transition-colors duration-200"
    :class="[
      isActive
        ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
      isCollapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2'
    ]"
    @click="$emit('click')"
  >
    <Icon
      :name="icon"
      class="flex-shrink-0 h-5 w-5"
      :class="[
        isActive
          ? 'text-primary-600 dark:text-primary-400'
          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300',
        isCollapsed ? '' : 'mr-3'
      ]"
    />
    
    <span
      v-if="!isCollapsed"
      class="flex-1 truncate"
    >
      {{ name }}
    </span>
    
    <span
      v-if="badge && badge > 0 && !isCollapsed"
      class="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full"
      :class="[
        isActive
          ? 'bg-primary-200 dark:bg-primary-800 text-primary-800 dark:text-primary-200'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
      ]"
    >
      {{ badge > 99 ? '99+' : badge }}
    </span>

    <!-- Tooltip for collapsed state -->
    <UTooltip
      v-if="isCollapsed"
      :text="name"
      :popper="{ placement: 'right' }"
    />
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  to: string
  icon: string
  name: string
  badge?: number
  isCollapsed: boolean
}

defineProps<Props>()

defineEmits<{
  click: []
}>()

const route = useRoute()

const isActive = computed(() => {
  const to = props.to
  if (to === '/dashboard') {
    return route.path === '/dashboard' || route.path === '/'
  }
  return route.path.startsWith(to)
})
</script>
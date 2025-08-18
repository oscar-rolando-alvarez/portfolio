<template>
  <!-- Desktop Sidebar -->
  <aside
    class="hidden lg:flex lg:flex-shrink-0"
    :class="[isCollapsed ? 'lg:w-16' : 'lg:w-64']"
  >
    <div class="flex flex-col w-full">
      <div class="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
        <!-- Collapse button -->
        <div class="flex items-center justify-end px-4 mb-4">
          <button
            @click="toggleCollapse"
            class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Icon
              :name="isCollapsed ? 'heroicons:chevron-right' : 'heroicons:chevron-left'"
              class="h-5 w-5"
            />
          </button>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-2 space-y-1">
          <!-- Main Navigation -->
          <div class="space-y-1">
            <SidebarLink
              v-for="item in mainNavigation"
              :key="item.name"
              :to="item.to"
              :icon="item.icon"
              :name="item.name"
              :badge="item.badge"
              :is-collapsed="isCollapsed"
            />
          </div>

          <!-- Projects Section -->
          <div class="pt-6">
            <div
              v-if="!isCollapsed"
              class="flex items-center justify-between px-3 py-2"
            >
              <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Projects
              </h3>
              <button
                @click="openProjectModal"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Icon name="heroicons:plus" class="h-4 w-4" />
              </button>
            </div>

            <div class="space-y-1">
              <SidebarProjectLink
                v-for="project in recentProjects"
                :key="project.id"
                :project="project"
                :is-collapsed="isCollapsed"
              />
            </div>

            <SidebarLink
              to="/projects"
              icon="heroicons:folder-open"
              name="All Projects"
              :is-collapsed="isCollapsed"
              class="mt-2"
            />
          </div>

          <!-- Teams Section -->
          <div v-if="!isCollapsed" class="pt-6">
            <h3 class="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Teams
            </h3>
            <div class="space-y-1">
              <SidebarLink
                to="/teams"
                icon="heroicons:users"
                name="Team Members"
                :is-collapsed="isCollapsed"
              />
              <SidebarLink
                v-if="canManageUsers"
                to="/admin/users"
                icon="heroicons:user-group"
                name="User Management"
                :is-collapsed="isCollapsed"
              />
            </div>
          </div>
        </nav>

        <!-- User Status -->
        <div v-if="!isCollapsed" class="flex-shrink-0 px-4 py-4 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <img
                :src="user?.avatar || '/default-avatar.png'"
                :alt="user?.name"
                class="h-8 w-8 rounded-full"
              />
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ user?.name }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ user?.role }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Mobile Sidebar -->
  <div
    v-if="isMobileOpen"
    class="fixed inset-0 z-40 flex lg:hidden"
  >
    <!-- Overlay -->
    <div
      class="fixed inset-0 bg-gray-600 bg-opacity-75"
      @click="$emit('close')"
    ></div>

    <!-- Sidebar -->
    <div class="relative flex flex-col flex-1 w-full max-w-xs bg-white dark:bg-gray-900">
      <div class="absolute top-0 right-0 -mr-12 pt-2">
        <button
          @click="$emit('close')"
          class="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
        >
          <Icon name="heroicons:x-mark" class="h-6 w-6 text-white" />
        </button>
      </div>

      <div class="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
        <div class="flex items-center flex-shrink-0 px-4">
          <Icon name="heroicons:squares-2x2-solid" class="h-8 w-8 text-primary-600" />
          <span class="ml-2 text-xl font-bold text-gray-900 dark:text-white">
            Vue PM
          </span>
        </div>

        <nav class="mt-5 px-2 space-y-1">
          <!-- Main Navigation -->
          <div class="space-y-1">
            <SidebarLink
              v-for="item in mainNavigation"
              :key="item.name"
              :to="item.to"
              :icon="item.icon"
              :name="item.name"
              :badge="item.badge"
              :is-collapsed="false"
              @click="$emit('close')"
            />
          </div>

          <!-- Projects Section -->
          <div class="pt-6">
            <div class="flex items-center justify-between px-3 py-2">
              <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Projects
              </h3>
              <button
                @click="openProjectModal"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <Icon name="heroicons:plus" class="h-4 w-4" />
              </button>
            </div>

            <div class="space-y-1">
              <SidebarProjectLink
                v-for="project in recentProjects"
                :key="project.id"
                :project="project"
                :is-collapsed="false"
                @click="$emit('close')"
              />
            </div>

            <SidebarLink
              to="/projects"
              icon="heroicons:folder-open"
              name="All Projects"
              :is-collapsed="false"
              class="mt-2"
              @click="$emit('close')"
            />
          </div>
        </nav>
      </div>

      <!-- Mobile User Info -->
      <div class="flex-shrink-0 px-4 py-4 border-t border-gray-200 dark:border-gray-700">
        <NuxtLink
          to="/profile"
          class="flex items-center"
          @click="$emit('close')"
        >
          <div class="flex-shrink-0">
            <img
              :src="user?.avatar || '/default-avatar.png'"
              :alt="user?.name"
              class="h-8 w-8 rounded-full"
            />
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ user?.name }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              View profile
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useUIStore } from '~/stores/ui'
import { useProjectsStore } from '~/stores/projects'
import { useTasksStore } from '~/stores/tasks'

// Props
interface Props {
  isMobileOpen: boolean
}

defineProps<Props>()

// Emits
defineEmits<{
  close: []
}>()

// Stores
const authStore = useAuthStore()
const uiStore = useUIStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()

// Reactive state
const { user, canManageUsers } = storeToRefs(authStore)
const { layout } = storeToRefs(uiStore)
const { projects } = storeToRefs(projectsStore)
const { taskStats } = storeToRefs(tasksStore)

// Computed
const isCollapsed = computed(() => layout.value.sidebarCollapsed)

const mainNavigation = computed(() => [
  {
    name: 'Dashboard',
    to: '/dashboard',
    icon: 'heroicons:home'
  },
  {
    name: 'My Tasks',
    to: '/tasks',
    icon: 'heroicons:clipboard-document-list',
    badge: taskStats.value.todo + taskStats.value.inProgress
  },
  {
    name: 'Calendar',
    to: '/calendar',
    icon: 'heroicons:calendar-days'
  },
  {
    name: 'Time Tracking',
    to: '/time-tracking',
    icon: 'heroicons:clock'
  },
  {
    name: 'Reports',
    to: '/reports',
    icon: 'heroicons:chart-bar'
  }
])

const recentProjects = computed(() => {
  return projects.value
    .filter(project => project.status === 'active')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)
})

// Methods
const toggleCollapse = () => {
  uiStore.setSidebarCollapsed(!isCollapsed.value)
}

const openProjectModal = () => {
  uiStore.openProjectModal('create')
}

// Initialize data
onMounted(() => {
  if (projects.value.length === 0) {
    projectsStore.fetchProjects()
  }
  if (Object.values(taskStats.value).every(v => v === 0)) {
    tasksStore.fetchTasks()
  }
})
</script>
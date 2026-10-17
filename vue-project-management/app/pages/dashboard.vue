<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Welcome back, {{ firstName }}
        </h1>
        <p class="text-sm text-muted">
          Here is what is happening across your projects today.
        </p>
      </div>
      <UButton
        v-if="canEdit"
        icon="i-lucide-plus"
        label="New task"
        @click="createOpen = true"
      />
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Active projects"
        :value="projectStats.active"
        :total="projectStats.total"
        icon="i-lucide-folder"
        color="blue"
      />
      <StatsCard
        title="In progress"
        :value="taskStats.inProgress"
        :total="taskStats.total"
        icon="i-lucide-loader"
        color="orange"
      />
      <StatsCard
        title="Completed"
        :value="taskStats.completed"
        :total="taskStats.total"
        icon="i-lucide-circle-check"
        color="green"
      />
      <StatsCard
        title="Overdue"
        :value="taskStats.overdue"
        icon="i-lucide-triangle-alert"
        color="red"
      />
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">
              Project progress
            </h2>
            <ULink
              to="/projects"
              class="text-sm"
            >
              View all
            </ULink>
          </div>
        </template>
        <ul class="space-y-4">
          <li
            v-for="project in projects"
            :key="project.id"
          >
            <div class="mb-1 flex items-center justify-between text-sm">
              <span class="flex items-center gap-2 font-medium">
                <span
                  class="size-2.5 rounded-full"
                  :style="{ backgroundColor: project.color }"
                />
                {{ project.name }}
              </span>
              <span class="text-muted">{{ project.completedCount }}/{{ project.taskCount }} tasks</span>
            </div>
            <UProgress
              :model-value="project.progress"
              size="sm"
            />
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Due this week
          </h2>
        </template>
        <TaskList
          :tasks="dueSoonTasks"
          show-project
          empty-text="No deadlines in the next 7 days."
        />
      </UCard>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            My open tasks
          </h2>
          <ULink
            to="/tasks"
            class="text-sm"
          >
            Open board
          </ULink>
        </div>
      </template>
      <TaskList
        :tasks="myTasks"
        show-project
        empty-text="You have no open tasks."
      />
    </UCard>

    <TaskCreateModal v-model:open="createOpen" />
  </div>
</template>

<script setup lang="ts">
import { isOpen, sortByUrgency } from '#shared/utils/tasks'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Dashboard' })

const auth = useAuthStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const { user, canEdit } = storeToRefs(auth)
const { projects, projectStats } = storeToRefs(projectsStore)
const { taskStats, dueSoonTasks } = storeToRefs(tasksStore)

const createOpen = ref(false)
const firstName = computed(() => user.value?.name.split(' ')[0] ?? '')
const myTasks = computed(() =>
  sortByUrgency(tasksStore.tasksForAssignee(user.value?.id ?? '').filter(isOpen)).slice(0, 8)
)

await useWorkspaceData()
</script>

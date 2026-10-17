<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Projects
      </h1>
      <p class="text-sm text-muted">
        {{ projectStats.active }} active of {{ projectStats.total }} projects
      </p>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard
        v-for="project in projects"
        :key="project.id"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-2 font-semibold">
              <span
                class="size-3 rounded-full"
                :style="{ backgroundColor: project.color }"
              />
              {{ project.name }}
            </h2>
            <UBadge
              :label="statusLabel(project.status)"
              :color="project.status === 'active' ? 'success' : 'neutral'"
              variant="subtle"
            />
          </div>
        </template>
        <p class="mb-4 text-sm text-muted">
          {{ project.description }}
        </p>
        <div class="mb-1 flex justify-between text-xs text-muted">
          <span>Progress</span>
          <span>{{ project.progress }}%</span>
        </div>
        <UProgress
          :model-value="project.progress"
          size="sm"
        />
        <template #footer>
          <div class="flex items-center justify-between text-xs text-muted">
            <UAvatarGroup
              size="xs"
              :max="4"
            >
              <UAvatar
                v-for="id in project.memberIds"
                :key="id"
                :alt="memberById.get(id)?.name ?? id"
              />
            </UAvatarGroup>
            <span v-if="project.endDate">Target {{ format(new Date(project.endDate), 'MMM d, yyyy') }}</span>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import type { ProjectStatus } from '#shared/types'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Projects' })

const { projects, projectStats, memberById } = storeToRefs(useProjectsStore())

const statusLabel = (status: ProjectStatus) => status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())

await useWorkspaceData()
</script>

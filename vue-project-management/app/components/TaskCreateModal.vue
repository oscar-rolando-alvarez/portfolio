<template>
  <UModal
    v-model:open="open"
    title="New task"
  >
    <template #body>
      <UForm
        id="task-create-form"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Title"
          name="title"
          required
        >
          <UInput
            v-model="state.title"
            class="w-full"
            autofocus
          />
        </UFormField>
        <UFormField
          label="Description"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            class="w-full"
            :rows="3"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField
            label="Project"
            name="projectId"
            required
          >
            <USelect
              v-model="state.projectId"
              :items="projectItems"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Priority"
            name="priority"
          >
            <USelect
              v-model="state.priority"
              :items="priorityItems"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField
          label="Assignees"
          name="assigneeIds"
        >
          <USelect
            v-model="state.assigneeIds"
            :items="memberItems"
            multiple
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="open = false"
        />
        <UButton
          type="submit"
          form="task-create-form"
          :loading="pending"
          label="Create task"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Priority, TaskStatus } from '#shared/types'
import { PRIORITY_LABELS } from '#shared/utils/tasks'

const props = withDefaults(defineProps<{ status?: TaskStatus }>(), { status: 'todo' })
const open = defineModel<boolean>('open', { default: false })

const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(140),
  description: z.string().max(2000),
  projectId: z.string().min(1, 'Choose a project'),
  priority: z.number().int().min(1).max(4),
  assigneeIds: z.array(z.string())
})
type Schema = z.output<typeof schema>

const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const toast = useToast()

const blank = (): Schema => ({
  title: '',
  description: '',
  projectId: projectsStore.activeProjects[0]?.id ?? '',
  priority: 2,
  assigneeIds: []
})
const state = reactive<Schema>(blank())
const pending = ref(false)

const projectItems = computed(() => projectsStore.projects.map(p => ({ label: p.name, value: p.id })))
const memberItems = computed(() => projectsStore.members.map(m => ({ label: m.name, value: m.id })))
const priorityItems = (Object.entries(PRIORITY_LABELS) as [string, string][]).map(([value, label]) => ({ label, value: Number(value) }))

watch(open, (isOpen) => {
  if (isOpen) Object.assign(state, blank())
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  pending.value = true
  try {
    await tasksStore.createTask({
      ...event.data,
      priority: event.data.priority as Priority,
      status: props.status
    })
    toast.add({ title: 'Task created', color: 'success', icon: 'i-lucide-check' })
    open.value = false
  } catch {
    toast.add({ title: 'Could not create task', color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

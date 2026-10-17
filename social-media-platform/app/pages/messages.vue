<template>
  <div class="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 md:grid-cols-3">
    <UCard
      class="overflow-y-auto"
      :class="activeId ? 'hidden md:block' : ''"
    >
      <template #header>
        <h1 class="font-semibold">
          Messages
        </h1>
      </template>
      <p
        v-if="conversations.length === 0"
        class="text-sm text-muted"
      >
        No conversations yet. Open a profile and press the message button.
      </p>
      <ul class="space-y-1">
        <li
          v-for="convo in conversations"
          :key="convo.id"
        >
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-elevated"
            :class="convo.id === activeId ? 'bg-elevated' : ''"
            @click="select(convo.id)"
          >
            <UChip
              :show="convo.unread"
              inset
            >
              <UAvatar
                :src="convo.participants[0]?.avatar ?? undefined"
                :alt="convo.participants[0]?.displayName"
              />
            </UChip>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ convo.participants.map(p => p.displayName).join(', ') }}</span>
              <span class="block truncate text-xs text-muted">{{ convo.lastMessage?.content ?? 'Say hello' }}</span>
            </span>
          </button>
        </li>
      </ul>
    </UCard>

    <UCard
      class="flex flex-col md:col-span-2"
      :class="activeId ? '' : 'hidden md:flex'"
      :ui="{ body: 'flex-1 overflow-y-auto space-y-2' }"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <UButton
            class="md:hidden"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Back to conversations"
            @click="activeId = null"
          />
          <span class="font-semibold">{{ activeTitle }}</span>
        </div>
      </template>

      <p
        v-if="!activeId"
        class="text-sm text-muted"
      >
        Select a conversation.
      </p>
      <div
        v-for="msg in activeMessages"
        :key="msg.id"
        class="flex"
        :class="msg.sender.id === user?.id ? 'justify-end' : 'justify-start'"
      >
        <p
          class="max-w-[75%] rounded-2xl px-3 py-2 text-sm"
          :class="msg.sender.id === user?.id ? 'bg-primary text-inverted' : 'bg-elevated'"
        >
          {{ msg.content }}
        </p>
      </div>
      <div ref="bottom" />

      <template
        v-if="activeId"
        #footer
      >
        <form
          class="flex gap-2"
          @submit.prevent="send"
        >
          <UInput
            v-model="draft"
            placeholder="Type a message"
            class="flex-1"
            :maxlength="4000"
            aria-label="Message"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            aria-label="Send"
            :disabled="!draft.trim()"
          />
        </form>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Messages' })

const route = useRoute()
const router = useRouter()
const inbox = useInboxStore()
const { user } = storeToRefs(useAuthStore())
const { conversations, messages } = storeToRefs(inbox)

const activeId = ref<string | null>(typeof route.query.c === 'string' ? route.query.c : null)
const draft = ref('')
const bottom = useTemplateRef<HTMLDivElement>('bottom')

const activeMessages = computed(() => (activeId.value ? messages.value[activeId.value] ?? [] : []))
const activeTitle = computed(() => {
  const convo = conversations.value.find(c => c.id === activeId.value)
  return convo ? convo.participants.map(p => p.displayName).join(', ') : 'Conversation'
})

async function select(id: string) {
  activeId.value = id
  router.replace({ query: { c: id } })
}

async function send() {
  if (!activeId.value || !draft.value.trim()) return
  const content = draft.value
  draft.value = ''
  await inbox.sendMessage(activeId.value, content)
}

watch(activeId, async (id) => {
  inbox.activeConversationId = id
  if (id) await inbox.openConversation(id)
}, { immediate: import.meta.client })

watch(() => activeMessages.value.length, () => nextTick(() => bottom.value?.scrollIntoView({ behavior: 'smooth' })))

onBeforeUnmount(() => {
  inbox.activeConversationId = null
})
</script>

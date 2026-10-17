<template>
  <UCard
    as="article"
    :ui="{ body: 'space-y-3' }"
  >
    <header class="flex items-start justify-between gap-3">
      <NuxtLink
        :to="`/u/${post.author.username}`"
        class="flex items-center gap-3"
      >
        <UAvatar
          :src="post.author.avatar ?? undefined"
          :alt="post.author.displayName"
        />
        <div class="leading-tight">
          <p class="flex items-center gap-1 font-medium">
            {{ post.author.displayName }}
            <UIcon
              v-if="post.author.verified"
              name="i-lucide-badge-check"
              class="size-4 text-primary"
              aria-label="Verified"
            />
          </p>
          <p class="text-xs text-muted">
            @{{ post.author.username }} · <time :datetime="post.createdAt">{{ relativeTime }}</time>
          </p>
        </div>
      </NuxtLink>
      <div class="flex items-center gap-1">
        <UBadge
          v-if="post.visibility === 'FOLLOWERS'"
          label="Followers"
          icon="i-lucide-users"
          color="neutral"
          variant="subtle"
          size="sm"
        />
        <UBadge
          v-if="post.moderation === 'FLAGGED'"
          label="Under review"
          icon="i-lucide-shield-alert"
          color="warning"
          variant="subtle"
          size="sm"
        />
      </div>
    </header>

    <p
      class="whitespace-pre-line"
      data-testid="post-content"
    >
      {{ post.content }}
    </p>

    <div
      v-if="post.images.length"
      class="grid gap-2"
      :class="post.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'"
    >
      <img
        v-for="src in post.images"
        :key="src"
        :src="src"
        alt=""
        loading="lazy"
        class="max-h-96 w-full rounded-lg object-cover"
      >
    </div>

    <footer class="flex items-center gap-2 pt-1">
      <UButton
        icon="i-lucide-heart"
        :color="post.isLiked ? 'error' : 'neutral'"
        :variant="post.isLiked ? 'soft' : 'ghost'"
        :label="String(post.likesCount)"
        :aria-pressed="post.isLiked"
        aria-label="Like"
        data-testid="like-button"
        @click="emit('like', post.id)"
      />
      <UButton
        icon="i-lucide-message-circle"
        color="neutral"
        variant="ghost"
        :label="String(post.commentsCount)"
        aria-label="Comments"
        data-testid="comments-button"
        @click="toggleComments"
      />
    </footer>

    <section
      v-if="showComments"
      class="space-y-3 border-t border-default pt-3"
    >
      <p
        v-if="loadingComments"
        class="text-sm text-muted"
      >
        Loading comments...
      </p>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="comment in comments"
          :key="comment.id"
          class="text-sm"
        >
          <NuxtLink
            :to="`/u/${comment.author.username}`"
            class="font-medium"
          >
            {{ comment.author.displayName }}
          </NuxtLink>
          {{ comment.content }}
        </li>
      </ul>
      <form
        class="flex gap-2"
        @submit.prevent="submitComment"
      >
        <UInput
          v-model="draft"
          placeholder="Write a comment..."
          class="flex-1"
          :maxlength="1000"
        />
        <UButton
          type="submit"
          label="Reply"
          :disabled="!draft.trim()"
          :loading="sending"
        />
      </form>
    </section>
  </UCard>
</template>

<script setup lang="ts">
import { formatDistanceToNowStrict } from 'date-fns'
import type { CommentDTO, PostDTO } from '#shared/types'

const props = defineProps<{ post: PostDTO }>()
const emit = defineEmits<{ like: [postId: string], commented: [postId: string] }>()

const relativeTime = computed(() => formatDistanceToNowStrict(new Date(props.post.createdAt), { addSuffix: true }))

const showComments = ref(false)
const loadingComments = ref(false)
const comments = ref<CommentDTO[]>([])
const draft = ref('')
const sending = ref(false)

async function toggleComments() {
  showComments.value = !showComments.value
  if (showComments.value && comments.value.length === 0) {
    loadingComments.value = true
    try {
      comments.value = await $fetch<CommentDTO[]>(`/api/posts/${props.post.id}/comments`)
    } finally {
      loadingComments.value = false
    }
  }
}

async function submitComment() {
  if (!draft.value.trim()) return
  sending.value = true
  try {
    const comment = await $fetch<CommentDTO>(`/api/posts/${props.post.id}/comments`, {
      method: 'POST',
      body: { content: draft.value }
    })
    comments.value.push(comment)
    draft.value = ''
    emit('commented', props.post.id)
  } finally {
    sending.value = false
  }
}
</script>

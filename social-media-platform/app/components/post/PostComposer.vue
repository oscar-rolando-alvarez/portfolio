<template>
  <UCard>
    <form
      class="space-y-3"
      @submit.prevent="submit"
    >
      <UTextarea
        v-model="content"
        :placeholder="`What's happening, ${firstName}?`"
        :rows="3"
        :maxlength="2000"
        autoresize
        class="w-full"
        aria-label="Post content"
      />
      <UInput
        v-if="showImage"
        v-model="imageUrl"
        type="url"
        placeholder="https://... image URL"
        icon="i-lucide-image"
        class="w-full"
      />
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-image-plus"
            color="neutral"
            variant="ghost"
            aria-label="Attach image URL"
            @click="showImage = !showImage"
          />
          <USelect
            v-model="visibility"
            :items="visibilityItems"
            size="sm"
            class="w-36"
          />
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-muted">{{ content.length }}/2000</span>
          <UButton
            type="submit"
            label="Post"
            :disabled="!content.trim()"
            :loading="pending"
          />
        </div>
      </div>
    </form>
  </UCard>
</template>

<script setup lang="ts">
import type { PostVisibility } from '#shared/types'

const auth = useAuthStore()
const posts = usePostsStore()
const toast = useToast()

const content = ref('')
const imageUrl = ref('')
const showImage = ref(false)
const visibility = ref<PostVisibility>('PUBLIC')
const pending = ref(false)

const firstName = computed(() => auth.user?.displayName.split(' ')[0] ?? '')
const visibilityItems = [
  { label: 'Public', value: 'PUBLIC', icon: 'i-lucide-globe' },
  { label: 'Followers', value: 'FOLLOWERS', icon: 'i-lucide-users' }
]

async function submit() {
  pending.value = true
  try {
    const post = await posts.createPost({
      content: content.value,
      images: imageUrl.value ? [imageUrl.value] : [],
      visibility: visibility.value
    })
    content.value = ''
    imageUrl.value = ''
    showImage.value = false
    if (post.moderation === 'FLAGGED') {
      toast.add({ title: 'Post held for review', description: 'Only you can see it until a moderator approves it.', color: 'warning' })
    }
  } catch {
    toast.add({ title: 'Could not publish post', color: 'error' })
  } finally {
    pending.value = false
  }
}
</script>

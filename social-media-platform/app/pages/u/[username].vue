<template>
  <div
    v-if="data"
    class="mx-auto max-w-2xl space-y-6"
  >
    <UCard>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-4">
          <UAvatar
            :src="profile!.avatar ?? undefined"
            :alt="profile!.displayName"
            size="3xl"
          />
          <div>
            <h1 class="flex items-center gap-1 text-xl font-bold">
              {{ profile!.displayName }}
              <UIcon
                v-if="profile!.verified"
                name="i-lucide-badge-check"
                class="size-5 text-primary"
              />
            </h1>
            <p class="text-sm text-muted">
              @{{ profile!.username }} · joined {{ joined }}
            </p>
          </div>
        </div>
        <div
          v-if="!profile!.isSelf"
          class="flex gap-2"
        >
          <UButton
            :label="profile!.isFollowing ? 'Following' : 'Follow'"
            :variant="profile!.isFollowing ? 'outline' : 'solid'"
            :loading="busy"
            @click="toggleFollow"
          />
          <UButton
            icon="i-lucide-message-circle"
            color="neutral"
            variant="outline"
            aria-label="Send message"
            @click="message"
          />
        </div>
      </div>
      <p
        v-if="profile!.bio"
        class="mt-4"
      >
        {{ profile!.bio }}
      </p>
      <dl class="mt-4 flex gap-6 text-sm">
        <div>
          <dt class="inline text-muted">
            Posts
          </dt><dd class="inline font-semibold">
            {{ profile!.postsCount }}
          </dd>
        </div>
        <div>
          <dt class="inline text-muted">
            Followers
          </dt><dd class="inline font-semibold">
            {{ profile!.followersCount }}
          </dd>
        </div>
        <div>
          <dt class="inline text-muted">
            Following
          </dt><dd class="inline font-semibold">
            {{ profile!.followingCount }}
          </dd>
        </div>
      </dl>
    </UCard>

    <PostCard
      v-for="post in data.posts"
      :key="post.id"
      :post="post"
      @like="like"
    />
    <p
      v-if="data.posts.length === 0"
      class="text-center text-muted"
    >
      No posts yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import type { PostDTO, UserProfile } from '#shared/types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const inbox = useInboxStore()
const username = computed(() => String(route.params.username))
const { data, error } = await useFetch<{ profile: UserProfile, posts: PostDTO[] }>(() => `/api/users/${username.value}`)
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 404, statusMessage: 'User not found', fatal: true })
}

const profile = computed(() => data.value?.profile)
const joined = computed(() => (profile.value ? format(new Date(profile.value.createdAt), 'MMMM yyyy') : ''))
useHead({ title: () => profile.value?.displayName ?? 'Profile' })

const busy = ref(false)
async function toggleFollow() {
  if (!profile.value) return
  busy.value = true
  try {
    const res = await $fetch<{ following: boolean, followersCount: number }>(`/api/users/${profile.value.username}/follow`, { method: 'POST' })
    profile.value.isFollowing = res.following
    profile.value.followersCount = res.followersCount
  } finally {
    busy.value = false
  }
}

async function like(postId: string) {
  const post = data.value?.posts.find(p => p.id === postId)
  if (!post) return
  const res = await $fetch<{ liked: boolean, likesCount: number }>(`/api/posts/${postId}/like`, { method: 'POST' })
  post.isLiked = res.liked
  post.likesCount = res.likesCount
}

async function message() {
  if (!profile.value) return
  const id = await inbox.startConversation(profile.value.username)
  await navigateTo({ path: '/messages', query: { c: id } })
}
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <section
      class="space-y-4 lg:col-span-2"
      aria-label="Home feed"
    >
      <PostComposer />

      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        @like="like"
        @commented="postsStore.incrementComments"
      />

      <p
        v-if="!loading && posts.length === 0"
        class="py-10 text-center text-muted"
      >
        Your feed is empty. Follow a few people to get started.
      </p>

      <div
        v-if="hasMore"
        class="flex justify-center"
      >
        <UButton
          color="neutral"
          variant="outline"
          :loading="loading"
          label="Load more"
          @click="postsStore.fetchFeed()"
        />
      </div>
    </section>

    <aside class="hidden space-y-4 lg:block">
      <WhoToFollow />
    </aside>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Home' })

const postsStore = usePostsStore()
const { posts, loading, hasMore } = storeToRefs(postsStore)
const toast = useToast()

async function like(postId: string) {
  try {
    await postsStore.toggleLike(postId)
  } catch {
    toast.add({ title: 'Could not update like', color: 'error' })
  }
}

await callOnce('feed', () => postsStore.fetchFeed(true), { mode: 'navigation' })
</script>

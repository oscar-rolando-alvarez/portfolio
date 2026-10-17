<template>
  <div class="mx-auto max-w-2xl">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h1 class="font-semibold">
            Notifications
          </h1>
          <UButton
            v-if="unreadNotifications > 0"
            size="sm"
            variant="ghost"
            label="Mark all as read"
            @click="inbox.markNotificationsRead()"
          />
        </div>
      </template>
      <p
        v-if="notifications.length === 0"
        class="text-sm text-muted"
      >
        Nothing new yet.
      </p>
      <ul class="divide-y divide-default">
        <li
          v-for="item in notifications"
          :key="item.id"
          class="flex items-center gap-3 py-3"
          :class="item.read ? '' : 'font-medium'"
        >
          <UIcon
            :name="icons[item.type]"
            class="size-5 text-primary"
          />
          <span class="flex-1 text-sm">
            <NuxtLink
              v-if="item.actor"
              :to="`/u/${item.actor.username}`"
              class="font-semibold"
            >{{ item.actor.displayName }}</NuxtLink>
            {{ verbs[item.type] }}
          </span>
          <time
            class="text-xs text-muted"
            :datetime="item.createdAt"
          >{{ formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true }) }}</time>
        </li>
      </ul>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { formatDistanceToNowStrict } from 'date-fns'
import type { NotificationType } from '#shared/types'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Notifications' })

const inbox = useInboxStore()
const { notifications, unreadNotifications } = storeToRefs(inbox)

const icons: Record<NotificationType, string> = {
  LIKE: 'i-lucide-heart',
  COMMENT: 'i-lucide-message-square',
  FOLLOW: 'i-lucide-user-plus',
  MESSAGE: 'i-lucide-mail'
}
const verbs: Record<NotificationType, string> = {
  LIKE: 'liked your post',
  COMMENT: 'commented on your post',
  FOLLOW: 'started following you',
  MESSAGE: 'sent you a message'
}

await callOnce('notifications-page', () => inbox.fetchNotifications(), { mode: 'navigation' })
</script>

import { defineStore } from 'pinia'
import type { ConversationDTO, MessageDTO, NotificationDTO, RealtimeEvent } from '#shared/types'

/** Direct messages and notifications, kept live by the WebSocket plugin. */
export const useInboxStore = defineStore('inbox', () => {
  const conversations = ref<ConversationDTO[]>([])
  const messages = ref<Record<string, MessageDTO[]>>({})
  const activeConversationId = ref<string | null>(null)
  const notifications = ref<NotificationDTO[]>([])

  const unreadConversations = computed(() => conversations.value.filter(c => c.unread).length)
  const unreadNotifications = computed(() => notifications.value.filter(n => !n.read).length)

  async function fetchConversations() {
    conversations.value = await useRequestFetch()<ConversationDTO[]>('/api/conversations')
  }

  async function openConversation(id: string) {
    activeConversationId.value = id
    messages.value[id] = await $fetch<MessageDTO[]>(`/api/conversations/${id}/messages`)
    const convo = conversations.value.find(c => c.id === id)
    if (convo) convo.unread = false
  }

  async function startConversation(username: string) {
    const { id } = await $fetch<{ id: string }>('/api/conversations', { method: 'POST', body: { username } })
    await fetchConversations()
    return id
  }

  async function sendMessage(conversationId: string, content: string) {
    const message = await $fetch<MessageDTO>(`/api/conversations/${conversationId}/messages`, { method: 'POST', body: { content } })
    receiveMessage(message, true)
  }

  function receiveMessage(message: MessageDTO, own = false) {
    const list = (messages.value[message.conversationId] ??= [])
    if (!list.some(m => m.id === message.id)) list.push(message)

    const convo = conversations.value.find(c => c.id === message.conversationId)
    if (convo) {
      convo.lastMessage = message
      convo.lastMessageAt = message.createdAt
      convo.unread = !own && activeConversationId.value !== message.conversationId
      conversations.value = [convo, ...conversations.value.filter(c => c.id !== convo.id)]
    }
  }

  async function fetchNotifications() {
    notifications.value = await useRequestFetch()<NotificationDTO[]>('/api/notifications')
  }

  async function markNotificationsRead() {
    await $fetch('/api/notifications/read', { method: 'POST' })
    notifications.value.forEach((n) => {
      n.read = true
    })
  }

  function handleRealtime(event: RealtimeEvent) {
    if (event.type === 'message') receiveMessage(event.message)
    else if (event.type === 'notification') notifications.value.unshift(event.notification)
  }

  return {
    conversations,
    messages,
    activeConversationId,
    notifications,
    unreadConversations,
    unreadNotifications,
    fetchConversations,
    openConversation,
    startConversation,
    sendMessage,
    receiveMessage,
    fetchNotifications,
    markNotificationsRead,
    handleRealtime
  }
})

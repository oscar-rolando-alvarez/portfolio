import { defineStore } from 'pinia'
import type { Message, Conversation, MessageForm, TypingIndicator, ApiResponse } from '~/types'

interface MessagingState {
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Message[]
  isLoading: boolean
  isConnected: boolean
  typingUsers: TypingIndicator[]
  error: string | null
  socket: any // WebSocket instance
}

export const useMessagingStore = defineStore('messaging', {
  state: (): MessagingState => ({
    conversations: [],
    currentConversation: null,
    messages: [],
    isLoading: false,
    isConnected: false,
    typingUsers: [],
    error: null,
    socket: null
  }),

  getters: {
    unreadConversationsCount: (state) => 
      state.conversations.filter(c => c.unreadCount && c.unreadCount > 0).length,
    
    totalUnreadCount: (state) => 
      state.conversations.reduce((total, c) => total + (c.unreadCount || 0), 0),

    conversationMessages: (state) => state.messages,

    isTyping: (state) => (conversationId: string) => 
      state.typingUsers.some(tu => tu.conversationId === conversationId && tu.isTyping)
  },

  actions: {
    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setConversations(conversations: Conversation[]) {
      this.conversations = conversations
    },

    addConversation(conversation: Conversation) {
      const existing = this.conversations.find(c => c.id === conversation.id)
      if (!existing) {
        this.conversations.unshift(conversation)
      }
    },

    updateConversation(conversationId: string, updates: Partial<Conversation>) {
      const index = this.conversations.findIndex(c => c.id === conversationId)
      if (index !== -1) {
        this.conversations[index] = { ...this.conversations[index], ...updates }
      }
      if (this.currentConversation?.id === conversationId) {
        this.currentConversation = { ...this.currentConversation, ...updates }
      }
    },

    setCurrentConversation(conversation: Conversation | null) {
      this.currentConversation = conversation
      if (conversation) {
        this.markConversationAsRead(conversation.id)
      }
    },

    setMessages(messages: Message[]) {
      this.messages = messages
    },

    addMessage(message: Message) {
      this.messages.push(message)
      
      // Update conversation's last message
      this.updateConversation(message.conversationId, {
        lastMessage: message,
        lastMessageAt: message.createdAt
      })

      // Increment unread count if not current conversation
      if (this.currentConversation?.id !== message.conversationId) {
        const conversation = this.conversations.find(c => c.id === message.conversationId)
        if (conversation) {
          this.updateConversation(message.conversationId, {
            unreadCount: (conversation.unreadCount || 0) + 1
          })
        }
      }
    },

    updateMessage(messageId: string, updates: Partial<Message>) {
      const index = this.messages.findIndex(m => m.id === messageId)
      if (index !== -1) {
        this.messages[index] = { ...this.messages[index], ...updates }
      }
    },

    setTyping(indicator: TypingIndicator) {
      const existing = this.typingUsers.findIndex(
        tu => tu.conversationId === indicator.conversationId && tu.userId === indicator.userId
      )

      if (indicator.isTyping) {
        if (existing === -1) {
          this.typingUsers.push(indicator)
        } else {
          this.typingUsers[existing] = indicator
        }
      } else {
        if (existing !== -1) {
          this.typingUsers.splice(existing, 1)
        }
      }
    },

    async initializeWebSocket() {
      const authStore = useAuthStore()
      if (!authStore.accessToken || this.socket) return

      try {
        const { io } = await import('socket.io-client')
        
        this.socket = io(window.location.origin, {
          auth: {
            token: authStore.accessToken
          }
        })

        this.socket.on('connect', () => {
          this.isConnected = true
          console.log('WebSocket connected')
        })

        this.socket.on('disconnect', () => {
          this.isConnected = false
          console.log('WebSocket disconnected')
        })

        this.socket.on('message', (message: Message) => {
          this.addMessage(message)
        })

        this.socket.on('typing', (indicator: TypingIndicator) => {
          this.setTyping(indicator)
        })

        this.socket.on('message-read', (data: { messageId: string; readAt: string }) => {
          this.updateMessage(data.messageId, { readAt: data.readAt })
        })

        this.socket.on('conversation-updated', (conversation: Conversation) => {
          this.updateConversation(conversation.id, conversation)
        })

      } catch (error) {
        console.error('WebSocket initialization error:', error)
        this.setError('Failed to connect to messaging service')
      }
    },

    disconnectWebSocket() {
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
        this.isConnected = false
      }
    },

    async fetchConversations() {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<Conversation[]>>('/api/messages/conversations', {
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.setConversations(data)
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load conversations')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async fetchMessages(conversationId: string) {
      this.setLoading(true)
      this.setError(null)

      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<Message[]>>(`/api/messages/conversations/${conversationId}/messages`, {
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.setMessages(data)
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to load messages')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async sendMessage(conversationId: string, messageData: MessageForm) {
      try {
        const authStore = useAuthStore()
        const formData = new FormData()
        
        if (messageData.content) formData.append('content', messageData.content)
        formData.append('type', messageData.type)
        if (messageData.replyToId) formData.append('replyToId', messageData.replyToId)

        // Append images
        messageData.images?.forEach((image) => {
          formData.append('images', image)
        })

        // Append videos
        messageData.videos?.forEach((video) => {
          formData.append('videos', video)
        })

        const { data } = await $fetch<ApiResponse<{ message: Message }>>(`/api/messages/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          // Message will be added via WebSocket
          return data.message
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to send message')
        throw error
      }
    },

    async createConversation(participantIds: string[], type: 'DIRECT' | 'GROUP' = 'DIRECT', name?: string) {
      try {
        const authStore = useAuthStore()
        const { data } = await $fetch<ApiResponse<{ conversation: Conversation }>>('/api/messages/conversations', {
          method: 'POST',
          body: { participantIds, type, name },
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        if (data) {
          this.addConversation(data.conversation)
          return data.conversation
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to create conversation')
        throw error
      }
    },

    async markConversationAsRead(conversationId: string) {
      try {
        const authStore = useAuthStore()
        await $fetch(`/api/messages/conversations/${conversationId}/read`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        // Update local state
        this.updateConversation(conversationId, { unreadCount: 0 })
      } catch (error: any) {
        console.error('Failed to mark conversation as read:', error)
      }
    },

    async deleteMessage(messageId: string) {
      try {
        const authStore = useAuthStore()
        await $fetch(`/api/messages/${messageId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${authStore.accessToken}`
          }
        })

        // Remove message from local state
        this.messages = this.messages.filter(m => m.id !== messageId)
      } catch (error: any) {
        this.setError(error.data?.message || 'Failed to delete message')
        throw error
      }
    },

    startTyping(conversationId: string) {
      if (this.socket && this.isConnected) {
        this.socket.emit('typing-start', { conversationId })
      }
    },

    stopTyping(conversationId: string) {
      if (this.socket && this.isConnected) {
        this.socket.emit('typing-stop', { conversationId })
      }
    },

    // Reset store state
    reset() {
      this.conversations = []
      this.currentConversation = null
      this.messages = []
      this.isLoading = false
      this.typingUsers = []
      this.error = null
      this.disconnectWebSocket()
    }
  }
})
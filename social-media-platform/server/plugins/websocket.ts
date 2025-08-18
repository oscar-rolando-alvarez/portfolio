import { Server as SocketIOServer } from 'socket.io'
import { authService } from '../utils/auth'
import { usePrisma } from '../utils/prisma'

interface SocketData {
  userId: string
  username: string
}

export default defineNitroPlugin(async (nitroApp) => {
  const io = new SocketIOServer({
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  })

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      
      if (!token) {
        return next(new Error('Authentication token required'))
      }

      const user = await authService.getUserFromToken(token)
      
      if (!user) {
        return next(new Error('Invalid token'))
      }

      socket.data = {
        userId: user.id,
        username: user.username
      } as SocketData

      next()
    } catch (error) {
      next(new Error('Authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    const userData = socket.data as SocketData
    console.log(`User ${userData.username} connected`)

    // Join user to their personal room
    socket.join(`user:${userData.userId}`)

    // Join user's conversations
    joinUserConversations(socket, userData.userId)

    // Handle typing indicators
    socket.on('typing-start', (data) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId: userData.userId,
        username: userData.username,
        isTyping: true
      })
    })

    socket.on('typing-stop', (data) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing', {
        conversationId: data.conversationId,
        userId: userData.userId,
        username: userData.username,
        isTyping: false
      })
    })

    // Handle message read receipts
    socket.on('message-read', async (data) => {
      try {
        const { messageId, conversationId } = data
        const { prisma } = usePrisma()

        // Update message read status
        await prisma.message.update({
          where: { id: messageId },
          data: { readAt: new Date() }
        })

        // Broadcast read receipt to conversation
        socket.to(`conversation:${conversationId}`).emit('message-read', {
          messageId,
          readAt: new Date().toISOString(),
          readBy: userData.userId
        })
      } catch (error) {
        console.error('Message read error:', error)
      }
    })

    // Handle joining/leaving conversations
    socket.on('join-conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`)
    })

    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`)
    })

    // Handle user status updates
    socket.on('status-update', (status) => {
      socket.broadcast.emit('user-status', {
        userId: userData.userId,
        status
      })
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${userData.username} disconnected`)
      
      // Broadcast offline status
      socket.broadcast.emit('user-status', {
        userId: userData.userId,
        status: 'offline'
      })
    })
  })

  // Store io instance globally for use in API routes
  globalThis.io = io

  nitroApp.hooks.hook('close', async () => {
    io.close()
  })
})

async function joinUserConversations(socket: any, userId: string) {
  try {
    const { prisma } = usePrisma()
    
    const conversations = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true }
    })

    conversations.forEach(conversation => {
      socket.join(`conversation:${conversation.conversationId}`)
    })
  } catch (error) {
    console.error('Error joining user conversations:', error)
  }
}

// Utility functions for sending real-time notifications
export const sendNotification = (userId: string, notification: any) => {
  if (globalThis.io) {
    globalThis.io.to(`user:${userId}`).emit('notification', notification)
  }
}

export const sendMessage = (conversationId: string, message: any) => {
  if (globalThis.io) {
    globalThis.io.to(`conversation:${conversationId}`).emit('message', message)
  }
}

export const broadcastToConversation = (conversationId: string, event: string, data: any) => {
  if (globalThis.io) {
    globalThis.io.to(`conversation:${conversationId}`).emit(event, data)
  }
}
import { z } from 'zod'
import multiparty from 'multiparty'
import { usePrisma } from '../../../../utils/prisma'
import { sendMessage } from '../../../../plugins/websocket'

const messageSchema = z.object({
  content: z.string().max(2000).optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE']).default('TEXT'),
  replyToId: z.string().optional()
})

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    const conversationId = getRouterParam(event, 'id')
    if (!conversationId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Conversation ID is required'
      })
    }

    // Parse multipart form data
    const form = new multiparty.Form()
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(event.node.req, (err, fields, files) => {
        if (err) reject(err)
        else resolve({ fields, files })
      })
    })

    // Extract form data
    const formData = {
      content: fields.content?.[0],
      type: fields.type?.[0] || 'TEXT',
      replyToId: fields.replyToId?.[0]
    }

    const { content, type, replyToId } = messageSchema.parse(formData)

    // Validate content or media
    if (!content && (!files.images?.length && !files.videos?.length && !files.audio?.length)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Message must have content or media'
      })
    }

    const { prisma } = usePrisma()

    // Verify user is participant in conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: user.id
        }
      }
    })

    if (!participant) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Not a participant in this conversation'
      })
    }

    // Process uploaded files
    const images = []
    const videos = []

    if (files.images) {
      for (const file of files.images) {
        const imageUrl = await uploadAndCompressImage(file)
        images.push(imageUrl)
      }
    }

    if (files.videos) {
      for (const file of files.videos) {
        const videoUrl = await uploadAndCompressVideo(file)
        videos.push(videoUrl)
      }
    }

    // Get receiver for direct messages
    let receiverId = null
    if (type === 'DIRECT') {
      const otherParticipant = await prisma.conversationParticipant.findFirst({
        where: {
          conversationId,
          userId: { not: user.id }
        }
      })
      receiverId = otherParticipant?.userId
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content,
        images,
        videos,
        type,
        conversationId,
        senderId: user.id,
        receiverId,
        replyToId
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                username: true,
                displayName: true
              }
            }
          }
        }
      }
    })

    // Update conversation last message timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() }
    })

    // Send real-time message to conversation participants
    sendMessage(conversationId, message)

    // Send push notifications to offline participants
    const participants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: user.id }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      }
    })

    // Create notifications for participants
    for (const participant of participants) {
      await prisma.notification.create({
        data: {
          type: 'MESSAGE',
          title: 'New Message',
          content: `${user.displayName || user.username}: ${content || 'Sent a media file'}`,
          data: {
            conversationId,
            messageId: message.id,
            senderId: user.id
          },
          userId: participant.userId
        }
      })

      // Send real-time notification
      if (globalThis.io) {
        globalThis.io.to(`user:${participant.userId}`).emit('notification', {
          type: 'MESSAGE',
          title: 'New Message',
          content: `${user.displayName || user.username}: ${content || 'Sent a media file'}`,
          conversationId,
          messageId: message.id
        })
      }
    }

    // Track analytics
    await prisma.analyticsEvent.create({
      data: {
        eventType: 'message_sent',
        eventData: {
          conversationId,
          messageType: type,
          hasMedia: images.length > 0 || videos.length > 0,
          isReply: !!replyToId
        },
        userId: user.id
      }
    })

    return {
      success: true,
      message: 'Message sent successfully',
      data: { message }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Send message error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})

// Placeholder upload functions
async function uploadAndCompressImage(file) {
  // TODO: Implement image upload and compression
  return '/placeholder-image.jpg'
}

async function uploadAndCompressVideo(file) {
  // TODO: Implement video upload and compression
  return '/placeholder-video.mp4'
}
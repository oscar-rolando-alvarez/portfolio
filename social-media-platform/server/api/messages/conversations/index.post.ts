import { z } from 'zod'
import { usePrisma } from '../../../utils/prisma'

const createConversationSchema = z.object({
  participantIds: z.array(z.string()).min(1),
  type: z.enum(['DIRECT', 'GROUP']).default('DIRECT'),
  name: z.string().optional()
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

    const body = await readBody(event)
    const { participantIds, type, name } = createConversationSchema.parse(body)

    // Add current user to participants if not already included
    const allParticipantIds = [...new Set([user.id, ...participantIds])]

    const { prisma } = usePrisma()

    // For direct messages, check if conversation already exists
    if (type === 'DIRECT' && allParticipantIds.length === 2) {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: 'DIRECT',
          participants: {
            every: {
              userId: { in: allParticipantIds }
            }
          },
          AND: [
            {
              participants: {
                some: { userId: allParticipantIds[0] }
              }
            },
            {
              participants: {
                some: { userId: allParticipantIds[1] }
              }
            }
          ]
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          }
        }
      })

      if (existingConversation) {
        return {
          success: true,
          data: { conversation: existingConversation }
        }
      }
    }

    // Validate participants exist
    const participants = await prisma.user.findMany({
      where: { id: { in: allParticipantIds } },
      select: { id: true, username: true, displayName: true, avatar: true }
    })

    if (participants.length !== allParticipantIds.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'One or more participants not found'
      })
    }

    // Create conversation
    const conversation = await prisma.conversation.create({
      data: {
        type,
        name: type === 'GROUP' ? name : undefined,
        participants: {
          create: allParticipantIds.map(participantId => ({
            userId: participantId,
            role: participantId === user.id ? 'OWNER' : 'MEMBER'
          }))
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      }
    })

    // Notify participants via WebSocket
    if (globalThis.io) {
      allParticipantIds.forEach(participantId => {
        if (participantId !== user.id) {
          globalThis.io.to(`user:${participantId}`).emit('conversation-created', conversation)
        }
      })
    }

    // Track analytics
    await prisma.analyticsEvent.create({
      data: {
        eventType: 'conversation_created',
        eventData: {
          conversationId: conversation.id,
          type: conversation.type,
          participantCount: allParticipantIds.length
        },
        userId: user.id
      }
    })

    return {
      success: true,
      message: 'Conversation created successfully',
      data: { conversation }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Create conversation error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
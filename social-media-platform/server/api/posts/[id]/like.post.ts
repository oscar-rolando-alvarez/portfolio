import { usePrisma } from '../../../utils/prisma'

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    const postId = getRouterParam(event, 'id')
    if (!postId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Post ID is required'
      })
    }

    const { prisma } = usePrisma()

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true }
    })

    if (!post) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Post not found'
      })
    }

    // Check if user already liked the post
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: user.id,
          postId: postId
        }
      }
    })

    let liked = false
    
    if (existingLike) {
      // Unlike the post
      await prisma.like.delete({
        where: { id: existingLike.id }
      })
      liked = false
    } else {
      // Like the post
      await prisma.like.create({
        data: {
          userId: user.id,
          postId: postId
        }
      })
      liked = true

      // Create notification for post author (if not self-like)
      if (post.authorId !== user.id) {
        await prisma.notification.create({
          data: {
            type: 'LIKE',
            title: 'New Like',
            content: `${user.username} liked your post`,
            data: {
              postId: postId,
              userId: user.id
            },
            userId: post.authorId
          }
        })
      }
    }

    // Get updated like count
    const likesCount = await prisma.like.count({
      where: { postId: postId }
    })

    // Track analytics event
    await prisma.analyticsEvent.create({
      data: {
        eventType: liked ? 'post_liked' : 'post_unliked',
        eventData: {
          postId: postId,
          targetUserId: post.authorId
        },
        userId: user.id,
        postId: postId
      }
    })

    return {
      success: true,
      data: {
        liked,
        likesCount
      }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Like post error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
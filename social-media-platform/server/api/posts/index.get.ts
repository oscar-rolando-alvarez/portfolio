import { z } from 'zod'
import { usePrisma } from '../../utils/prisma'

const querySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 50)),
  userId: z.string().optional()
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

    const query = getQuery(event)
    const { page, limit, userId } = querySchema.parse(query)

    const { prisma } = usePrisma()
    
    const skip = (page - 1) * limit

    // Build where clause
    const where = {
      AND: [
        // Only show public posts or posts from followed users
        {
          OR: [
            { visibility: 'PUBLIC' },
            {
              AND: [
                { visibility: 'FRIENDS' },
                {
                  author: {
                    followers: {
                      some: { followerId: user.id }
                    }
                  }
                }
              ]
            },
            { authorId: user.id } // Own posts
          ]
        },
        // Filter by user if specified
        userId ? { authorId: userId } : {},
        // Exclude flagged content
        { flagged: false }
      ]
    }

    // Get posts with pagination
    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              verified: true
            }
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              shares: true
            }
          },
          likes: {
            where: { userId: user.id },
            select: { id: true }
          },
          bookmarks: {
            where: { userId: user.id },
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.post.count({ where })
    ])

    // Transform posts to include computed fields
    const transformedPosts = posts.map(post => ({
      ...post,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      sharesCount: post._count.shares,
      isLiked: post.likes.length > 0,
      isBookmarked: post.bookmarks.length > 0,
      _count: undefined,
      likes: undefined,
      bookmarks: undefined
    }))

    const pages = Math.ceil(total / limit)
    const hasNext = page < pages
    const hasPrev = page > 1

    return {
      success: true,
      data: {
        data: transformedPosts,
        pagination: {
          page,
          limit,
          total,
          pages,
          hasNext,
          hasPrev
        }
      }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Get posts error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
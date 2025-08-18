import { z } from 'zod'
import { usePrisma } from '../../utils/prisma'

const querySchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 50))
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
    const { page, limit } = querySchema.parse(query)

    const { prisma } = usePrisma()
    
    const skip = (page - 1) * limit

    // Get user's following list
    const following = await prisma.follow.findMany({
      where: { followerId: user.id },
      select: { followingId: true }
    })

    const followingIds = following.map(f => f.followingId)

    // Get feed posts with recommendation algorithm
    const feedPosts = await generateFeedPosts(user.id, followingIds, skip, limit)

    // Get total count for pagination
    const total = await prisma.post.count({
      where: {
        AND: [
          {
            OR: [
              { authorId: { in: [...followingIds, user.id] } },
              { visibility: 'PUBLIC' }
            ]
          },
          { flagged: false }
        ]
      }
    })

    const pages = Math.ceil(total / limit)
    const hasNext = page < pages
    const hasPrev = page > 1

    return {
      success: true,
      data: {
        data: feedPosts,
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

    console.error('Get feed error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})

async function generateFeedPosts(userId, followingIds, skip, limit) {
  const { prisma } = usePrisma()

  // Basic recommendation algorithm
  // 1. Recent posts from followed users (70%)
  // 2. Popular public posts (20%)
  // 3. Recommended posts based on interactions (10%)

  const followingLimit = Math.floor(limit * 0.7)
  const popularLimit = Math.floor(limit * 0.2)
  const recommendedLimit = limit - followingLimit - popularLimit

  // Get recent posts from followed users
  const followingPosts = await prisma.post.findMany({
    where: {
      AND: [
        { authorId: { in: followingIds } },
        { flagged: false },
        {
          OR: [
            { visibility: 'PUBLIC' },
            { visibility: 'FRIENDS' }
          ]
        }
      ]
    },
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
        where: { userId },
        select: { id: true }
      },
      bookmarks: {
        where: { userId },
        select: { id: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: followingLimit
  })

  // Get popular public posts
  const popularPosts = await prisma.post.findMany({
    where: {
      AND: [
        { visibility: 'PUBLIC' },
        { flagged: false },
        { authorId: { notIn: [...followingIds, userId] } },
        {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      ]
    },
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
        where: { userId },
        select: { id: true }
      },
      bookmarks: {
        where: { userId },
        select: { id: true }
      }
    },
    orderBy: [
      { likes: { _count: 'desc' } },
      { comments: { _count: 'desc' } },
      { createdAt: 'desc' }
    ],
    take: popularLimit
  })

  // Get recommended posts based on user interactions
  const recommendedPosts = await getRecommendedPosts(userId, followingIds, recommendedLimit)

  // Combine and shuffle posts
  const allPosts = [...followingPosts, ...popularPosts, ...recommendedPosts]
  
  // Transform posts
  const transformedPosts = allPosts.map(post => ({
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

  // Sort by engagement score and recency
  return transformedPosts
    .sort((a, b) => {
      const scoreA = calculateEngagementScore(a)
      const scoreB = calculateEngagementScore(b)
      
      if (scoreA === scoreB) {
        return new Date(b.createdAt) - new Date(a.createdAt)
      }
      
      return scoreB - scoreA
    })
    .slice(skip, skip + limit)
}

async function getRecommendedPosts(userId, followingIds, limit) {
  const { prisma } = usePrisma()

  // Get posts liked by users that the current user follows
  const recommendedPosts = await prisma.post.findMany({
    where: {
      AND: [
        { visibility: 'PUBLIC' },
        { flagged: false },
        { authorId: { notIn: [...followingIds, userId] } },
        {
          likes: {
            some: {
              userId: { in: followingIds }
            }
          }
        }
      ]
    },
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
        where: { userId },
        select: { id: true }
      },
      bookmarks: {
        where: { userId },
        select: { id: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  })

  return recommendedPosts
}

function calculateEngagementScore(post) {
  const ageInHours = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60)
  const engagementRate = (post.likesCount + post.commentsCount * 2 + post.sharesCount * 3) / Math.max(post.views, 1)
  
  // Decay score based on age
  const decayFactor = Math.exp(-ageInHours / 24) // Exponential decay over 24 hours
  
  return engagementRate * decayFactor * 100
}
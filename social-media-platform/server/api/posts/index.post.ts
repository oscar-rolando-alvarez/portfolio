import { z } from 'zod'
import multiparty from 'multiparty'
import { usePrisma } from '../../utils/prisma'

const createPostSchema = z.object({
  content: z.string().max(2000).optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'LINK', 'POLL']),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'PRIVATE'])
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
      visibility: fields.visibility?.[0] || 'PUBLIC'
    }

    const { content, type, visibility } = createPostSchema.parse(formData)

    // Validate content
    if (!content && (!files.images?.length && !files.videos?.length)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Post must have content or media'
      })
    }

    const { prisma } = usePrisma()

    // Process uploaded files
    const images = []
    const videos = []

    if (files.images) {
      for (const file of files.images) {
        // TODO: Upload to cloud storage and compress
        // For now, using placeholder URLs
        const imageUrl = await uploadAndCompressImage(file)
        images.push(imageUrl)
      }
    }

    if (files.videos) {
      for (const file of files.videos) {
        // TODO: Upload to cloud storage and compress
        // For now, using placeholder URLs
        const videoUrl = await uploadAndCompressVideo(file)
        videos.push(videoUrl)
      }
    }

    // Create post
    const post = await prisma.post.create({
      data: {
        content,
        images,
        videos,
        type,
        visibility,
        authorId: user.id
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
        }
      }
    })

    // Track analytics event
    await prisma.analyticsEvent.create({
      data: {
        eventType: 'post_created',
        eventData: {
          postId: post.id,
          type: post.type,
          hasMedia: images.length > 0 || videos.length > 0
        },
        userId: user.id,
        postId: post.id
      }
    })

    // Transform post response
    const transformedPost = {
      ...post,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      sharesCount: post._count.shares,
      isLiked: false,
      isBookmarked: false,
      _count: undefined
    }

    return {
      success: true,
      message: 'Post created successfully',
      data: { post: transformedPost }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Create post error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})

// Placeholder upload functions - implement with actual cloud storage
async function uploadAndCompressImage(file) {
  // TODO: Implement image upload and compression
  // Use services like Cloudinary, AWS S3, etc.
  return '/placeholder-image.jpg'
}

async function uploadAndCompressVideo(file) {
  // TODO: Implement video upload and compression
  // Use services like Cloudinary, AWS S3, etc.
  return '/placeholder-video.mp4'
}
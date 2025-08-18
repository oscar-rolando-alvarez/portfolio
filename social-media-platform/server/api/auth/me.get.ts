export default defineEventHandler(async (event) => {
  try {
    // User is already available from auth middleware
    const user = event.context.user

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      })
    }

    return {
      success: true,
      data: { user }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Get user error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
import jwt from 'jsonwebtoken'
import type { User } from '~/types'

// Mock user database - replace with actual database
const mockUsers: User[] = [
  // Same mock users as in login.post.ts
  {
    id: '1',
    email: 'admin@example.com',
    name: 'Admin User',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face',
    role: 'admin' as any,
    permissions: [
      'create_project', 'edit_project', 'delete_project', 'view_project',
      'create_task', 'edit_task', 'delete_task', 'assign_task',
      'invite_users', 'manage_users', 'view_reports', 'export_data'
    ] as any[],
    preferences: {
      theme: 'system' as const,
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        browser: true,
        taskAssigned: true,
        taskDue: true,
        projectUpdates: true,
        mentions: true
      },
      dashboardLayout: []
    },
    isActive: true,
    lastSeen: new Date(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date()
  },
  {
    id: '2',
    email: 'manager@example.com',
    name: 'Project Manager',
    avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=32&h=32&fit=crop&crop=face',
    role: 'manager' as any,
    permissions: [
      'create_project', 'edit_project', 'view_project',
      'create_task', 'edit_task', 'assign_task',
      'invite_users', 'view_reports'
    ] as any[],
    preferences: {
      theme: 'light' as const,
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        browser: true,
        taskAssigned: true,
        taskDue: true,
        projectUpdates: true,
        mentions: true
      },
      dashboardLayout: []
    },
    isActive: true,
    lastSeen: new Date(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date()
  },
  {
    id: '3',
    email: 'user@example.com',
    name: 'Team Member',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=32&h=32&fit=crop&crop=face',
    role: 'member' as any,
    permissions: [
      'view_project', 'create_task', 'edit_task'
    ] as any[],
    preferences: {
      theme: 'dark' as const,
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        browser: true,
        taskAssigned: true,
        taskDue: true,
        projectUpdates: false,
        mentions: true
      },
      dashboardLayout: []
    },
    isActive: true,
    lastSeen: new Date(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date()
  }
]

export default defineEventHandler(async (event) => {
  try {
    // Get authorization header
    const authorization = getHeader(event, 'authorization')
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authorization token required'
      })
    }

    // Extract token
    const token = authorization.substring(7)
    
    // Verify JWT token
    const config = useRuntimeConfig()
    const decoded = jwt.verify(token, config.jwtSecret) as any

    // Find user by ID
    const user = mockUsers.find(u => u.id === decoded.userId)
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid token - user not found'
      })
    }

    // Check if user is active
    if (!user.isActive) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Account is deactivated'
      })
    }

    // Update last seen
    user.lastSeen = new Date()

    // Return user data
    return {
      success: true,
      data: {
        user,
        permissions: user.permissions
      }
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    if (error.name === 'JsonWebTokenError') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid token'
      })
    }

    if (error.name === 'TokenExpiredError') {
      throw createError({
        statusCode: 401,
        statusMessage: 'Token expired'
      })
    }

    console.error('Auth verification error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
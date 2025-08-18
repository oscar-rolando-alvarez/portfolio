import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { User, Permission, UserRole } from '~/types'

interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

// Mock user database - replace with actual database
const mockUsers: User[] = [
  {
    id: '1',
    email: 'admin@example.com',
    name: 'Admin User',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face',
    role: 'admin' as UserRole,
    permissions: [
      'create_project', 'edit_project', 'delete_project', 'view_project',
      'create_task', 'edit_task', 'delete_task', 'assign_task',
      'invite_users', 'manage_users', 'view_reports', 'export_data'
    ] as Permission[],
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
    role: 'manager' as UserRole,
    permissions: [
      'create_project', 'edit_project', 'view_project',
      'create_task', 'edit_task', 'assign_task',
      'invite_users', 'view_reports'
    ] as Permission[],
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
    role: 'member' as UserRole,
    permissions: [
      'view_project', 'create_task', 'edit_task'
    ] as Permission[],
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

// Mock password storage (in production, use proper password hashing)
const mockPasswords: Record<string, string> = {
  'admin@example.com': bcrypt.hashSync('admin123', 10),
  'manager@example.com': bcrypt.hashSync('manager123', 10),
  'user@example.com': bcrypt.hashSync('user123', 10)
}

export default defineEventHandler(async (event) => {
  try {
    const { email, password, rememberMe = false }: LoginRequest = await readBody(event)

    // Validate input
    if (!email || !password) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Email and password are required'
      })
    }

    // Find user by email
    const user = mockUsers.find(u => u.email === email)
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Verify password
    const isValidPassword = bcrypt.compareSync(password, mockPasswords[email])
    if (!isValidPassword) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Check if user is active
    if (!user.isActive) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Account is deactivated'
      })
    }

    // Generate JWT tokens
    const config = useRuntimeConfig()
    const jwtSecret = config.jwtSecret

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    }

    const accessToken = jwt.sign(tokenPayload, jwtSecret, { 
      expiresIn: rememberMe ? '30d' : '1d' 
    })

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      jwtSecret,
      { expiresIn: '30d' }
    )

    // Update user's last seen
    user.lastSeen = new Date()

    // Return success response
    return {
      success: true,
      data: {
        user: {
          ...user,
          // Don't send sensitive data
        },
        token: accessToken,
        refreshToken,
        permissions: user.permissions
      },
      message: 'Login successful'
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Login error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})
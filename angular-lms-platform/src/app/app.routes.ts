import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { NoAuthGuard } from './core/guards/no-auth.guard';
import { UserRole } from './core/models/user.model';

export const routes: Routes = [
  // Public routes
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    title: 'EduPlatform - Advanced Learning Management System'
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component').then(m => m.AboutComponent),
    title: 'About - EduPlatform'
  },
  {
    path: 'contact',
    loadComponent: () => import('./features/contact/contact.component').then(m => m.ContactComponent),
    title: 'Contact - EduPlatform'
  },

  // Authentication routes (no auth required)
  {
    path: 'auth',
    canActivate: [NoAuthGuard],
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
        title: 'Login - EduPlatform'
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
        title: 'Register - EduPlatform'
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
        title: 'Forgot Password - EduPlatform'
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
        title: 'Reset Password - EduPlatform'
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent),
        title: 'Verify Email - EduPlatform'
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },

  // Protected routes
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    title: 'Dashboard - EduPlatform'
  },

  // Course routes
  {
    path: 'courses',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/courses/course-list/course-list.component').then(m => m.CourseListComponent),
        title: 'Courses - EduPlatform'
      },
      {
        path: 'create',
        canActivate: [RoleGuard],
        data: { roles: [UserRole.INSTRUCTOR, UserRole.ADMIN] },
        loadComponent: () => import('./features/courses/course-create/course-create.component').then(m => m.CourseCreateComponent),
        title: 'Create Course - EduPlatform'
      },
      {
        path: 'my-courses',
        loadComponent: () => import('./features/courses/my-courses/my-courses.component').then(m => m.MyCoursesComponent),
        title: 'My Courses - EduPlatform'
      },
      {
        path: ':id',
        loadComponent: () => import('./features/courses/course-detail/course-detail.component').then(m => m.CourseDetailComponent),
        title: 'Course Details - EduPlatform'
      },
      {
        path: ':id/edit',
        canActivate: [RoleGuard],
        data: { roles: [UserRole.INSTRUCTOR, UserRole.ADMIN] },
        loadComponent: () => import('./features/courses/course-edit/course-edit.component').then(m => m.CourseEditComponent),
        title: 'Edit Course - EduPlatform'
      },
      {
        path: ':id/learn',
        loadComponent: () => import('./features/courses/course-learn/course-learn.component').then(m => m.CourseLearnComponent),
        title: 'Learning - EduPlatform'
      }
    ]
  },

  // Assessment routes
  {
    path: 'assessments',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/assessments/assessment-list/assessment-list.component').then(m => m.AssessmentListComponent),
        title: 'Assessments - EduPlatform'
      },
      {
        path: 'create',
        canActivate: [RoleGuard],
        data: { roles: [UserRole.INSTRUCTOR, UserRole.ADMIN] },
        loadComponent: () => import('./features/assessments/assessment-create/assessment-create.component').then(m => m.AssessmentCreateComponent),
        title: 'Create Assessment - EduPlatform'
      },
      {
        path: ':id',
        loadComponent: () => import('./features/assessments/assessment-detail/assessment-detail.component').then(m => m.AssessmentDetailComponent),
        title: 'Assessment Details - EduPlatform'
      },
      {
        path: ':id/take',
        loadComponent: () => import('./features/assessments/assessment-take/assessment-take.component').then(m => m.AssessmentTakeComponent),
        title: 'Take Assessment - EduPlatform'
      },
      {
        path: ':id/results',
        loadComponent: () => import('./features/assessments/assessment-results/assessment-results.component').then(m => m.AssessmentResultsComponent),
        title: 'Assessment Results - EduPlatform'
      }
    ]
  },

  // Video streaming routes
  {
    path: 'videos',
    canActivate: [AuthGuard],
    children: [
      {
        path: ':id',
        loadComponent: () => import('./features/video/video-player/video-player.component').then(m => m.VideoPlayerComponent),
        title: 'Video Player - EduPlatform'
      },
      {
        path: ':id/live',
        loadComponent: () => import('./features/video/live-stream/live-stream.component').then(m => m.LiveStreamComponent),
        title: 'Live Stream - EduPlatform'
      }
    ]
  },

  // Communication routes
  {
    path: 'messages',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/communication/messages/messages.component').then(m => m.MessagesComponent),
        title: 'Messages - EduPlatform'
      },
      {
        path: 'chat/:id',
        loadComponent: () => import('./features/communication/chat/chat.component').then(m => m.ChatComponent),
        title: 'Chat - EduPlatform'
      }
    ]
  },

  // Forum routes
  {
    path: 'forum',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/forum/forum-list/forum-list.component').then(m => m.ForumListComponent),
        title: 'Forum - EduPlatform'
      },
      {
        path: 'topic/:id',
        loadComponent: () => import('./features/forum/topic-detail/topic-detail.component').then(m => m.TopicDetailComponent),
        title: 'Forum Topic - EduPlatform'
      },
      {
        path: 'create-topic',
        loadComponent: () => import('./features/forum/create-topic/create-topic.component').then(m => m.CreateTopicComponent),
        title: 'Create Topic - EduPlatform'
      }
    ]
  },

  // Progress and analytics routes
  {
    path: 'progress',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/progress/progress-overview/progress-overview.component').then(m => m.ProgressOverviewComponent),
        title: 'Progress - EduPlatform'
      },
      {
        path: 'analytics',
        canActivate: [RoleGuard],
        data: { roles: [UserRole.INSTRUCTOR, UserRole.ADMIN] },
        loadComponent: () => import('./features/progress/analytics-dashboard/analytics-dashboard.component').then(m => m.AnalyticsDashboardComponent),
        title: 'Analytics - EduPlatform'
      },
      {
        path: 'certificates',
        loadComponent: () => import('./features/progress/certificates/certificates.component').then(m => m.CertificatesComponent),
        title: 'Certificates - EduPlatform'
      }
    ]
  },

  // Payment routes
  {
    path: 'payment',
    canActivate: [AuthGuard],
    children: [
      {
        path: 'checkout/:courseId',
        loadComponent: () => import('./features/payment/checkout/checkout.component').then(m => m.CheckoutComponent),
        title: 'Checkout - EduPlatform'
      },
      {
        path: 'success',
        loadComponent: () => import('./features/payment/payment-success/payment-success.component').then(m => m.PaymentSuccessComponent),
        title: 'Payment Success - EduPlatform'
      },
      {
        path: 'cancel',
        loadComponent: () => import('./features/payment/payment-cancel/payment-cancel.component').then(m => m.PaymentCancelComponent),
        title: 'Payment Cancelled - EduPlatform'
      }
    ]
  },

  // Profile and settings routes
  {
    path: 'profile',
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
        title: 'Profile - EduPlatform'
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/profile/settings/settings.component').then(m => m.SettingsComponent),
        title: 'Settings - EduPlatform'
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/profile/notifications/notifications.component').then(m => m.NotificationsComponent),
        title: 'Notifications - EduPlatform'
      }
    ]
  },

  // Admin routes
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [UserRole.ADMIN] },
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        title: 'Admin Dashboard - EduPlatform'
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/user-management/user-management.component').then(m => m.UserManagementComponent),
        title: 'User Management - EduPlatform'
      },
      {
        path: 'content',
        loadComponent: () => import('./features/admin/content-management/content-management.component').then(m => m.ContentManagementComponent),
        title: 'Content Management - EduPlatform'
      },
      {
        path: 'system',
        loadComponent: () => import('./features/admin/system-settings/system-settings.component').then(m => m.SystemSettingsComponent),
        title: 'System Settings - EduPlatform'
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/admin/reports/reports.component').then(m => m.ReportsComponent),
        title: 'Reports - EduPlatform'
      }
    ]
  },

  // Content management routes
  {
    path: 'content',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: [UserRole.INSTRUCTOR, UserRole.ADMIN] },
    children: [
      {
        path: 'library',
        loadComponent: () => import('./features/content/media-library/media-library.component').then(m => m.MediaLibraryComponent),
        title: 'Media Library - EduPlatform'
      },
      {
        path: 'editor',
        loadComponent: () => import('./features/content/content-editor/content-editor.component').then(m => m.ContentEditorComponent),
        title: 'Content Editor - EduPlatform'
      },
      {
        path: 'scorm',
        loadComponent: () => import('./features/content/scorm-player/scorm-player.component').then(m => m.ScormPlayerComponent),
        title: 'SCORM Player - EduPlatform'
      }
    ]
  },

  // Search routes
  {
    path: 'search',
    canActivate: [AuthGuard],
    loadComponent: () => import('./features/search/search-results/search-results.component').then(m => m.SearchResultsComponent),
    title: 'Search Results - EduPlatform'
  },

  // Help and support routes
  {
    path: 'help',
    children: [
      {
        path: '',
        loadComponent: () => import('./features/help/help-center/help-center.component').then(m => m.HelpCenterComponent),
        title: 'Help Center - EduPlatform'
      },
      {
        path: 'faq',
        loadComponent: () => import('./features/help/faq/faq.component').then(m => m.FaqComponent),
        title: 'FAQ - EduPlatform'
      },
      {
        path: 'support',
        loadComponent: () => import('./features/help/support/support.component').then(m => m.SupportComponent),
        title: 'Support - EduPlatform'
      }
    ]
  },

  // Legal routes
  {
    path: 'legal',
    children: [
      {
        path: 'privacy',
        loadComponent: () => import('./features/legal/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent),
        title: 'Privacy Policy - EduPlatform'
      },
      {
        path: 'terms',
        loadComponent: () => import('./features/legal/terms-of-service/terms-of-service.component').then(m => m.TermsOfServiceComponent),
        title: 'Terms of Service - EduPlatform'
      },
      {
        path: 'cookies',
        loadComponent: () => import('./features/legal/cookie-policy/cookie-policy.component').then(m => m.CookiePolicyComponent),
        title: 'Cookie Policy - EduPlatform'
      }
    ]
  },

  // Error routes
  {
    path: '404',
    loadComponent: () => import('./shared/components/error/not-found/not-found.component').then(m => m.NotFoundComponent),
    title: 'Page Not Found - EduPlatform'
  },
  {
    path: '403',
    loadComponent: () => import('./shared/components/error/forbidden/forbidden.component').then(m => m.ForbiddenComponent),
    title: 'Access Forbidden - EduPlatform'
  },
  {
    path: '500',
    loadComponent: () => import('./shared/components/error/server-error/server-error.component').then(m => m.ServerErrorComponent),
    title: 'Server Error - EduPlatform'
  },

  // Wildcard route - must be last
  {
    path: '**',
    redirectTo: '/404'
  }
];
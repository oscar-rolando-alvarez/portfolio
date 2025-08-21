# Vue Project Management

A comprehensive project management application built with Vue 3, Nuxt 3, and TypeScript. This application provides a modern, feature-rich platform for managing projects, tasks, teams, and collaboration.

![Vue Project Management](https://img.shields.io/badge/Vue-3.0-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white)
![Nuxt](https://img.shields.io/badge/Nuxt-3.0-00DC82?style=for-the-badge&logo=nuxt.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

## ✨ Features

### 🎯 Core Project Management
- **Project Creation & Management** - Create, organize, and track multiple projects
- **Task Management** - Comprehensive task system with subtasks, dependencies, and custom fields
- **Kanban Boards** - Drag-and-drop task management with customizable columns
- **Gantt Charts** - Timeline view for project planning and tracking
- **Calendar Integration** - Deadline management and scheduling
- **Time Tracking** - Built-in time tracking with reporting

### 👥 Team Collaboration
- **Team Management** - Invite and manage team members with role-based permissions
- **Real-time Collaboration** - Live updates and WebSocket integration
- **Comments & Mentions** - Task discussions with @mentions
- **File Sharing** - Upload and attach files to tasks and projects
- **Activity Feeds** - Track all project and task activities

### 📊 Analytics & Reporting
- **Dashboard Analytics** - Comprehensive project and task metrics
- **Custom Reports** - Generate detailed reports in PDF/Excel format
- **Progress Tracking** - Visual progress indicators and completion rates
- **Time Reports** - Detailed time tracking and productivity analysis

### 🎨 User Experience
- **Dark/Light Theme** - System-aware theme switching
- **Mobile Responsive** - Optimized for all device sizes
- **Progressive Web App** - Offline support and app-like experience
- **Keyboard Shortcuts** - Power user productivity features
- **Command Palette** - Quick actions and navigation (⌘K)

### 🔒 Security & Performance
- **JWT Authentication** - Secure user authentication
- **Role-based Permissions** - Granular access control
- **Real-time Sync** - Live collaboration features
- **Offline Support** - Work without internet connection
- **Performance Optimized** - Fast loading and smooth interactions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm 8+ or yarn
- Docker (optional, for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/vue-project-management.git
   cd vue-project-management
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   JWT_SECRET=your-super-secret-jwt-key
   DATABASE_URL=postgresql://username:password@localhost:5432/vue_pm
   REDIS_URL=redis://localhost:6379
   API_BASE_URL=http://localhost:3000/api
   WS_URL=ws://localhost:3001
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

### Demo Accounts

For quick testing, use these demo accounts:

- **Admin**: admin@example.com / admin123
- **Manager**: manager@example.com / manager123  
- **Member**: user@example.com / user123

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Vue 3, Nuxt 3, TypeScript
- **Styling**: Tailwind CSS, Nuxt UI
- **State Management**: Pinia
- **Authentication**: JWT with refresh tokens
- **Real-time**: Socket.io
- **Charts**: Chart.js, Gantt components
- **Drag & Drop**: Vue Draggable
- **Testing**: Vitest, Vue Test Utils
- **Deployment**: Docker, Nginx

### Project Structure

```
vue-project-management/
├── assets/                 # Static assets (CSS, images)
├── components/             # Vue components
│   ├── kanban/            # Kanban board components
│   ├── gantt/             # Gantt chart components
│   └── ui/                # Reusable UI components
├── composables/           # Vue composables
├── layouts/               # Application layouts
├── middleware/            # Route middleware
├── pages/                 # Application pages
├── plugins/               # Nuxt plugins
├── server/                # API routes
├── stores/                # Pinia stores
├── types/                 # TypeScript type definitions
├── tests/                 # Test files
└── public/                # Public assets
```

## 📱 Features Overview

### Dashboard
- **Project Overview** - At-a-glance project status and metrics
- **Task Summary** - Personal task queue with priorities
- **Activity Feed** - Recent team activities and updates
- **Quick Actions** - Rapid task and project creation
- **Analytics Widgets** - Customizable performance metrics

### Kanban Board
- **Drag & Drop** - Intuitive task movement between columns
- **Custom Columns** - Configurable workflow stages
- **Task Cards** - Rich task information with progress indicators
- **Filtering** - Advanced filtering by assignee, priority, tags
- **Real-time Updates** - Live collaboration with team members

### Gantt Chart
- **Timeline View** - Visual project timeline and dependencies
- **Task Dependencies** - Link related tasks and track blockers
- **Milestone Tracking** - Mark important project milestones
- **Resource Management** - Track team member workloads
- **Export Options** - Export timelines as PDF or image

### Time Tracking
- **Time Logging** - Manual and automatic time entry
- **Timer Integration** - Built-in task timers
- **Reports** - Detailed time reports and analytics
- **Productivity Metrics** - Team and individual productivity tracking
- **Billing Integration** - Time-based project billing

### Team Collaboration
- **User Management** - Invite and manage team members
- **Role Permissions** - Admin, Manager, Member, Viewer roles
- **Real-time Chat** - Task-based discussions
- **File Sharing** - Drag-and-drop file attachments
- **Notifications** - Email and browser notifications

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | - |
| `DATABASE_URL` | Database connection string | - |
| `REDIS_URL` | Redis connection string | redis://localhost:6379 |
| `API_BASE_URL` | API base URL | /api |
| `WS_URL` | WebSocket server URL | ws://localhost:3001 |
| `MAX_FILE_SIZE` | Maximum file upload size | 10MB |

### Customization

#### Themes
The application supports light, dark, and system themes. Customize colors in `assets/css/main.scss`:

```scss
:root {
  --color-primary: #6366f1;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
}
```

#### Permissions
Configure role-based permissions in `types/index.ts`:

```typescript
export enum Permission {
  CREATE_PROJECT = 'create_project',
  EDIT_PROJECT = 'edit_project',
  DELETE_PROJECT = 'delete_project',
  // Add more permissions as needed
}
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Test Structure
- **Unit Tests** - Individual component and store testing
- **Integration Tests** - Feature workflow testing
- **E2E Tests** - Full application flow testing

### Writing Tests
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from '~/components/MyComponent.vue'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyComponent)
    expect(wrapper.text()).toContain('Expected text')
  })
})
```

## 🚀 Deployment

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **Access the application**
   - Application: http://localhost:3000
   - Database: localhost:5432
   - Redis: localhost:6379

### Manual Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm run preview
   ```

### Environment Setup

For production deployment, ensure you have:
- PostgreSQL database
- Redis server  
- SSL certificates (for HTTPS)
- Environment variables configured

## 🎯 Roadmap

### Current Version (v1.0)
- ✅ Core project and task management
- ✅ Kanban boards with drag-and-drop
- ✅ Real-time collaboration
- ✅ Time tracking
- ✅ Team management
- ✅ PWA support

### Upcoming Features (v1.1)
- 🔄 Advanced Gantt charts
- 🔄 Mobile apps (iOS/Android)
- 🔄 API integrations (Slack, GitHub, Jira)
- 🔄 Advanced reporting
- 🔄 Custom workflows
- 🔄 Budget tracking

### Future Plans (v2.0)
- 📋 AI-powered task suggestions
- 📋 Advanced analytics with ML
- 📋 Multi-language support
- 📋 Advanced automations
- 📋 Enterprise features

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Setup

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm run test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Vue.js](https://vuejs.org/) - The progressive JavaScript framework
- [Nuxt](https://nuxt.com/) - The intuitive Vue framework
- [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
- [Heroicons](https://heroicons.com/) - Beautiful hand-crafted SVG icons
- [Chart.js](https://www.chartjs.org/) - Simple yet flexible JavaScript charting

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 📞 Support

- 💬 Discord: [Join our community](https://discord.gg/vue-pm)
- 📖 Documentation: [docs.vue-pm.com](https://docs.vue-pm.com)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/vue-project-management/issues)

---

Made with ❤️ by the Vue Project Management Team
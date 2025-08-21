# Advanced Analytics Dashboard

A modern, high-performance analytics dashboard built with React 18, Next.js 14, and TypeScript. Features real-time data visualization, advanced charting capabilities, and a comprehensive component library.

![Analytics Dashboard](./docs/images/dashboard-preview.png)

[![CI/CD Pipeline](https://github.com/yourusername/react-analytics-dashboard/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/yourusername/react-analytics-dashboard/actions)
[![codecov](https://codecov.io/gh/yourusername/react-analytics-dashboard/branch/main/graph/badge.svg)](https://codecov.io/gh/yourusername/react-analytics-dashboard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

### Core Features
- **React 18** with concurrent features and automatic batching
- **Next.js 14** with App Router and Server Components
- **TypeScript** for type safety and enhanced developer experience
- **Tailwind CSS** for utility-first styling and dark mode support
- **Module Federation** for micro-frontend architecture

### State Management
- **Zustand** for lightweight global state management
- **TanStack Query** for server state and caching
- **Context API** for component-level state
- **Optimistic updates** for enhanced user experience

### Real-time Features
- **WebSocket connections** for live data updates
- **Server-Sent Events** for streaming data
- **Real-time chart updates** with smooth animations
- **Live notifications** and alert system
- **Auto-refresh capabilities** with configurable intervals

### Data Visualization
- **Advanced charts** with D3.js and Chart.js integration
- **Interactive dashboards** with drill-down capabilities
- **Multiple chart types**: Line, Area, Bar, Pie, Scatter, Heatmaps
- **Customizable configurations** for each chart
- **Export capabilities** (PDF, Excel, CSV, PNG, SVG)

### Performance Optimizations
- **Infinite scrolling** for large datasets
- **Virtualization** for rendering performance
- **Code splitting** and lazy loading
- **Image optimization** with Next.js
- **Service workers** for offline capabilities

### User Experience
- **Multi-dashboard support** with templates
- **Drag-and-drop dashboard builder**
- **Custom filters** and date ranges
- **Responsive design** for all devices
- **Dark/light theme** support with system preference detection
- **User preferences** and settings persistence

## 📋 Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Docker (optional, for containerized development)

## 🛠 Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/react-analytics-dashboard.git
   cd react-analytics-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your configuration:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_WS_URL=ws://localhost:3001
   DATABASE_URL=postgresql://username:password@localhost:5432/analytics
   REDIS_URL=redis://localhost:6379
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Docker Development

1. **Start with Docker Compose**
   ```bash
   docker-compose -f docker-compose.yml up -d dev
   ```

2. **Access the application**
   - Dashboard: [http://localhost:3000](http://localhost:3000)
   - Storybook: [http://localhost:6006](http://localhost:6006)

## 📚 Documentation

### Project Structure

```
├── src/
│   ├── app/                 # Next.js 14 App Router
│   │   ├── globals.css     # Global styles
│   │   ├── layout.tsx      # Root layout
│   │   ├── page.tsx        # Home page
│   │   └── providers.tsx   # App providers
│   ├── components/         # React components
│   │   ├── Charts/         # Chart components
│   │   ├── Dashboard/      # Dashboard components
│   │   ├── Layout/         # Layout components
│   │   ├── Theme/          # Theme components
│   │   └── UI/             # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility libraries
│   ├── store/              # Zustand stores
│   ├── styles/             # Additional styles
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
├── public/                 # Static assets
├── docs/                   # Documentation
├── .storybook/             # Storybook configuration
├── __tests__/              # Test files
└── docker/                 # Docker configuration
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run storybook` | Start Storybook |
| `npm run build-storybook` | Build Storybook |
| `npm run type-check` | Run TypeScript check |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | API server URL | `http://localhost:8000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL | `ws://localhost:3001` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `NODE_ENV` | Environment mode | `development` |

## 🏗 Architecture

### State Management Architecture

```mermaid
graph TB
    A[React Components] --> B[Zustand Stores]
    A --> C[TanStack Query]
    A --> D[Context API]
    
    B --> E[Dashboard Store]
    B --> F[Theme Store]
    B --> G[User Store]
    B --> H[Notification Store]
    
    C --> I[Server State]
    C --> J[Cache Management]
    
    D --> K[Component State]
```

### Real-time Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant WebSocket
    participant API
    participant Database
    
    Client->>WebSocket: Connect
    WebSocket->>Client: Connection established
    
    API->>Database: Data change
    Database->>API: Change notification
    API->>WebSocket: Broadcast update
    WebSocket->>Client: Real-time data
    Client->>Client: Update charts
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- LoadingSpinner.test.tsx
```

### Test Coverage

The project maintains high test coverage across:
- Unit tests for utility functions
- Component tests with React Testing Library
- Integration tests for complex workflows
- End-to-end tests with Playwright

### Writing Tests

Example component test:

```typescript
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

## 📖 Storybook

Storybook provides interactive documentation for all components:

```bash
# Start Storybook
npm run storybook

# Build Storybook
npm run build-storybook
```

Access Storybook at [http://localhost:6006](http://localhost:6006)

### Writing Stories

Example story file:

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { LoadingSpinner } from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingSpinner',
  component: LoadingSpinner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 'md',
    color: 'primary',
  },
};
```

## 🐳 Docker Deployment

### Production Deployment

```bash
# Build and start production containers
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale services
docker-compose up -d --scale app=3
```

### Development with Docker

```bash
# Start development environment
docker-compose -f docker-compose.yml up -d dev

# Rebuild containers
docker-compose build --no-cache
```

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect your repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Deploy automatically** on push to main branch

### AWS ECS

1. **Build and push Docker image**
   ```bash
   docker build -t analytics-dashboard .
   docker tag analytics-dashboard:latest your-ecr-repo:latest
   docker push your-ecr-repo:latest
   ```

2. **Deploy to ECS** using the provided task definition

### Manual Server Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Theme Configuration

Customize the theme in `tailwind.config.js`:

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
    },
  },
};
```

### Chart Configuration

Configure default chart settings in `src/utils/chartDefaults.ts`:

```typescript
export const defaultChartConfig = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 1000,
    easing: 'easeInOutQuart',
  },
};
```

## 🔒 Security

### Security Features

- **Content Security Policy** (CSP) headers
- **CSRF protection** with tokens
- **XSS prevention** with input sanitization
- **Rate limiting** on API endpoints
- **Secure headers** with Helmet.js

### Environment Security

- Use `.env.local` for sensitive data
- Never commit secrets to version control
- Use environment-specific configurations
- Enable security audit in CI/CD pipeline

## 📊 Performance

### Performance Optimizations

- **Code splitting** with dynamic imports
- **Image optimization** with Next.js Image component
- **Bundle analysis** with webpack-bundle-analyzer
- **Lighthouse scores** monitoring in CI/CD
- **Core Web Vitals** optimization

### Monitoring

- **Real User Monitoring** (RUM) with Web Vitals
- **Error tracking** with Sentry
- **Performance metrics** with New Relic
- **Uptime monitoring** with Pingdom

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Write tests** for new functionality
5. **Run the test suite**
   ```bash
   npm run test
   ```
6. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
7. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
8. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Write meaningful commit messages
- Add JSDoc comments for public APIs
- Ensure all tests pass

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) for the amazing React framework
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [D3.js](https://d3js.org/) for powerful data visualization
- [Zustand](https://github.com/pmndrs/zustand) for simple state management
- [TanStack Query](https://tanstack.com/query) for excellent server state management

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 📞 Support

- 💬 Discord: [Join our community](https://discord.gg/analytics-dashboard)
- 📖 Documentation: [docs.analytics-dashboard.com](https://docs.analytics-dashboard.com)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/react-analytics-dashboard/issues)

---

**Built with ❤️ by the Analytics Dashboard Team**
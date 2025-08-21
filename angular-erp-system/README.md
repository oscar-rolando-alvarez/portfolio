# Angular ERP System

A comprehensive Enterprise Resource Planning (ERP) system built with Angular 17, featuring a modular architecture and modern web technologies.

## 🚀 Features

### Angular 17 Features
- **Standalone Components**: Modern component architecture without NgModules
- **New Control Flow**: Using `@if`, `@for`, `@switch` syntax
- **Angular Signals**: Reactive state management with signals
- **Lazy Loading**: Route-based code splitting for optimal performance
- **SSR Support**: Server-Side Rendering for better SEO and performance

### ERP Modules
- **Human Resources**: Employee management, payroll, attendance tracking
- **Financial Management**: Accounting, invoicing, expense tracking, financial reporting
- **Inventory Management**: Product catalog, stock management, supplier relations, purchase orders
- **Customer Relationship Management (CRM)**: Customer data, lead tracking, opportunity management
- **Project Management**: Task management, project timelines, resource allocation
- **Sales Management**: Sales orders, quotations, commission tracking
- **Reporting & Analytics**: KPI tracking, custom reports, data visualization

### Architecture Features
- **Micro-frontend Ready**: Modular architecture with Angular Elements support
- **NgRx State Management**: Comprehensive state management with feature stores
- **Reactive Forms**: Dynamic form generation with validation
- **Custom Directives & Pipes**: Reusable UI components and data transformations
- **Advanced Routing**: Guards, resolvers, and lazy-loaded routes
- **Internationalization (i18n)**: Multi-language support

### UI/UX Features
- **Material Design**: Angular Material with custom theming
- **Responsive Design**: Mobile-first approach with adaptive layouts
- **Dynamic Theming**: Light/dark themes with system preference detection
- **Advanced Data Tables**: Sorting, filtering, pagination, and bulk actions
- **Customizable Dashboard**: Widget-based dashboard with drag-and-drop
- **Rich Text Editor**: Integrated WYSIWYG editor
- **File Upload**: Progress tracking and multiple file support

### Advanced Features
- **Role-Based Access Control (RBAC)**: Granular permissions system
- **Audit Logging**: Complete activity tracking
- **Real-time Notifications**: WebSocket-based updates
- **Progressive Web App (PWA)**: Offline support and native app experience
- **Data Export**: Excel, PDF, CSV export capabilities
- **Print Functionality**: Optimized printing layouts
- **Advanced Search**: Global search across all modules

## 📁 Project Structure

```
src/
├── app/
│   ├── core/                    # Core services, guards, interceptors
│   │   ├── guards/              # Route guards (auth, role, admin)
│   │   ├── interceptors/        # HTTP interceptors
│   │   ├── models/              # Data models and interfaces
│   │   ├── services/            # Core services
│   │   └── store/               # NgRx store (auth, theme, notifications, UI)
│   ├── shared/                  # Shared components and utilities
│   │   ├── components/          # Reusable components
│   │   ├── directives/          # Custom directives
│   │   ├── pipes/               # Custom pipes
│   │   └── utils/               # Utility functions
│   ├── features/                # Feature modules
│   │   ├── auth/                # Authentication module
│   │   ├── dashboard/           # Main dashboard
│   │   ├── hr/                  # Human Resources module
│   │   ├── finance/             # Financial Management module
│   │   ├── inventory/           # Inventory Management module
│   │   ├── crm/                 # Customer Relationship Management
│   │   ├── projects/            # Project Management module
│   │   ├── sales/               # Sales Management module
│   │   └── analytics/           # Reporting & Analytics module
│   ├── layout/                  # App layout components
│   │   ├── header/              # Header component
│   │   ├── sidenav/             # Navigation sidebar
│   │   └── footer/              # Footer component
│   └── store/                   # Root store configuration
├── assets/                      # Static assets
│   ├── i18n/                    # Translation files
│   ├── icons/                   # App icons
│   └── images/                  # Images and graphics
├── environments/                # Environment configurations
└── styles.scss                  # Global styles and theming
```

## 🛠️ Technology Stack

- **Frontend**: Angular 17, TypeScript, SCSS
- **State Management**: NgRx (Store, Effects, Entity)
- **UI Framework**: Angular Material
- **Charts**: Chart.js with ng2-charts
- **Rich Text**: Quill.js with ngx-quill
- **Build Tool**: Angular CLI with Webpack
- **Testing**: Jest, Cypress
- **PWA**: Angular Service Worker
- **Containerization**: Docker, Docker Compose
- **Server**: Nginx (production)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm 8+
- Angular CLI 17+
- Docker (optional, for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd angular-erp-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:4200`

### Development Commands

```bash
# Development server
npm start

# Build for production
npm run build

# Build with SSR
npm run build:ssr

# Serve SSR build
npm run serve:ssr

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run e2e tests
npm run e2e

# Extract i18n messages
npm run i18n:extract

# Build for specific locale
npm run i18n:build:en
npm run i18n:build:es
npm run i18n:build:fr

# Analyze bundle size
npm run analyze
```

## 🐳 Docker Deployment

### Development with Docker

```bash
# Build and run with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f frontend

# Stop services
docker-compose down
```

### Production Deployment

1. **Build production image**
   ```bash
   docker build -t angular-erp-system .
   ```

2. **Run container**
   ```bash
   docker run -p 80:80 -p 443:443 angular-erp-system
   ```

### Environment Variables

Create a `.env` file for configuration:

```env
NODE_ENV=production
API_URL=https://api.yourcompany.com
DATABASE_URL=postgresql://user:password@localhost:5432/erp_db
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379
```

## 🧪 Testing

### Unit Tests (Jest)

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### E2E Tests (Cypress)

```bash
# Open Cypress interface
npm run e2e

# Run headless tests
npm run e2e:headless
```

## 🌐 Internationalization

The application supports multiple languages:

1. **Extract translatable text**
   ```bash
   npm run i18n:extract
   ```

2. **Translate messages**
   Edit files in `src/locale/`

3. **Build for specific locale**
   ```bash
   npm run i18n:build:en
   npm run i18n:build:es
   npm run i18n:build:fr
   ```

## 📱 Progressive Web App (PWA)

The application includes PWA features:

- **Offline Support**: Service worker caching
- **App-like Experience**: Installable on mobile devices
- **Push Notifications**: Real-time updates
- **Background Sync**: Data synchronization when online

### PWA Configuration

Edit `ngsw-config.json` to customize caching strategies and update policies.

## 🔐 Security Features

- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control (RBAC)
- **CSRF Protection**: Cross-site request forgery prevention
- **Content Security Policy**: XSS protection
- **Secure Headers**: Security headers via Nginx
- **Input Validation**: Client and server-side validation

## 📊 Performance Optimization

- **Lazy Loading**: Route-based code splitting
- **OnPush Change Detection**: Optimized change detection
- **TrackBy Functions**: Efficient list rendering
- **Image Optimization**: Responsive images with lazy loading
- **Bundle Analysis**: Webpack bundle analyzer
- **Service Worker**: Aggressive caching strategies

## 🏗️ Architecture Patterns

### State Management
- **NgRx Store**: Centralized state management
- **Feature Stores**: Module-specific state slices
- **Effects**: Side effect management
- **Selectors**: Memoized state queries

### Component Architecture
- **Standalone Components**: No NgModule dependencies
- **Smart/Dumb Components**: Clear separation of concerns
- **OnPush Strategy**: Performance-optimized components
- **Reactive Forms**: Model-driven form handling

### Service Architecture
- **Dependency Injection**: Angular DI container
- **HTTP Interceptors**: Request/response handling
- **Guard Services**: Route protection
- **Resolver Services**: Data pre-loading

## 🚀 Deployment Strategies

### Development
- Local development server
- Hot module replacement
- Source maps for debugging

### Staging
- Docker containers
- Environment-specific configuration
- Automated testing

### Production
- Multi-stage Docker builds
- Nginx reverse proxy
- SSL/TLS termination
- Health checks and monitoring

## 📈 Monitoring and Analytics

### Application Monitoring
- Error tracking and reporting
- Performance metrics
- User analytics
- Real-time dashboards

### Infrastructure Monitoring
- Container health checks
- Resource utilization
- Log aggregation
- Alerting systems

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add some amazing feature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

### Development Guidelines

- **Code Style**: Follow Angular style guide
- **Testing**: Write unit and e2e tests
- **Documentation**: Update README and code comments
- **Type Safety**: Use TypeScript strictly
- **Performance**: Consider performance implications

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Angular team for the amazing framework
- Angular Material team for the UI components
- NgRx team for state management
- Open source community for the ecosystem

## 📞 Business Contact

For business inquiries and professional services:

- **Name**: Oscar Alvarez
- **Email**: oralvarez@gmail.com

## 📞 Support

For technical support and questions:

- **Documentation**: Check the `/docs` folder
- **Issues**: Create an issue on GitHub
- **Discussions**: Use GitHub Discussions

---

Built with ❤️ using Angular 17 and modern web technologies.
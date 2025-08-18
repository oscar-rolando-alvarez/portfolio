# Collaboration Canvas

A real-time collaborative canvas application similar to Figma/Miro, built with React, TypeScript, and modern web technologies. Multiple users can collaborate simultaneously on the same canvas with live cursors, real-time synchronization, voice/video chat, and advanced drawing tools.

![Collaboration Canvas](./screenshot.png)

## 🚀 Features

### Real-time Collaboration
- **WebRTC** peer-to-peer communication for low-latency interactions
- **Socket.io** for reliable real-time synchronization
- **Operational Transformation** for conflict resolution
- **Live cursors** and user presence indicators
- **Voice and video chat** integration
- **Real-time collaborative editing** with conflict resolution

### Canvas & Drawing Tools
- **HTML5 Canvas** with Fabric.js for high-performance rendering
- **Vector drawing tools**: rectangles, circles, lines, arrows, text
- **Free-hand drawing** with customizable brush tools
- **Object manipulation**: move, resize, rotate, layer management
- **Layers and grouping** support
- **Zoom and pan** functionality with smooth animations

### Advanced Features
- **Offline support** with service workers and IndexedDB
- **Undo/redo functionality** with comprehensive history management
- **Drag-and-drop** interface with react-dnd
- **Keyboard shortcuts** system for power users
- **Export functionality**: PNG, SVG, PDF, JSON formats
- **Comments and annotations** system
- **Version history** and snapshots

### Architecture
- **React 18** with TypeScript for type safety
- **Micro-frontend** architecture with Module Federation
- **Component-based** design system with Tailwind CSS
- **Custom hooks** for canvas operations and state management
- **Performance optimization** with React.memo and useMemo
- **Zustand** for state management

## 📋 Prerequisites

- **Node.js** 18 or higher
- **npm** 8 or higher
- **Docker** (optional, for containerized deployment)

## 🛠️ Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd react-collaboration-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development servers**
   ```bash
   # Start both client and server in development mode
   npm run dev

   # Or start them separately
   npm run dev        # Client (Vite dev server on port 3000)
   npm run server     # Server (Socket.io server on port 3001)
   ```

4. **Open your browser**
   - Client: http://localhost:3000
   - Server health check: http://localhost:3001/health

### Docker Development

```bash
# Start development environment
docker-compose --profile dev up

# Or build and run manually
docker build --target development -t collaboration-canvas-dev .
docker run -p 3000:3000 -p 3001:3001 -v $(pwd):/app collaboration-canvas-dev
```

## 🚀 Production Deployment

### Using Docker Compose (Recommended)

```bash
# Production deployment with all services
docker-compose --profile prod up -d

# This will start:
# - Application server (ports 3000, 3001)
# - Redis for session management
# - Nginx reverse proxy (ports 80, 443)
# - MongoDB for persistent storage (optional)
```

### Manual Deployment

```bash
# Build for production
npm run build

# Start production server
npm run server
```

### Environment Variables

Create a `.env` file in the root directory:

```env
# Client Configuration
VITE_SERVER_URL=http://localhost:3001

# Server Configuration
NODE_ENV=production
PORT=3001
CLIENT_URL=http://localhost:3000

# Database (Optional)
MONGODB_URL=mongodb://localhost:27017/collaboration
REDIS_URL=redis://localhost:6379

# WebRTC Configuration
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

## 📖 Usage Guide

### Basic Drawing

1. **Select Tools**: Use the toolbar to select drawing tools (rectangle, circle, line, text, pen)
2. **Draw Objects**: Click and drag on the canvas to create objects
3. **Select Objects**: Use the select tool to choose and manipulate objects
4. **Properties Panel**: Adjust object properties like color, size, and position

### Collaboration

1. **Join Session**: Multiple users can join the same workspace URL
2. **User Presence**: See other users' cursors and activity in real-time
3. **Live Editing**: Changes appear instantly for all connected users
4. **Voice/Video**: Enable audio/video communication through the toolbar
5. **Comments**: Add comments by selecting the comment tool and clicking on the canvas

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `R` | Rectangle tool |
| `O` | Circle tool |
| `L` | Line tool |
| `T` | Text tool |
| `P` | Pen tool |
| `H` | Hand (pan) tool |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Y` | Redo |
| `Ctrl+A` / `Cmd+A` | Select all |
| `Ctrl+C` / `Cmd+C` | Copy |
| `Ctrl+V` / `Cmd+V` | Paste |
| `Delete` / `Backspace` | Delete selected |
| `G` | Toggle grid |
| `Arrow Keys` | Move selection |
| `Shift + Arrow Keys` | Move selection by 10px |

### Export & Import

1. **Export**: Use the export button in the toolbar to save your work
   - **PNG**: Raster image format
   - **SVG**: Vector image format
   - **PDF**: Document format
   - **JSON**: Canvas data for re-importing

2. **Import**: Upload JSON files to restore previous work

### Layers Management

1. **Layer Panel**: Access layers through the left sidebar
2. **Create Layers**: Organize objects into different layers
3. **Visibility**: Toggle layer visibility
4. **Lock Layers**: Prevent editing of specific layers
5. **Reorder**: Drag layers to change drawing order

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## 🏗️ Architecture

### Frontend Architecture
```
src/
├── components/          # Reusable UI components
│   ├── Canvas/         # Canvas-related components
│   ├── Toolbar/        # Drawing tools and toolbar
│   ├── Panels/         # Properties, layers, users panels
│   ├── Presence/       # User presence and activity
│   ├── DragDrop/       # Drag and drop functionality
│   ├── Export/         # Export/import dialogs
│   ├── Help/           # Help and shortcuts
│   └── ui/             # Basic UI components
├── hooks/              # Custom React hooks
├── stores/             # Zustand state management
├── lib/                # Utility libraries
├── types/              # TypeScript type definitions
└── test/               # Test utilities and setup
```

### Backend Architecture
```
server/
├── index.ts            # Main server file
├── routes/             # API routes
├── middleware/         # Express middleware
├── models/             # Data models
└── utils/              # Server utilities
```

### Key Technologies

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Canvas**: Fabric.js for object manipulation
- **Real-time**: Socket.io for synchronization
- **P2P**: Simple-peer for WebRTC connections
- **State**: Zustand for state management
- **DnD**: react-dnd for drag and drop
- **Export**: html2canvas, jsPDF for export functionality
- **Testing**: Vitest, Testing Library
- **Deployment**: Docker, Nginx

## 🔧 Configuration

### Canvas Settings

```typescript
// Customize canvas behavior
const canvasConfig = {
  width: 1920,
  height: 1080,
  backgroundColor: '#ffffff',
  selection: true,
  preserveObjectStacking: true,
  enableRetinaScaling: true,
};
```

### WebRTC Configuration

```typescript
// Configure STUN/TURN servers
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
  ]
};
```

### Socket.io Configuration

```typescript
// Server configuration
const ioConfig = {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
};
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Add tests** for new functionality
5. **Ensure tests pass**: `npm test`
6. **Commit your changes**: `git commit -m 'Add amazing feature'`
7. **Push to the branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Use semantic commit messages
- Update documentation for API changes
- Ensure accessibility compliance

## 📝 API Documentation

### WebSocket Events

#### Client → Server
- `user:join` - Join collaboration session
- `canvas:operation` - Send canvas operation
- `cursor:move` - Update cursor position
- `webrtc:signal` - WebRTC signaling
- `comment:add` - Add comment

#### Server → Client
- `user:joined` - User joined notification
- `canvas:operation` - Receive canvas operation
- `cursor:update` - Cursor position update
- `webrtc:signal` - WebRTC signaling response
- `comment:added` - Comment added notification

### REST API

#### Workspaces
- `GET /api/workspaces` - List workspaces
- `POST /api/workspace` - Create workspace
- `GET /api/workspace/:id` - Get workspace

#### Health Check
- `GET /health` - Server health status

## 🐛 Troubleshooting

### Common Issues

1. **Canvas not loading**
   - Check browser compatibility (requires modern browser)
   - Verify JavaScript is enabled
   - Check console for errors

2. **Real-time sync not working**
   - Verify WebSocket connection in Network tab
   - Check server connectivity
   - Ensure firewall allows WebSocket connections

3. **WebRTC not connecting**
   - Check STUN server configuration
   - Verify camera/microphone permissions
   - Test in different network environments

4. **Performance issues**
   - Reduce canvas object count
   - Disable high-quality rendering
   - Close unnecessary browser tabs

### Debug Mode

Enable debug logging:
```typescript
localStorage.setItem('debug', 'collaboration:*');
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Fabric.js](http://fabricjs.com/) for canvas manipulation
- [Socket.io](https://socket.io/) for real-time communication
- [Simple-peer](https://github.com/feross/simple-peer) for WebRTC
- [Zustand](https://github.com/pmndrs/zustand) for state management
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide](https://lucide.dev/) for icons

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review existing issues and discussions

---

**Happy Collaborating!** 🎨✨
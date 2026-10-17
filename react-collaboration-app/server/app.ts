import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { User, Operation, CanvasState, Comment, Workspace } from '../src/types';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (in production, use Redis or a database)
const workspaces = new Map<string, Workspace>();
const users = new Map<string, User>();
const operations = new Map<string, Operation[]>(); // workspace -> operations
const canvasStates = new Map<string, CanvasState>();

// Default workspace
const defaultWorkspace: Workspace = {
  id: 'default',
  name: 'Default Workspace',
  ownerId: 'system',
  collaborators: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isPublic: true,
  canvasState: {
    objects: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    version: 0
  }
};

workspaces.set('default', defaultWorkspace);
canvasStates.set('default', defaultWorkspace.canvasState);
operations.set('default', []);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  let currentUser: User | null = null;
  let currentWorkspace = 'default';

  // User joins the collaboration
  socket.on('user:join', (userData: Partial<User>) => {
    currentUser = {
      id: socket.id,
      name: userData.name || `User ${socket.id.slice(0, 6)}`,
      color: userData.color || generateRandomColor(),
      isOnline: true,
      cursor: { x: 0, y: 0 }
    };

    users.set(socket.id, currentUser);
    
    // Join workspace room
    socket.join(currentWorkspace);
    
    // Notify other users
    socket.to(currentWorkspace).emit('user:joined', currentUser);
    
    // Send current state to new user
    const workspace = workspaces.get(currentWorkspace);
    const canvasState = canvasStates.get(currentWorkspace);
    const allUsers = Array.from(users.values()).filter(u => u.isOnline);
    
    socket.emit('workspace:state', {
      workspace,
      canvasState,
      users: allUsers,
      operations: operations.get(currentWorkspace) || []
    });

    console.log(`User ${currentUser.name} joined workspace ${currentWorkspace}`);
  });

  // User leaves
  socket.on('disconnect', () => {
    if (currentUser) {
      users.delete(socket.id);
      socket.to(currentWorkspace).emit('user:left', socket.id);
      console.log(`User ${currentUser.name} disconnected`);
    }
  });

  // Handle canvas operations
  socket.on('canvas:operation', (operation: Operation) => {
    if (!currentUser) return;

    // Add timestamp and validate
    operation.timestamp = Date.now();
    operation.userId = currentUser.id;

    // Store operation
    const workspaceOps = operations.get(currentWorkspace) || [];
    workspaceOps.push(operation);
    operations.set(currentWorkspace, workspaceOps);

    // Update canvas state
    updateCanvasState(currentWorkspace, operation);

    // Broadcast to other users in the workspace
    socket.to(currentWorkspace).emit('canvas:operation', operation);

    console.log(`Operation ${operation.type} from ${currentUser.name}`);
  });

  // Handle cursor movement
  socket.on('cursor:move', (data: { x: number; y: number }) => {
    if (!currentUser) return;

    currentUser.cursor = data;
    socket.to(currentWorkspace).emit('cursor:update', {
      userId: currentUser.id,
      cursor: data
    });
  });

  // Handle WebRTC signaling
  socket.on('webrtc:signal', (data: { userId: string; signal: any }) => {
    socket.to(data.userId).emit('webrtc:signal', {
      userId: socket.id,
      signal: data.signal
    });
  });

  // Handle WebRTC offer
  socket.on('webrtc:offer', (data: { userId: string; offer: any }) => {
    socket.to(data.userId).emit('webrtc:offer', {
      userId: socket.id,
      offer: data.offer
    });
  });

  // Handle WebRTC answer
  socket.on('webrtc:answer', (data: { userId: string; answer: any }) => {
    socket.to(data.userId).emit('webrtc:answer', {
      userId: socket.id,
      answer: data.answer
    });
  });

  // Handle ICE candidates
  socket.on('webrtc:ice-candidate', (data: { userId: string; candidate: any }) => {
    socket.to(data.userId).emit('webrtc:ice-candidate', {
      userId: socket.id,
      candidate: data.candidate
    });
  });

  // Handle comments
  socket.on('comment:add', (comment: Comment) => {
    if (!currentUser) return;

    comment.userId = currentUser.id;
    comment.timestamp = Date.now();

    // Store comment (in production, use database)
    socket.to(currentWorkspace).emit('comment:added', comment);
    socket.emit('comment:added', comment);

    console.log(`Comment added by ${currentUser.name}`);
  });

  socket.on('comment:update', (data: { commentId: string; updates: Partial<Comment> }) => {
    socket.to(currentWorkspace).emit('comment:updated', data);
  });

  socket.on('comment:delete', (commentId: string) => {
    socket.to(currentWorkspace).emit('comment:deleted', commentId);
  });

  // Handle workspace switching
  socket.on('workspace:join', (workspaceId: string) => {
    if (currentWorkspace) {
      socket.leave(currentWorkspace);
    }
    
    currentWorkspace = workspaceId;
    socket.join(workspaceId);

    // Ensure workspace exists
    if (!workspaces.has(workspaceId)) {
      const newWorkspace: Workspace = {
        id: workspaceId,
        name: `Workspace ${workspaceId}`,
        ownerId: currentUser?.id || 'system',
        collaborators: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPublic: true,
        canvasState: {
          objects: [],
          viewport: { zoom: 1, panX: 0, panY: 0 },
          version: 0
        }
      };
      workspaces.set(workspaceId, newWorkspace);
      canvasStates.set(workspaceId, newWorkspace.canvasState);
      operations.set(workspaceId, []);
    }

    // Send workspace state
    const workspace = workspaces.get(workspaceId);
    const canvasState = canvasStates.get(workspaceId);
    const workspaceUsers = Array.from(users.values()).filter(u => u.isOnline);

    socket.emit('workspace:state', {
      workspace,
      canvasState,
      users: workspaceUsers,
      operations: operations.get(workspaceId) || []
    });
  });

  // Handle canvas sync request
  socket.on('canvas:sync', () => {
    const canvasState = canvasStates.get(currentWorkspace);
    if (canvasState) {
      socket.emit('canvas:state', canvasState);
    }
  });

  // Handle user updates
  socket.on('user:update', (updates: Partial<User>) => {
    if (!currentUser) return;

    Object.assign(currentUser, updates);
    users.set(socket.id, currentUser);

    socket.to(currentWorkspace).emit('user:updated', {
      userId: currentUser.id,
      updates
    });
  });
});

// Helper functions
function generateRandomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function updateCanvasState(workspaceId: string, operation: Operation) {
  const canvasState = canvasStates.get(workspaceId);
  if (!canvasState) return;

  switch (operation.type) {
    case 'add':
      canvasState.objects.push({
        id: operation.objectId,
        type: operation.data.type,
        data: operation.data,
        userId: operation.userId,
        timestamp: operation.timestamp,
        version: operation.version
      });
      break;

    case 'update':
      const objIndex = canvasState.objects.findIndex(obj => obj.id === operation.objectId);
      if (objIndex !== -1) {
        canvasState.objects[objIndex] = {
          ...canvasState.objects[objIndex],
          data: operation.data,
          version: operation.version,
          timestamp: operation.timestamp
        };
      }
      break;

    case 'delete':
      canvasState.objects = canvasState.objects.filter(obj => obj.id !== operation.objectId);
      break;
  }

  canvasState.version++;
  canvasStates.set(workspaceId, canvasState);

  // Update workspace
  const workspace = workspaces.get(workspaceId);
  if (workspace) {
    workspace.updatedAt = Date.now();
    workspace.canvasState = canvasState;
    workspaces.set(workspaceId, workspace);
  }
}

// REST API endpoints
app.get('/api/workspaces', (req, res) => {
  const workspaceList = Array.from(workspaces.values()).map(w => ({
    id: w.id,
    name: w.name,
    isPublic: w.isPublic,
    collaborators: w.collaborators.length,
    updatedAt: w.updatedAt
  }));
  res.json(workspaceList);
});

app.get('/api/workspace/:id', (req, res) => {
  const workspace = workspaces.get(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }
  res.json(workspace);
});

app.post('/api/workspace', (req, res) => {
  const { name, isPublic = true } = req.body;
  const workspaceId = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const workspace: Workspace = {
    id: workspaceId,
    name: name || `Workspace ${workspaceId}`,
    ownerId: req.body.ownerId || 'anonymous',
    collaborators: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPublic,
    canvasState: {
      objects: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      version: 0
    }
  };

  workspaces.set(workspaceId, workspace);
  canvasStates.set(workspaceId, workspace.canvasState);
  operations.set(workspaceId, []);

  res.json(workspace);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    users: users.size,
    workspaces: workspaces.size
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
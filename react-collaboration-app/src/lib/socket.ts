import { io, Socket } from 'socket.io-client';
import { User, Operation, CanvasState, Comment, SocketEvents } from '@/types';

export class SocketManager {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private eventHandlers = new Map<string, Function[]>();

  constructor() {
    this.connect();
    
    // Make available globally for WebRTC integration
    (window as any).socketManager = this;
  }

  private connect() {
    const serverUrl = process.env.VITE_SERVER_URL || 'http://localhost:3001';
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.isConnected = false;
      this.emit('disconnected', reason);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.reconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.isConnected = false;
      this.emit('connect_error', error);
      this.reconnect();
    });

    // Canvas events
    this.socket.on('canvas:operation', (operation: Operation) => {
      this.emit('canvas:operation', operation);
    });

    this.socket.on('canvas:state', (state: CanvasState) => {
      this.emit('canvas:state', state);
    });

    // User events
    this.socket.on('user:joined', (user: User) => {
      this.emit('user:joined', user);
    });

    this.socket.on('user:left', (userId: string) => {
      this.emit('user:left', userId);
    });

    this.socket.on('user:updated', (data: { userId: string; updates: Partial<User> }) => {
      this.emit('user:updated', data);
    });

    this.socket.on('cursor:update', (data: { userId: string; cursor: { x: number; y: number } }) => {
      this.emit('cursor:update', data);
    });

    // WebRTC events
    this.socket.on('webrtc:signal', (data: { userId: string; signal: any }) => {
      this.emit('webrtc:signal', data);
    });

    this.socket.on('webrtc:offer', (data: { userId: string; offer: any }) => {
      this.emit('webrtc:offer', data);
    });

    this.socket.on('webrtc:answer', (data: { userId: string; answer: any }) => {
      this.emit('webrtc:answer', data);
    });

    this.socket.on('webrtc:ice-candidate', (data: { userId: string; candidate: any }) => {
      this.emit('webrtc:ice-candidate', data);
    });

    // Comment events
    this.socket.on('comment:added', (comment: Comment) => {
      this.emit('comment:added', comment);
    });

    this.socket.on('comment:updated', (data: { commentId: string; updates: Partial<Comment> }) => {
      this.emit('comment:updated', data);
    });

    this.socket.on('comment:deleted', (commentId: string) => {
      this.emit('comment:deleted', commentId);
    });

    // Workspace events
    this.socket.on('workspace:state', (data: any) => {
      this.emit('workspace:state', data);
    });
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_attempts');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.socket) {
        this.socket.connect();
      }
    }, delay);
  }

  // Public methods
  public joinWorkspace(workspaceId: string) {
    if (this.socket) {
      this.socket.emit('workspace:join', workspaceId);
    }
  }

  public joinAsUser(userData: Partial<User>) {
    if (this.socket) {
      this.socket.emit('user:join', userData);
    }
  }

  public sendOperation(operation: Operation) {
    if (this.socket && this.isConnected) {
      this.socket.emit('canvas:operation', operation);
    } else {
      console.warn('Cannot send operation: not connected');
    }
  }

  public sendCursorPosition(x: number, y: number) {
    if (this.socket && this.isConnected) {
      this.socket.emit('cursor:move', { x, y });
    }
  }

  public updateUser(updates: Partial<User>) {
    if (this.socket && this.isConnected) {
      this.socket.emit('user:update', updates);
    }
  }

  public addComment(comment: Comment) {
    if (this.socket && this.isConnected) {
      this.socket.emit('comment:add', comment);
    }
  }

  public updateComment(commentId: string, updates: Partial<Comment>) {
    if (this.socket && this.isConnected) {
      this.socket.emit('comment:update', { commentId, updates });
    }
  }

  public deleteComment(commentId: string) {
    if (this.socket && this.isConnected) {
      this.socket.emit('comment:delete', commentId);
    }
  }

  public requestCanvasSync() {
    if (this.socket && this.isConnected) {
      this.socket.emit('canvas:sync');
    }
  }

  // WebRTC signaling methods
  public sendWebRTCSignal(userId: string, signal: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit('webrtc:signal', { userId, signal });
    }
  }

  public sendWebRTCOffer(userId: string, offer: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit('webrtc:offer', { userId, offer });
    }
  }

  public sendWebRTCAnswer(userId: string, answer: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit('webrtc:answer', { userId, answer });
    }
  }

  public sendICECandidate(userId: string, candidate: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit('webrtc:ice-candidate', { userId, candidate });
    }
  }

  // Event handling
  public on<T = any>(event: string, handler: (data: T) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  public off(event: string, handler?: Function) {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;

    if (handler) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    } else {
      this.eventHandlers.set(event, []);
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Connection status
  public getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id || null,
    };
  }

  // Cleanup
  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.eventHandlers.clear();
  }

  // Get socket instance for direct access if needed
  public getSocket(): Socket | null {
    return this.socket;
  }
}

// Global instance
let socketManager: SocketManager | null = null;

export const getSocketManager = (): SocketManager => {
  if (!socketManager) {
    socketManager = new SocketManager();
  }
  return socketManager;
};
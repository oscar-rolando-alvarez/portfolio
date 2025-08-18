import { fabric } from 'fabric';

// User types
export interface User {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  isOnline: boolean;
  cursor?: {
    x: number;
    y: number;
  };
}

// Canvas types
export interface CanvasObject {
  id: string;
  type: string;
  data: any;
  userId: string;
  timestamp: number;
  version: number;
}

export interface CanvasState {
  objects: CanvasObject[];
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  version: number;
}

// Drawing tools
export type ToolType = 
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pen'
  | 'eraser'
  | 'hand';

export interface DrawingTool {
  type: ToolType;
  name: string;
  icon: string;
  shortcut?: string;
}

// Operational Transformation types
export interface Operation {
  id: string;
  type: 'add' | 'update' | 'delete' | 'transform';
  objectId: string;
  data: any;
  userId: string;
  timestamp: number;
  version: number;
}

export interface OperationResult {
  operation: Operation;
  transformedOps: Operation[];
}

// WebRTC types
export interface PeerConnection {
  userId: string;
  connection: any; // SimplePeer instance
  isConnected: boolean;
}

export interface RTCMessage {
  type: 'operation' | 'cursor' | 'voice' | 'video' | 'chat';
  data: any;
  userId: string;
  timestamp: number;
}

// Socket.io events
export interface SocketEvents {
  'user:join': (user: User) => void;
  'user:leave': (userId: string) => void;
  'user:update': (user: Partial<User>) => void;
  'canvas:operation': (operation: Operation) => void;
  'canvas:sync': (state: CanvasState) => void;
  'cursor:move': (data: { userId: string; x: number; y: number }) => void;
  'webrtc:signal': (data: { userId: string; signal: any }) => void;
  'comment:add': (comment: Comment) => void;
  'comment:update': (comment: Comment) => void;
  'comment:delete': (commentId: string) => void;
}

// Layer types
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  objects: string[]; // object IDs
  order: number;
}

// Comment types
export interface Comment {
  id: string;
  x: number;
  y: number;
  text: string;
  userId: string;
  timestamp: number;
  resolved: boolean;
  replies: CommentReply[];
}

export interface CommentReply {
  id: string;
  text: string;
  userId: string;
  timestamp: number;
}

// History types
export interface HistoryEntry {
  id: string;
  timestamp: number;
  operations: Operation[];
  description: string;
}

// Export types
export type ExportFormat = 'png' | 'svg' | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  scale?: number;
  includeBackground?: boolean;
  selectedOnly?: boolean;
}

// Keyboard shortcut types
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: string;
  description: string;
}

// Voice/Video chat types
export interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

export interface MediaStream {
  userId: string;
  stream: MediaStream;
  type: 'audio' | 'video' | 'screen';
}

// Workspace types
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  collaborators: string[]; // user IDs
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  canvasState: CanvasState;
}

// Store types
export interface CollaborationStore {
  // Users
  currentUser: User | null;
  users: User[];
  
  // Canvas
  canvas: fabric.Canvas | null;
  canvasState: CanvasState;
  selectedObjects: string[];
  
  // Tools
  activeTool: ToolType;
  toolOptions: Record<string, any>;
  
  // Layers
  layers: Layer[];
  activeLayer: string | null;
  
  // History
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  
  // Comments
  comments: Comment[];
  activeComment: string | null;
  
  // Real-time
  isConnected: boolean;
  peers: PeerConnection[];
  
  // Media
  mediaState: MediaState;
  mediaStreams: MediaStream[];
  
  // UI
  showGrid: boolean;
  showRulers: boolean;
  snapToGrid: boolean;
  gridSize: number;
  
  // Actions
  setCanvas: (canvas: fabric.Canvas) => void;
  setActiveTool: (tool: ToolType) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
  updateUser: (userId: string, updates: Partial<User>) => void;
  addOperation: (operation: Operation) => void;
  undo: () => void;
  redo: () => void;
  selectObjects: (objectIds: string[]) => void;
  addLayer: (layer: Layer) => void;
  setActiveLayer: (layerId: string) => void;
  addComment: (comment: Comment) => void;
  updateComment: (commentId: string, updates: Partial<Comment>) => void;
  deleteComment: (commentId: string) => void;
  setMediaState: (state: Partial<MediaState>) => void;
  toggleGrid: () => void;
  toggleRulers: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
}

// Fabric.js extensions
declare module 'fabric' {
  namespace fabric {
    interface Object {
      id?: string;
      userId?: string;
      version?: number;
      lastModified?: number;
    }
  }
}
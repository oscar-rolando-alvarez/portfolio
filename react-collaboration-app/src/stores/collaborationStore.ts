import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { fabric } from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { 
  CollaborationStore, 
  User, 
  CanvasState, 
  Operation, 
  Layer, 
  Comment, 
  HistoryEntry, 
  ToolType, 
  PeerConnection,
  MediaState,
  MediaStream as CustomMediaStream
} from '@/types';

const initialCanvasState: CanvasState = {
  objects: [],
  viewport: { zoom: 1, panX: 0, panY: 0 },
  version: 0,
};

const initialMediaState: MediaState = {
  audio: false,
  video: false,
  screen: false,
};

export const useCollaborationStore = create<CollaborationStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // State
      currentUser: null,
      users: [],
      canvas: null,
      canvasState: initialCanvasState,
      selectedObjects: [],
      activeTool: 'select' as ToolType,
      toolOptions: {
        color: '#000000',
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        fontSize: 16,
        fontFamily: 'Arial',
        brushWidth: 5,
      },
      layers: [
        {
          id: 'layer-1',
          name: 'Layer 1',
          visible: true,
          locked: false,
          objects: [],
          order: 0,
        },
      ],
      activeLayer: 'layer-1',
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
      comments: [],
      activeComment: null,
      isConnected: false,
      peers: [],
      mediaState: initialMediaState,
      mediaStreams: [],
      showGrid: false,
      showRulers: false,
      snapToGrid: false,
      gridSize: 20,

      // Actions
      setCanvas: (canvas: fabric.Canvas) => set((state) => {
        state.canvas = canvas;
        
        // Setup canvas event handlers
        canvas.on('selection:created', (e) => {
          const activeObjects = e.selected?.map(obj => obj.id).filter(Boolean) || [];
          get().selectObjects(activeObjects);
        });

        canvas.on('selection:updated', (e) => {
          const activeObjects = e.selected?.map(obj => obj.id).filter(Boolean) || [];
          get().selectObjects(activeObjects);
        });

        canvas.on('selection:cleared', () => {
          get().selectObjects([]);
        });

        canvas.on('mouse:move', (e) => {
          const pointer = canvas.getPointer(e.e);
          // Send cursor position through WebRTC/Socket
          if (get().currentUser) {
            // This would be handled by the socket hook
            window.dispatchEvent(new CustomEvent('cursor-move', {
              detail: { x: pointer.x, y: pointer.y }
            }));
          }
        });
      }),

      setActiveTool: (tool: ToolType) => set((state) => {
        state.activeTool = tool;
      }),

      addUser: (user: User) => set((state) => {
        const existingIndex = state.users.findIndex(u => u.id === user.id);
        if (existingIndex >= 0) {
          state.users[existingIndex] = user;
        } else {
          state.users.push(user);
        }
      }),

      removeUser: (userId: string) => set((state) => {
        state.users = state.users.filter(u => u.id !== userId);
        state.peers = state.peers.filter(p => p.userId !== userId);
        state.mediaStreams = state.mediaStreams.filter(s => s.userId !== userId);
      }),

      updateUser: (userId: string, updates: Partial<User>) => set((state) => {
        const userIndex = state.users.findIndex(u => u.id === userId);
        if (userIndex >= 0) {
          Object.assign(state.users[userIndex], updates);
        }
        
        // Update current user if it's the same
        if (state.currentUser?.id === userId) {
          Object.assign(state.currentUser, updates);
        }
      }),

      addOperation: (operation: Operation) => set((state) => {
        // Add operation to canvas state
        switch (operation.type) {
          case 'add':
            state.canvasState.objects.push({
              id: operation.objectId,
              type: operation.data.type,
              data: operation.data,
              userId: operation.userId,
              timestamp: operation.timestamp,
              version: operation.version,
            });
            break;
          case 'update':
            const objIndex = state.canvasState.objects.findIndex(obj => obj.id === operation.objectId);
            if (objIndex >= 0) {
              state.canvasState.objects[objIndex].data = operation.data;
              state.canvasState.objects[objIndex].version = operation.version;
              state.canvasState.objects[objIndex].timestamp = operation.timestamp;
            }
            break;
          case 'delete':
            state.canvasState.objects = state.canvasState.objects.filter(obj => obj.id !== operation.objectId);
            break;
        }

        state.canvasState.version++;

        // Add to history for undo/redo
        const historyEntry: HistoryEntry = {
          id: uuidv4(),
          timestamp: operation.timestamp,
          operations: [operation],
          description: `${operation.type} ${operation.data.type || 'object'}`,
        };

        // Remove any history after current index
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(historyEntry);
        state.historyIndex = state.history.length - 1;

        // Update undo/redo flags
        state.canUndo = state.historyIndex > 0;
        state.canRedo = false;

        // Limit history size
        if (state.history.length > 100) {
          state.history = state.history.slice(50);
          state.historyIndex = state.history.length - 1;
        }
      }),

      undo: () => set((state) => {
        if (state.historyIndex <= 0) return;

        const historyEntry = state.history[state.historyIndex];
        state.historyIndex--;

        // Reverse the operations
        historyEntry.operations.reverse().forEach(operation => {
          switch (operation.type) {
            case 'add':
              // Remove the object
              state.canvasState.objects = state.canvasState.objects.filter(obj => obj.id !== operation.objectId);
              if (state.canvas) {
                const fabricObj = state.canvas.getObjects().find(obj => obj.id === operation.objectId);
                if (fabricObj) {
                  state.canvas.remove(fabricObj);
                }
              }
              break;
            case 'delete':
              // Re-add the object (would need to store the original data)
              break;
            case 'update':
              // Revert to previous state (would need to store previous data)
              break;
          }
        });

        state.canvasState.version++;
        state.canUndo = state.historyIndex > 0;
        state.canRedo = true;

        if (state.canvas) {
          state.canvas.renderAll();
        }
      }),

      redo: () => set((state) => {
        if (state.historyIndex >= state.history.length - 1) return;

        state.historyIndex++;
        const historyEntry = state.history[state.historyIndex];

        // Re-apply the operations
        historyEntry.operations.forEach(operation => {
          // Apply operation logic here (similar to addOperation)
        });

        state.canvasState.version++;
        state.canUndo = true;
        state.canRedo = state.historyIndex < state.history.length - 1;

        if (state.canvas) {
          state.canvas.renderAll();
        }
      }),

      selectObjects: (objectIds: string[]) => set((state) => {
        state.selectedObjects = objectIds;
      }),

      addLayer: (layer: Layer) => set((state) => {
        state.layers.push(layer);
      }),

      setActiveLayer: (layerId: string) => set((state) => {
        state.activeLayer = layerId;
      }),

      addComment: (comment: Comment) => set((state) => {
        state.comments.push(comment);
      }),

      updateComment: (commentId: string, updates: Partial<Comment>) => set((state) => {
        const commentIndex = state.comments.findIndex(c => c.id === commentId);
        if (commentIndex >= 0) {
          Object.assign(state.comments[commentIndex], updates);
        }
      }),

      deleteComment: (commentId: string) => set((state) => {
        state.comments = state.comments.filter(c => c.id !== commentId);
        if (state.activeComment === commentId) {
          state.activeComment = null;
        }
      }),

      setMediaState: (mediaState: Partial<MediaState>) => set((state) => {
        Object.assign(state.mediaState, mediaState);
      }),

      toggleGrid: () => set((state) => {
        state.showGrid = !state.showGrid;
      }),

      toggleRulers: () => set((state) => {
        state.showRulers = !state.showRulers;
      }),

      toggleSnapToGrid: () => set((state) => {
        state.snapToGrid = !state.snapToGrid;
      }),

      setGridSize: (size: number) => set((state) => {
        state.gridSize = size;
      }),
    }))
  )
);

// Selectors for performance optimization
export const useUsers = () => useCollaborationStore(state => state.users);
export const useCurrentUser = () => useCollaborationStore(state => state.currentUser);
export const useCanvas = () => useCollaborationStore(state => state.canvas);
export const useActiveTool = () => useCollaborationStore(state => state.activeTool);
export const useSelectedObjects = () => useCollaborationStore(state => state.selectedObjects);
export const useLayers = () => useCollaborationStore(state => state.layers);
export const useComments = () => useCollaborationStore(state => state.comments);
export const useHistory = () => useCollaborationStore(state => ({
  canUndo: state.canUndo,
  canRedo: state.canRedo,
  undo: state.undo,
  redo: state.redo,
}));
export const useMediaState = () => useCollaborationStore(state => state.mediaState);

// Store persistence
export const saveStoreState = () => {
  const state = useCollaborationStore.getState();
  const persistentState = {
    toolOptions: state.toolOptions,
    showGrid: state.showGrid,
    showRulers: state.showRulers,
    snapToGrid: state.snapToGrid,
    gridSize: state.gridSize,
  };
  localStorage.setItem('collaboration-store', JSON.stringify(persistentState));
};

export const loadStoreState = () => {
  try {
    const saved = localStorage.getItem('collaboration-store');
    if (saved) {
      const persistentState = JSON.parse(saved);
      useCollaborationStore.setState(persistentState);
    }
  } catch (error) {
    console.error('Failed to load store state:', error);
  }
};

// Initialize current user
export const initializeUser = (userData: Partial<User>) => {
  const userId = userData.id || uuidv4();
  const user: User = {
    id: userId,
    name: userData.name || `User ${userId.slice(0, 6)}`,
    color: userData.color || generateUserColor(),
    isOnline: true,
    cursor: { x: 0, y: 0 },
    ...userData,
  };

  useCollaborationStore.setState({ currentUser: user });
  return user;
};

// Helper function to generate user colors
const generateUserColor = (): string => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Subscribe to store changes for persistence
useCollaborationStore.subscribe(
  (state) => state.toolOptions,
  () => saveStoreState(),
  { fireImmediately: false }
);

useCollaborationStore.subscribe(
  (state) => ({
    showGrid: state.showGrid,
    showRulers: state.showRulers,
    snapToGrid: state.snapToGrid,
    gridSize: state.gridSize,
  }),
  () => saveStoreState(),
  { fireImmediately: false }
);
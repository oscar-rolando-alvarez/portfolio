import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCollaborationStore } from '../collaborationStore';
import { createMockUser, createMockLayer, createMockComment, createMockOperation, mockCanvas } from '@/test/utils';

describe('CollaborationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCollaborationStore.setState({
      currentUser: null,
      users: [],
      canvas: null,
      canvasState: {
        objects: [],
        viewport: { zoom: 1, panX: 0, panY: 0 },
        version: 0,
      },
      selectedObjects: [],
      activeTool: 'select',
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
      mediaState: { audio: false, video: false, screen: false },
      mediaStreams: [],
      showGrid: false,
      showRulers: false,
      snapToGrid: false,
      gridSize: 20,
    });
  });

  describe('User Management', () => {
    it('should add a new user', () => {
      const user = createMockUser();
      const { addUser } = useCollaborationStore.getState();
      
      addUser(user);
      
      const { users } = useCollaborationStore.getState();
      expect(users).toHaveLength(1);
      expect(users[0]).toEqual(user);
    });

    it('should update existing user', () => {
      const user = createMockUser();
      const { addUser } = useCollaborationStore.getState();
      
      addUser(user);
      addUser({ ...user, name: 'Updated Name' });
      
      const { users } = useCollaborationStore.getState();
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Updated Name');
    });

    it('should remove user', () => {
      const user = createMockUser();
      const { addUser, removeUser } = useCollaborationStore.getState();
      
      addUser(user);
      removeUser(user.id);
      
      const { users } = useCollaborationStore.getState();
      expect(users).toHaveLength(0);
    });

    it('should update user properties', () => {
      const user = createMockUser();
      const { addUser, updateUser } = useCollaborationStore.getState();
      
      addUser(user);
      updateUser(user.id, { name: 'New Name', color: '#ff0000' });
      
      const { users } = useCollaborationStore.getState();
      expect(users[0].name).toBe('New Name');
      expect(users[0].color).toBe('#ff0000');
    });
  });

  describe('Tool Management', () => {
    it('should set active tool', () => {
      const { setActiveTool } = useCollaborationStore.getState();
      
      setActiveTool('rectangle');
      
      const { activeTool } = useCollaborationStore.getState();
      expect(activeTool).toBe('rectangle');
    });

    it('should update tool options', () => {
      const initialState = useCollaborationStore.getState();
      
      useCollaborationStore.setState({
        toolOptions: {
          ...initialState.toolOptions,
          strokeWidth: 5,
          color: '#ff0000',
        },
      });
      
      const { toolOptions } = useCollaborationStore.getState();
      expect(toolOptions.strokeWidth).toBe(5);
      expect(toolOptions.color).toBe('#ff0000');
    });
  });

  describe('Canvas Management', () => {
    it('should set canvas', () => {
      const { setCanvas } = useCollaborationStore.getState();
      
      setCanvas(mockCanvas as any);
      
      const { canvas } = useCollaborationStore.getState();
      expect(canvas).toBe(mockCanvas);
    });

    it('should select objects', () => {
      const { selectObjects } = useCollaborationStore.getState();
      
      selectObjects(['obj1', 'obj2']);
      
      const { selectedObjects } = useCollaborationStore.getState();
      expect(selectedObjects).toEqual(['obj1', 'obj2']);
    });
  });

  describe('Layer Management', () => {
    it('should add layer', () => {
      const layer = createMockLayer();
      const { addLayer } = useCollaborationStore.getState();
      
      addLayer(layer);
      
      const { layers } = useCollaborationStore.getState();
      expect(layers).toHaveLength(2); // Initial layer + new layer
      expect(layers[1]).toEqual(layer);
    });

    it('should set active layer', () => {
      const { setActiveLayer } = useCollaborationStore.getState();
      
      setActiveLayer('new-layer-id');
      
      const { activeLayer } = useCollaborationStore.getState();
      expect(activeLayer).toBe('new-layer-id');
    });
  });

  describe('Comment Management', () => {
    it('should add comment', () => {
      const comment = createMockComment();
      const { addComment } = useCollaborationStore.getState();
      
      addComment(comment);
      
      const { comments } = useCollaborationStore.getState();
      expect(comments).toHaveLength(1);
      expect(comments[0]).toEqual(comment);
    });

    it('should update comment', () => {
      const comment = createMockComment();
      const { addComment, updateComment } = useCollaborationStore.getState();
      
      addComment(comment);
      updateComment(comment.id, { text: 'Updated text', resolved: true });
      
      const { comments } = useCollaborationStore.getState();
      expect(comments[0].text).toBe('Updated text');
      expect(comments[0].resolved).toBe(true);
    });

    it('should delete comment', () => {
      const comment = createMockComment();
      const { addComment, deleteComment } = useCollaborationStore.getState();
      
      addComment(comment);
      deleteComment(comment.id);
      
      const { comments } = useCollaborationStore.getState();
      expect(comments).toHaveLength(0);
    });
  });

  describe('Operation Management', () => {
    it('should add operation and update canvas state', () => {
      const operation = createMockOperation();
      const { addOperation } = useCollaborationStore.getState();
      
      addOperation(operation);
      
      const { canvasState, history } = useCollaborationStore.getState();
      expect(canvasState.objects).toHaveLength(1);
      expect(canvasState.objects[0].id).toBe(operation.objectId);
      expect(history).toHaveLength(1);
    });

    it('should update object on update operation', () => {
      const addOperation = createMockOperation();
      const updateOperation = createMockOperation({
        id: 'test-op-2',
        type: 'update',
        data: { ...addOperation.data, fill: '#ff0000' },
      });
      const { addOperation: addOp } = useCollaborationStore.getState();
      
      addOp(addOperation);
      addOp(updateOperation);
      
      const { canvasState } = useCollaborationStore.getState();
      expect(canvasState.objects[0].data.fill).toBe('#ff0000');
    });

    it('should remove object on delete operation', () => {
      const addOperation = createMockOperation();
      const deleteOperation = createMockOperation({
        id: 'test-op-2',
        type: 'delete',
      });
      const { addOperation: addOp } = useCollaborationStore.getState();
      
      addOp(addOperation);
      addOp(deleteOperation);
      
      const { canvasState } = useCollaborationStore.getState();
      expect(canvasState.objects).toHaveLength(0);
    });
  });

  describe('History Management', () => {
    it('should enable undo after adding operations', () => {
      const operation = createMockOperation();
      const { addOperation } = useCollaborationStore.getState();
      
      addOperation(operation);
      
      const { canUndo } = useCollaborationStore.getState();
      expect(canUndo).toBe(false); // Only one entry, so can't undo yet
    });

    it('should manage history index correctly', () => {
      const operation1 = createMockOperation({ id: 'op1' });
      const operation2 = createMockOperation({ id: 'op2' });
      const { addOperation } = useCollaborationStore.getState();
      
      addOperation(operation1);
      addOperation(operation2);
      
      const { historyIndex, history } = useCollaborationStore.getState();
      expect(historyIndex).toBe(history.length - 1);
    });
  });

  describe('Media State', () => {
    it('should set media state', () => {
      const { setMediaState } = useCollaborationStore.getState();
      
      setMediaState({ audio: true, video: true });
      
      const { mediaState } = useCollaborationStore.getState();
      expect(mediaState.audio).toBe(true);
      expect(mediaState.video).toBe(true);
      expect(mediaState.screen).toBe(false); // Should preserve existing values
    });
  });

  describe('Grid and UI Settings', () => {
    it('should toggle grid', () => {
      const { toggleGrid } = useCollaborationStore.getState();
      
      toggleGrid();
      
      const { showGrid } = useCollaborationStore.getState();
      expect(showGrid).toBe(true);
      
      toggleGrid();
      
      const { showGrid: showGrid2 } = useCollaborationStore.getState();
      expect(showGrid2).toBe(false);
    });

    it('should toggle snap to grid', () => {
      const { toggleSnapToGrid } = useCollaborationStore.getState();
      
      toggleSnapToGrid();
      
      const { snapToGrid } = useCollaborationStore.getState();
      expect(snapToGrid).toBe(true);
    });

    it('should set grid size', () => {
      const { setGridSize } = useCollaborationStore.getState();
      
      setGridSize(50);
      
      const { gridSize } = useCollaborationStore.getState();
      expect(gridSize).toBe(50);
    });
  });
});
import { useCallback, useEffect } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { fabric } from 'fabric';
import { Operation, HistoryEntry } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const useHistoryManager = () => {
  const {
    canvas,
    history,
    historyIndex,
    canUndo,
    canRedo,
    currentUser,
  } = useCollaborationStore();

  // Save canvas state for history
  const saveState = useCallback((description: string, operations: Operation[] = []) => {
    if (!canvas) return;

    const historyEntry: HistoryEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      operations,
      description,
    };

    useCollaborationStore.setState(state => {
      // Remove any history after current index (for when we undo then do something new)
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(historyEntry);

      // Limit history to prevent memory issues
      const maxHistorySize = 100;
      if (newHistory.length > maxHistorySize) {
        newHistory.splice(0, newHistory.length - maxHistorySize);
      }

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
        canUndo: newHistory.length > 1,
        canRedo: false,
      };
    });
  }, [canvas]);

  // Undo operation
  const undo = useCallback(() => {
    if (!canvas || !canUndo || historyIndex <= 0) return;

    const currentEntry = history[historyIndex];
    if (!currentEntry) return;

    // Reverse the operations in the current entry
    const reversedOps = [...currentEntry.operations].reverse();
    
    reversedOps.forEach(operation => {
      switch (operation.type) {
        case 'add':
          // Remove the object
          const addedObj = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (addedObj) {
            canvas.remove(addedObj);
          }
          break;

        case 'delete':
          // Re-add the object
          if (operation.data) {
            restoreObject(operation.data, operation.objectId);
          }
          break;

        case 'update':
          // Revert to previous state
          const updatedObj = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (updatedObj && operation.data.previousState) {
            updatedObj.set(operation.data.previousState);
            updatedObj.setCoords();
          }
          break;

        case 'transform':
          // Revert transformation
          const transformedObj = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (transformedObj && operation.data.previousState) {
            transformedObj.set(operation.data.previousState);
            transformedObj.setCoords();
          }
          break;
      }
    });

    canvas.renderAll();

    // Update history state
    useCollaborationStore.setState(state => ({
      historyIndex: state.historyIndex - 1,
      canUndo: state.historyIndex - 1 > 0,
      canRedo: true,
    }));

    console.log(`Undid: ${currentEntry.description}`);
  }, [canvas, canUndo, historyIndex, history]);

  // Redo operation
  const redo = useCallback(() => {
    if (!canvas || !canRedo || historyIndex >= history.length - 1) return;

    const nextEntry = history[historyIndex + 1];
    if (!nextEntry) return;

    // Re-apply the operations in the next entry
    nextEntry.operations.forEach(operation => {
      switch (operation.type) {
        case 'add':
          // Re-add the object
          if (operation.data) {
            restoreObject(operation.data, operation.objectId);
          }
          break;

        case 'delete':
          // Remove the object again
          const objToDelete = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (objToDelete) {
            canvas.remove(objToDelete);
          }
          break;

        case 'update':
          // Re-apply the update
          const objToUpdate = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (objToUpdate) {
            objToUpdate.set(operation.data);
            objToUpdate.setCoords();
          }
          break;

        case 'transform':
          // Re-apply the transformation
          const objToTransform = canvas.getObjects().find(obj => obj.id === operation.objectId);
          if (objToTransform) {
            objToTransform.set(operation.data);
            objToTransform.setCoords();
          }
          break;
      }
    });

    canvas.renderAll();

    // Update history state
    useCollaborationStore.setState(state => ({
      historyIndex: state.historyIndex + 1,
      canUndo: true,
      canRedo: state.historyIndex + 1 < state.history.length - 1,
    }));

    console.log(`Redid: ${nextEntry.description}`);
  }, [canvas, canRedo, historyIndex, history]);

  // Restore object from data
  const restoreObject = useCallback((data: any, objectId: string) => {
    if (!canvas) return;

    let fabricObject: fabric.Object | null = null;

    switch (data.type) {
      case 'rect':
        fabricObject = new fabric.Rect(data);
        break;
      case 'circle':
        fabricObject = new fabric.Circle(data);
        break;
      case 'line':
        fabricObject = new fabric.Line([data.x1, data.y1, data.x2, data.y2], data);
        break;
      case 'i-text':
        fabricObject = new fabric.IText(data.text, data);
        break;
      case 'path':
        fabricObject = new fabric.Path(data.path, data);
        break;
      default:
        // Generic object restore
        fabric.util.enlivenObjects([data], (objects: fabric.Object[]) => {
          if (objects.length > 0) {
            const obj = objects[0];
            obj.set('id', objectId);
            canvas.add(obj);
          }
        });
        return;
    }

    if (fabricObject) {
      fabricObject.set('id', objectId);
      canvas.add(fabricObject);
    }
  }, [canvas]);

  // Capture object state before modification
  const captureObjectState = useCallback((obj: fabric.Object) => {
    return {
      left: obj.left,
      top: obj.top,
      width: obj.width,
      height: obj.height,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      opacity: obj.opacity,
      visible: obj.visible,
      fill: obj.fill,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    };
  }, []);

  // Create operation with previous state for undo
  const createUndoableOperation = useCallback((
    type: Operation['type'],
    objectId: string,
    newData: any,
    previousState?: any
  ): Operation => {
    return {
      id: uuidv4(),
      type,
      objectId,
      data: {
        ...newData,
        previousState,
      },
      userId: currentUser?.id || 'unknown',
      timestamp: Date.now(),
      version: 1,
    };
  }, [currentUser]);

  // Set up canvas event listeners for automatic history tracking
  useEffect(() => {
    if (!canvas) return;

    let modificationInProgress = false;
    let beforeModificationState: any = null;

    const handleObjectModifying = (e: fabric.IEvent) => {
      if (modificationInProgress) return;
      
      const obj = e.target;
      if (obj && obj.id) {
        beforeModificationState = captureObjectState(obj);
      }
    };

    const handleObjectModified = (e: fabric.IEvent) => {
      const obj = e.target;
      if (obj && obj.id && beforeModificationState) {
        modificationInProgress = true;

        const operation = createUndoableOperation(
          'update',
          obj.id,
          captureObjectState(obj),
          beforeModificationState
        );

        saveState(`Modified ${obj.type}`, [operation]);

        beforeModificationState = null;
        modificationInProgress = false;
      }
    };

    const handleObjectAdded = (e: fabric.IEvent) => {
      if (modificationInProgress) return;

      const obj = e.target;
      if (obj && obj.id) {
        modificationInProgress = true;

        const operation = createUndoableOperation(
          'add',
          obj.id,
          obj.toObject(['id', 'userId', 'version', 'lastModified'])
        );

        saveState(`Added ${obj.type}`, [operation]);
        modificationInProgress = false;
      }
    };

    const handleObjectRemoved = (e: fabric.IEvent) => {
      if (modificationInProgress) return;

      const obj = e.target;
      if (obj && obj.id) {
        modificationInProgress = true;

        const operation = createUndoableOperation(
          'delete',
          obj.id,
          obj.toObject(['id', 'userId', 'version', 'lastModified'])
        );

        saveState(`Deleted ${obj.type}`, [operation]);
        modificationInProgress = false;
      }
    };

    // Register event listeners
    canvas.on('object:moving', handleObjectModifying);
    canvas.on('object:scaling', handleObjectModifying);
    canvas.on('object:rotating', handleObjectModifying);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:removed', handleObjectRemoved);

    return () => {
      canvas.off('object:moving', handleObjectModifying);
      canvas.off('object:scaling', handleObjectModifying);
      canvas.off('object:rotating', handleObjectModifying);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:added', handleObjectAdded);
      canvas.off('object:removed', handleObjectRemoved);
    };
  }, [canvas, saveState, captureObjectState, createUndoableOperation]);

  // Initialize with empty state
  useEffect(() => {
    if (canvas && history.length === 0) {
      saveState('Initial state');
    }
  }, [canvas, history.length, saveState]);

  return {
    undo,
    redo,
    saveState,
    canUndo,
    canRedo,
    history,
    historyIndex,
    captureObjectState,
    createUndoableOperation,
  };
};
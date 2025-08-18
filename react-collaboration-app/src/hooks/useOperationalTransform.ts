import { useEffect, useCallback } from 'react';
import { getOTManager } from '@/lib/ot';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Operation } from '@/types';

export const useOperationalTransform = () => {
  const otManager = getOTManager();
  const { canvas, addOperation: addStoreOperation } = useCollaborationStore();

  // Process incoming operation through OT
  const processIncomingOperation = useCallback((operation: Operation) => {
    if (!otManager.canApplyOperation(operation)) {
      console.log('Operation already applied, skipping:', operation.id);
      return false;
    }

    // Get recent local operations for transformation
    const recentOps = otManager.getOperationsSince(
      operation.timestamp - 5000, // 5 seconds window
      operation.userId
    );

    // Transform the operation
    const result = otManager.transformOperation(operation, recentOps);
    
    // Apply the transformed operation to canvas
    if (result.operation && canvas) {
      applyOperationToCanvas(result.operation);
    }

    // Apply any additional transformed operations
    result.transformedOps.forEach(op => {
      if (canvas) {
        applyOperationToCanvas(op);
      }
    });

    // Add to history
    otManager.addToHistory(result.operation);
    
    console.log('Applied transformed operation:', result.operation);
    return true;
  }, [otManager, canvas]);

  // Apply operation to Fabric.js canvas
  const applyOperationToCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    switch (operation.type) {
      case 'add':
        addObjectToCanvas(operation);
        break;
      case 'update':
        updateObjectOnCanvas(operation);
        break;
      case 'delete':
        deleteObjectFromCanvas(operation);
        break;
      case 'transform':
        transformObjectOnCanvas(operation);
        break;
    }

    canvas.renderAll();
  }, [canvas]);

  // Add object to canvas
  const addObjectToCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    const data = operation.data;
    let fabricObject: fabric.Object | null = null;

    switch (data.type) {
      case 'rect':
        fabricObject = new fabric.Rect({
          left: data.left,
          top: data.top,
          width: data.width,
          height: data.height,
          fill: data.fill,
          stroke: data.stroke,
          strokeWidth: data.strokeWidth,
        });
        break;
      case 'circle':
        fabricObject = new fabric.Circle({
          left: data.left,
          top: data.top,
          radius: data.radius,
          fill: data.fill,
          stroke: data.stroke,
          strokeWidth: data.strokeWidth,
        });
        break;
      case 'line':
        fabricObject = new fabric.Line(
          [data.x1, data.y1, data.x2, data.y2],
          {
            stroke: data.stroke,
            strokeWidth: data.strokeWidth,
          }
        );
        break;
      case 'i-text':
        fabricObject = new fabric.IText(data.text, {
          left: data.left,
          top: data.top,
          fontSize: data.fontSize,
          fill: data.fill,
          fontFamily: data.fontFamily,
        });
        break;
      case 'path':
        fabricObject = new fabric.Path(data.path, {
          left: data.left,
          top: data.top,
          fill: data.fill,
          stroke: data.stroke,
          strokeWidth: data.strokeWidth,
        });
        break;
    }

    if (fabricObject) {
      fabricObject.set({
        id: operation.objectId,
        userId: operation.userId,
        version: operation.version,
        lastModified: operation.timestamp,
        selectable: true,
        evented: true,
      });

      canvas.add(fabricObject);
    }
  }, [canvas]);

  // Update object on canvas
  const updateObjectOnCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    const object = canvas.getObjects().find(obj => obj.id === operation.objectId);
    if (!object) {
      console.warn('Object not found for update:', operation.objectId);
      return;
    }

    // Apply updates
    object.set({
      ...operation.data,
      version: operation.version,
      lastModified: operation.timestamp,
    });

    object.setCoords();
  }, [canvas]);

  // Delete object from canvas
  const deleteObjectFromCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    const object = canvas.getObjects().find(obj => obj.id === operation.objectId);
    if (object) {
      canvas.remove(object);
    }
  }, [canvas]);

  // Transform object on canvas
  const transformObjectOnCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    const object = canvas.getObjects().find(obj => obj.id === operation.objectId);
    if (!object) return;

    const data = operation.data;

    // Apply transformation
    if (data.left !== undefined) object.set('left', data.left);
    if (data.top !== undefined) object.set('top', data.top);
    if (data.scaleX !== undefined) object.set('scaleX', data.scaleX);
    if (data.scaleY !== undefined) object.set('scaleY', data.scaleY);
    if (data.angle !== undefined) object.set('angle', data.angle);

    object.set({
      version: operation.version,
      lastModified: operation.timestamp,
    });

    object.setCoords();
  }, [canvas]);

  // Create operation from canvas event
  const createOperationFromEvent = useCallback((
    type: Operation['type'],
    object: fabric.Object,
    userId: string
  ): Operation => {
    return {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      objectId: object.id || '',
      data: object.toObject(['id', 'userId', 'version', 'lastModified']),
      userId,
      timestamp: Date.now(),
      version: (object.version || 0) + 1,
    };
  }, []);

  // Send operation (adds to OT history and broadcasts)
  const sendOperation = useCallback((operation: Operation) => {
    // Add to local history first
    otManager.addToHistory(operation);
    
    // Add to store for broadcasting
    addStoreOperation(operation);
    
    console.log('Sent operation:', operation);
  }, [otManager, addStoreOperation]);

  // Resolve conflicts for a batch of operations
  const resolveBatch = useCallback((operations: Operation[]) => {
    return otManager.resolveBatch(operations);
  }, [otManager]);

  // Sync state with server
  const syncWithServer = useCallback(() => {
    // Request current state from server
    // This would typically be called when reconnecting
    const stateSummary = otManager.getStateSummary();
    console.log('Current OT state:', stateSummary);
    return stateSummary;
  }, [otManager]);

  // Clear OT history (useful for reset)
  const clearHistory = useCallback(() => {
    otManager.clearHistory();
  }, [otManager]);

  // Get OT statistics
  const getOTStats = useCallback(() => {
    return otManager.getStateSummary();
  }, [otManager]);

  return {
    processIncomingOperation,
    createOperationFromEvent,
    sendOperation,
    resolveBatch,
    syncWithServer,
    clearHistory,
    getOTStats,
  };
};
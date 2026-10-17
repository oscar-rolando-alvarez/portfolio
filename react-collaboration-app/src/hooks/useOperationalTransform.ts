import { useCallback } from 'react';
import { getOTManager } from '@/lib/ot';
import { useCollaborationStore } from '@/stores/collaborationStore';
import * as fabric from 'fabric';
import type { Operation } from '@/types';
import { remotelyRemoved } from '@/lib/fabricSetup';

export const useOperationalTransform = () => {
  const otManager = getOTManager();
  const { canvas, addOperation: addStoreOperation } = useCollaborationStore();

  // Add object to canvas. Fabric revives any serialised object type
  // (rect, circle, line, text, path, ...) from its toObject() payload.
  const addObjectToCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;
    if (canvas.getObjects().some((obj) => obj.id === operation.objectId)) return;

    void fabric.util
      .enlivenObjects<fabric.FabricObject>([operation.data])
      .then(([fabricObject]) => {
        if (!fabricObject) return;
        fabricObject.set({
          id: operation.objectId,
          userId: operation.userId,
          version: operation.version,
          lastModified: operation.timestamp,
          selectable: true,
          evented: true,
        });
        canvas.add(fabricObject);
        canvas.requestRenderAll();
      })
      .catch((error: unknown) => console.error('Failed to revive remote object:', error));
  }, [canvas]);

  // Update object on canvas
  const updateObjectOnCanvas = useCallback((operation: Operation) => {
    if (!canvas) return;

    const object = canvas.getObjects().find(obj => obj.id === operation.objectId);
    if (!object) {
      console.warn('Object not found for update:', operation.objectId);
      return;
    }

    // Apply updates (the class "type" is immutable and must not be re-set)
    const { type: _type, ...props } = operation.data ?? {};
    object.set({
      ...props,
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
      remotelyRemoved.add(object);
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
  }, [canvas, addObjectToCanvas, updateObjectOnCanvas, deleteObjectFromCanvas, transformObjectOnCanvas]);

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
  }, [otManager, canvas, applyOperationToCanvas]);

  // Create operation from canvas event
  const createOperationFromEvent = useCallback((
    type: Operation['type'],
    object: fabric.FabricObject,
    userId: string
  ): Operation => {
    return {
      id: crypto.randomUUID(),
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
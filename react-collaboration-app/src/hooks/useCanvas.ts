import { useCallback, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { useCollaborationStore } from '@/stores/collaborationStore';
import type { Operation, User } from '@/types';
import { remotelyRemoved } from '@/lib/fabricSetup';
import { getSocketManager } from '@/lib/socket';

const GRID_NAME = 'grid';

function removeGrid(canvas: fabric.Canvas) {
  canvas
    .getObjects()
    .filter((obj) => obj.name === GRID_NAME)
    .forEach((obj) => canvas.remove(obj));
}

function drawGrid(canvas: fabric.Canvas, size: number) {
  removeGrid(canvas);
  const width = canvas.getWidth();
  const height = canvas.getHeight();
  const style = { stroke: '#e0e0e0', strokeWidth: 1, selectable: false, evented: false, name: GRID_NAME };

  const lines: fabric.Line[] = [];
  for (let x = 0; x <= width; x += size) lines.push(new fabric.Line([x, 0, x, height], style));
  for (let y = 0; y <= height; y += size) lines.push(new fabric.Line([0, y, width, y], style));

  canvas.add(...lines);
  lines.forEach((line) => canvas.sendObjectToBack(line));
  canvas.requestRenderAll();
}

function stampObject(obj: fabric.FabricObject, user: User | null) {
  obj.set({ id: uuidv4(), userId: user?.id, version: 1, lastModified: Date.now() });
}

function toOperation(obj: fabric.FabricObject, type: Operation['type'], user: User): Operation {
  return {
    id: uuidv4(),
    type,
    objectId: obj.id ?? uuidv4(),
    data: obj.toObject(),
    userId: user.id,
    timestamp: Date.now(),
    version: obj.version ?? 1,
  };
}

function cursorFor(tool: string) {
  if (tool === 'hand') return 'grab';
  if (tool === 'text') return 'text';
  if (tool === 'select') return 'default';
  return 'crosshair';
}

/**
 * Owns the Fabric.js canvas lifecycle: creation, resizing, grid, the active
 * drawing tool and translation of canvas events into collaboration operations.
 */
export const useCanvas = (containerRef: React.RefObject<HTMLDivElement | null>) => {
  // Fabric's canvas is a mutable external object, so it lives in a ref; the
  // state copy only re-renders consumers and re-runs effects once it exists.
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const [canvas, setLocalCanvas] = useState<fabric.Canvas | null>(null);
  const {
    setCanvas,
    activeTool,
    currentUser,
    addOperation,
    toolOptions,
    showGrid,
    gridSize,
    snapToGrid,
  } = useCollaborationStore();

  // Latest values for long-lived Fabric event handlers.
  const currentUserRef = useRef<User | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const emitOperation = useCallback(
    (obj: fabric.FabricObject, type: Operation['type']) => {
      const user = currentUserRef.current;
      if (!user) return;
      const operation = toOperation(obj, type, user);
      addOperation(operation);
      getSocketManager().sendOperation(operation);
    },
    [addOperation]
  );

  // Create and dispose the canvas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const element = document.createElement('canvas');
    container.appendChild(element);

    const instance = new fabric.Canvas(element, {
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
    });
    // Fabric 6+ no longer creates a default brush.
    instance.freeDrawingBrush = new fabric.PencilBrush(instance);

    const handleResize = () => {
      instance.setDimensions({ width: container.clientWidth, height: container.clientHeight });
      instance.requestRenderAll();
    };
    window.addEventListener('resize', handleResize);

    canvasRef.current = instance;
    setLocalCanvas(instance);
    setCanvas(instance);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasRef.current = null;
      void instance.dispose().finally(() => element.remove());
    };
  }, [containerRef, setCanvas]);

  // Grid overlay.
  useEffect(() => {
    if (!canvas) return;
    if (showGrid) {
      drawGrid(canvas, gridSize);
    } else {
      removeGrid(canvas);
      canvas.requestRenderAll();
    }
  }, [canvas, showGrid, gridSize]);

  // Active tool: configure the canvas and install pointer handlers.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options = toolOptions;
    const disposers: Array<() => void> = [];
    type PointerHandler = (opt: fabric.TPointerEventInfo<fabric.TPointerEvent>) => void;
    const on = (event: 'mouse:down' | 'mouse:move' | 'mouse:up', handler: PointerHandler) => {
      disposers.push(canvas.on(event, handler));
    };

    canvas.isDrawingMode = activeTool === 'pen';
    canvas.selection = activeTool === 'select';
    canvas.defaultCursor = cursorFor(activeTool);

    switch (activeTool) {
      case 'pen': {
        canvas.freeDrawingBrush ??= new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = options.brushWidth || 5;
        canvas.freeDrawingBrush.color = options.color || '#000000';
        break;
      }

      case 'hand': {
        const pan: { last: fabric.Point | null } = { last: null };
        on('mouse:down', (opt) => {
          pan.last = opt.viewportPoint;
          canvas.defaultCursor = 'grabbing';
        });
        on('mouse:move', (opt) => {
          if (!pan.last) return;
          const vpt = [...canvas.viewportTransform] as fabric.TMat2D;
          vpt[4] += opt.viewportPoint.x - pan.last.x;
          vpt[5] += opt.viewportPoint.y - pan.last.y;
          canvas.setViewportTransform(vpt);
          pan.last = opt.viewportPoint;
        });
        on('mouse:up', () => {
          pan.last = null;
          canvas.defaultCursor = 'grab';
        });
        break;
      }

      case 'rectangle':
      case 'circle':
      case 'line': {
        const draft: { origin: fabric.Point | null; shape: fabric.FabricObject | null } = {
          origin: null,
          shape: null,
        };
        const stroke = {
          stroke: options.strokeColor || '#000000',
          strokeWidth: options.strokeWidth || 2,
        };
        const fill = options.fillColor || 'transparent';

        on('mouse:down', (opt) => {
          const { x, y } = opt.scenePoint;
          const shape =
            activeTool === 'rectangle'
              ? new fabric.Rect({ left: x, top: y, width: 0, height: 0, fill, ...stroke })
              : activeTool === 'circle'
                ? new fabric.Circle({ left: x, top: y, radius: 0, fill, ...stroke })
                : new fabric.Line([x, y, x, y], { ...stroke, strokeLineCap: 'round' });
          stampObject(shape, currentUserRef.current);
          canvas.add(shape);
          draft.origin = opt.scenePoint;
          draft.shape = shape;
        });

        on('mouse:move', (opt) => {
          const { origin, shape } = draft;
          if (!origin || !shape) return;
          const p = opt.scenePoint;
          if (shape instanceof fabric.Rect) {
            shape.set({
              left: Math.min(origin.x, p.x),
              top: Math.min(origin.y, p.y),
              width: Math.abs(origin.x - p.x),
              height: Math.abs(origin.y - p.y),
            });
          } else if (shape instanceof fabric.Circle) {
            const radius = Math.abs(origin.x - p.x) / 2;
            shape.set({ radius, left: origin.x - radius, top: origin.y - radius });
          } else if (shape instanceof fabric.Line) {
            shape.set({ x2: p.x, y2: p.y });
          }
          canvas.requestRenderAll();
        });

        on('mouse:up', () => {
          if (draft.shape) {
            draft.shape.setCoords();
            emitOperation(draft.shape, 'add');
          }
          draft.origin = null;
          draft.shape = null;
        });
        break;
      }

      case 'text': {
        on('mouse:down', (opt) => {
          if (opt.target) return; // clicking existing text edits it instead
          const text = new fabric.IText('Type here...', {
            left: opt.scenePoint.x,
            top: opt.scenePoint.y,
            fontSize: options.fontSize || 16,
            fill: options.color || '#000000',
            fontFamily: options.fontFamily || 'Arial',
          });
          stampObject(text, currentUserRef.current);
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          emitOperation(text, 'add');
        });
        break;
      }
    }

    return () => disposers.forEach((dispose) => dispose());
  }, [canvas, activeTool, toolOptions, emitOperation]); // `canvas` re-runs this once the instance exists

  // Object lifecycle -> collaboration operations.
  useEffect(() => {
    if (!canvas) return;

    const offModified = canvas.on('object:modified', ({ target }) => {
      if (!target?.id) return;
      target.set({ version: (target.version ?? 1) + 1, lastModified: Date.now() });
      emitOperation(target, 'update');
    });
    const offAdded = canvas.on('object:added', ({ target }) => {
      if (!target.id && target.name !== GRID_NAME) stampObject(target, currentUserRef.current);
    });
    const offRemoved = canvas.on('object:removed', ({ target }) => {
      if (!target.id || target.name === GRID_NAME || remotelyRemoved.has(target)) return;
      emitOperation(target, 'delete');
    });
    const offPath = canvas.on('path:created', ({ path }) => {
      stampObject(path, currentUserRef.current);
      emitOperation(path, 'add');
    });

    return () => {
      offModified();
      offAdded();
      offRemoved();
      offPath();
    };
  }, [canvas, emitOperation]);

  // Snap to grid while dragging.
  useEffect(() => {
    if (!canvas || !snapToGrid) return;
    return canvas.on('object:moving', ({ target }) => {
      target.set({
        left: Math.round(target.left / gridSize) * gridSize,
        top: Math.round(target.top / gridSize) * gridSize,
      });
    });
  }, [canvas, snapToGrid, gridSize]);

  const zoomCanvas = useCallback(
    (delta: number, pointer?: { x: number; y: number }) => {
      if (!canvas) return;
      const zoom = Math.min(20, Math.max(0.01, canvas.getZoom() * 0.999 ** delta));
      if (pointer) canvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), zoom);
      else canvas.setZoom(zoom);
    },
    [canvas]
  );

  const panCanvas = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!canvas) return;
      const vpt = [...canvas.viewportTransform] as fabric.TMat2D;
      vpt[4] += deltaX;
      vpt[5] += deltaY;
      canvas.setViewportTransform(vpt);
    },
    [canvas]
  );

  const resetViewport = useCallback(() => {
    canvas?.setViewportTransform([1, 0, 0, 1, 0, 0]);
  }, [canvas]);

  return { canvas, zoomCanvas, panCanvas, resetViewport };
};

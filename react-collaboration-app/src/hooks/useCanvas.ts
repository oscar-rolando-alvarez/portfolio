import { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import { v4 as uuidv4 } from 'uuid';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { ToolType, Operation } from '@/types';

export const useCanvas = (containerRef: React.RefObject<HTMLDivElement>) => {
  const canvasRef = useRef<fabric.Canvas | null>(null);
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

  // Initialize canvas
  useEffect(() => {
    if (!containerRef.current) return;

    const canvasElement = document.createElement('canvas');
    canvasElement.id = 'fabric-canvas';
    containerRef.current.appendChild(canvasElement);

    const canvas = new fabric.Canvas(canvasElement, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      imageSmoothingEnabled: true,
    });

    // Enable object caching for better performance
    fabric.Object.prototype.objectCaching = true;
    fabric.Object.prototype.statefullCache = true;

    canvasRef.current = canvas;
    setCanvas(canvas);

    // Setup grid
    if (showGrid) {
      drawGrid(canvas, gridSize);
    }

    return () => {
      canvas.dispose();
      if (containerRef.current?.contains(canvasElement)) {
        containerRef.current.removeChild(canvasElement);
      }
    };
  }, [containerRef, setCanvas]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        canvasRef.current.renderAll();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw grid helper
  const drawGrid = useCallback((canvas: fabric.Canvas, size: number) => {
    const width = canvas.getWidth();
    const height = canvas.getHeight();

    // Remove existing grid
    const existingGrid = canvas.getObjects().filter(obj => obj.name === 'grid');
    existingGrid.forEach(obj => canvas.remove(obj));

    const gridLines: fabric.Line[] = [];

    // Vertical lines
    for (let i = 0; i <= width; i += size) {
      const line = new fabric.Line([i, 0, i, height], {
        stroke: '#e0e0e0',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        name: 'grid',
      });
      gridLines.push(line);
    }

    // Horizontal lines
    for (let i = 0; i <= height; i += size) {
      const line = new fabric.Line([0, i, width, i], {
        stroke: '#e0e0e0',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        name: 'grid',
      });
      gridLines.push(line);
    }

    canvas.add(...gridLines);
    canvas.sendToBack(...gridLines);
    canvas.renderAll();
  }, []);

  // Update grid when settings change
  useEffect(() => {
    if (canvasRef.current) {
      if (showGrid) {
        drawGrid(canvasRef.current, gridSize);
      } else {
        const existingGrid = canvasRef.current.getObjects().filter(obj => obj.name === 'grid');
        existingGrid.forEach(obj => canvasRef.current!.remove(obj));
        canvasRef.current.renderAll();
      }
    }
  }, [showGrid, gridSize, drawGrid]);

  // Handle tool changes
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    
    // Clear existing event listeners
    canvas.off('mouse:down');
    canvas.off('mouse:move');
    canvas.off('mouse:up');
    canvas.off('path:created');

    switch (activeTool) {
      case 'select':
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        break;

      case 'hand':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        setupPanTool(canvas);
        break;

      case 'pen':
        canvas.isDrawingMode = true;
        canvas.selection = false;
        canvas.freeDrawingBrush.width = toolOptions.brushWidth || 5;
        canvas.freeDrawingBrush.color = toolOptions.color || '#000000';
        break;

      case 'rectangle':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupShapeTool(canvas, 'rectangle');
        break;

      case 'circle':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupShapeTool(canvas, 'circle');
        break;

      case 'line':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'crosshair';
        setupLineTool(canvas);
        break;

      case 'text':
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = 'text';
        setupTextTool(canvas);
        break;

      default:
        canvas.isDrawingMode = false;
        canvas.selection = true;
        canvas.defaultCursor = 'default';
    }
  }, [activeTool, toolOptions]);

  // Setup pan tool
  const setupPanTool = useCallback((canvas: fabric.Canvas) => {
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;

    canvas.on('mouse:down', (opt) => {
      const evt = opt.e;
      isDragging = true;
      canvas.selection = false;
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
      canvas.defaultCursor = 'grabbing';
    });

    canvas.on('mouse:move', (opt) => {
      if (isDragging) {
        const evt = opt.e;
        const vpt = canvas.viewportTransform!;
        vpt[4] += evt.clientX - lastPosX;
        vpt[5] += evt.clientY - lastPosY;
        canvas.requestRenderAll();
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
      }
    });

    canvas.on('mouse:up', () => {
      canvas.setViewportTransform(canvas.viewportTransform!);
      isDragging = false;
      canvas.selection = true;
      canvas.defaultCursor = 'grab';
    });
  }, []);

  // Setup shape tools
  const setupShapeTool = useCallback((canvas: fabric.Canvas, shapeType: string) => {
    let isDown = false;
    let origX = 0;
    let origY = 0;
    let shape: fabric.Object | null = null;

    canvas.on('mouse:down', (opt) => {
      isDown = true;
      const pointer = canvas.getPointer(opt.e);
      origX = pointer.x;
      origY = pointer.y;

      if (shapeType === 'rectangle') {
        shape = new fabric.Rect({
          left: origX,
          top: origY,
          width: 0,
          height: 0,
          fill: toolOptions.fillColor || 'transparent',
          stroke: toolOptions.strokeColor || '#000000',
          strokeWidth: toolOptions.strokeWidth || 2,
        });
      } else if (shapeType === 'circle') {
        shape = new fabric.Circle({
          left: origX,
          top: origY,
          radius: 0,
          fill: toolOptions.fillColor || 'transparent',
          stroke: toolOptions.strokeColor || '#000000',
          strokeWidth: toolOptions.strokeWidth || 2,
        });
      }

      if (shape) {
        addObjectId(shape);
        canvas.add(shape);
      }
    });

    canvas.on('mouse:move', (opt) => {
      if (!isDown || !shape) return;
      
      const pointer = canvas.getPointer(opt.e);
      
      if (shapeType === 'rectangle') {
        const rect = shape as fabric.Rect;
        rect.set({
          width: Math.abs(origX - pointer.x),
          height: Math.abs(origY - pointer.y),
          left: Math.min(origX, pointer.x),
          top: Math.min(origY, pointer.y),
        });
      } else if (shapeType === 'circle') {
        const circle = shape as fabric.Circle;
        const radius = Math.abs(origX - pointer.x) / 2;
        circle.set({
          radius: radius,
          left: origX - radius,
          top: origY - radius,
        });
      }
      
      canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
      if (shape && isDown) {
        createObjectOperation(shape, 'add');
      }
      isDown = false;
      shape = null;
    });
  }, [toolOptions]);

  // Setup line tool
  const setupLineTool = useCallback((canvas: fabric.Canvas) => {
    let isDown = false;
    let line: fabric.Line | null = null;

    canvas.on('mouse:down', (opt) => {
      isDown = true;
      const pointer = canvas.getPointer(opt.e);
      
      line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: toolOptions.strokeColor || '#000000',
        strokeWidth: toolOptions.strokeWidth || 2,
        strokeLineCap: 'round',
      });

      addObjectId(line);
      canvas.add(line);
    });

    canvas.on('mouse:move', (opt) => {
      if (!isDown || !line) return;
      
      const pointer = canvas.getPointer(opt.e);
      line.set({
        x2: pointer.x,
        y2: pointer.y,
      });
      canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
      if (line && isDown) {
        createObjectOperation(line, 'add');
      }
      isDown = false;
      line = null;
    });
  }, [toolOptions]);

  // Setup text tool
  const setupTextTool = useCallback((canvas: fabric.Canvas) => {
    canvas.on('mouse:down', (opt) => {
      const pointer = canvas.getPointer(opt.e);
      
      const textbox = new fabric.IText('Type here...', {
        left: pointer.x,
        top: pointer.y,
        fontSize: toolOptions.fontSize || 16,
        fill: toolOptions.color || '#000000',
        fontFamily: toolOptions.fontFamily || 'Arial',
      });

      addObjectId(textbox);
      canvas.add(textbox);
      canvas.setActiveObject(textbox);
      textbox.enterEditing();
      textbox.selectAll();
      
      createObjectOperation(textbox, 'add');
    });
  }, [toolOptions]);

  // Add unique ID to objects
  const addObjectId = useCallback((obj: fabric.Object) => {
    obj.set({
      id: uuidv4(),
      userId: currentUser?.id,
      version: 1,
      lastModified: Date.now(),
    });
  }, [currentUser]);

  // Create operation for object changes
  const createObjectOperation = useCallback((obj: fabric.Object, type: 'add' | 'update' | 'delete') => {
    if (!currentUser) return;

    const operation: Operation = {
      id: uuidv4(),
      type,
      objectId: obj.id || uuidv4(),
      data: obj.toObject(['id', 'userId', 'version', 'lastModified']),
      userId: currentUser.id,
      timestamp: Date.now(),
      version: 1,
    };

    addOperation(operation);
  }, [currentUser, addOperation]);

  // Handle object modifications
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleObjectModified = (e: fabric.IEvent) => {
      const obj = e.target;
      if (obj && obj.id) {
        obj.set({
          version: (obj.version || 1) + 1,
          lastModified: Date.now(),
        });
        createObjectOperation(obj, 'update');
      }
    };

    const handleObjectAdded = (e: fabric.IEvent) => {
      const obj = e.target;
      if (obj && !obj.id) {
        addObjectId(obj);
      }
    };

    const handlePathCreated = (e: any) => {
      const path = e.path;
      if (path) {
        addObjectId(path);
        createObjectOperation(path, 'add');
      }
    };

    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:added', handleObjectAdded);
    canvas.on('path:created', handlePathCreated);

    return () => {
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:added', handleObjectAdded);
      canvas.off('path:created', handlePathCreated);
    };
  }, [addObjectId, createObjectOperation]);

  // Snap to grid functionality
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleObjectMoving = (e: fabric.IEvent) => {
      if (!snapToGrid || !e.target) return;

      const obj = e.target;
      const left = Math.round(obj.left! / gridSize) * gridSize;
      const top = Math.round(obj.top! / gridSize) * gridSize;

      obj.set({
        left,
        top,
      });
    };

    if (snapToGrid) {
      canvas.on('object:moving', handleObjectMoving);
    }

    return () => {
      canvas.off('object:moving', handleObjectMoving);
    };
  }, [snapToGrid, gridSize]);

  // Zoom functionality
  const zoomCanvas = useCallback((delta: number, pointer?: { x: number; y: number }) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;

    if (zoom > 20) zoom = 20;
    if (zoom < 0.01) zoom = 0.01;

    if (pointer) {
      canvas.zoomToPoint(pointer, zoom);
    } else {
      canvas.setZoom(zoom);
    }
  }, []);

  // Pan canvas
  const panCanvas = useCallback((deltaX: number, deltaY: number) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const vpt = canvas.viewportTransform!;
    vpt[4] += deltaX;
    vpt[5] += deltaY;
    canvas.setViewportTransform(vpt);
  }, []);

  // Reset viewport
  const resetViewport = useCallback(() => {
    if (!canvasRef.current) return;

    canvasRef.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvasRef.current.setZoom(1);
  }, []);

  return {
    canvas: canvasRef.current,
    zoomCanvas,
    panCanvas,
    resetViewport,
  };
};
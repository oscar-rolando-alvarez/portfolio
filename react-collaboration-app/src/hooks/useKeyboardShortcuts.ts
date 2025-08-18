import { useEffect, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { KeyboardShortcut, ToolType } from '@/types';

export const keyboardShortcuts: KeyboardShortcut[] = [
  // Tools
  { key: 'v', action: 'select-tool', description: 'Select tool' },
  { key: 'r', action: 'rectangle-tool', description: 'Rectangle tool' },
  { key: 'o', action: 'circle-tool', description: 'Circle tool' },
  { key: 'l', action: 'line-tool', description: 'Line tool' },
  { key: 'a', action: 'arrow-tool', description: 'Arrow tool' },
  { key: 't', action: 'text-tool', description: 'Text tool' },
  { key: 'p', action: 'pen-tool', description: 'Pen tool' },
  { key: 'e', action: 'eraser-tool', description: 'Eraser tool' },
  { key: 'h', action: 'hand-tool', description: 'Hand tool' },
  
  // Edit operations
  { key: 'ctrl+z', action: 'undo', description: 'Undo' },
  { key: 'cmd+z', action: 'undo', description: 'Undo (Mac)' },
  { key: 'ctrl+y', action: 'redo', description: 'Redo' },
  { key: 'ctrl+shift+z', action: 'redo', description: 'Redo' },
  { key: 'cmd+y', action: 'redo', description: 'Redo (Mac)' },
  { key: 'cmd+shift+z', action: 'redo', description: 'Redo (Mac)' },
  
  // Selection and manipulation
  { key: 'ctrl+a', action: 'select-all', description: 'Select all' },
  { key: 'cmd+a', action: 'select-all', description: 'Select all (Mac)' },
  { key: 'delete', action: 'delete', description: 'Delete selected' },
  { key: 'backspace', action: 'delete', description: 'Delete selected' },
  { key: 'ctrl+c', action: 'copy', description: 'Copy' },
  { key: 'cmd+c', action: 'copy', description: 'Copy (Mac)' },
  { key: 'ctrl+v', action: 'paste', description: 'Paste' },
  { key: 'cmd+v', action: 'paste', description: 'Paste (Mac)' },
  { key: 'ctrl+d', action: 'duplicate', description: 'Duplicate' },
  { key: 'cmd+d', action: 'duplicate', description: 'Duplicate (Mac)' },
  
  // Layer operations
  { key: 'ctrl+shift+]', action: 'bring-forward', description: 'Bring forward' },
  { key: 'cmd+shift+]', action: 'bring-forward', description: 'Bring forward (Mac)' },
  { key: 'ctrl+shift+[', action: 'send-backward', description: 'Send backward' },
  { key: 'cmd+shift+[', action: 'send-backward', description: 'Send backward (Mac)' },
  { key: 'ctrl+]', action: 'bring-to-front', description: 'Bring to front' },
  { key: 'cmd+]', action: 'bring-to-front', description: 'Bring to front (Mac)' },
  { key: 'ctrl+[', action: 'send-to-back', description: 'Send to back' },
  { key: 'cmd+[', action: 'send-to-back', description: 'Send to back (Mac)' },
  
  // View operations
  { key: 'ctrl+=', action: 'zoom-in', description: 'Zoom in' },
  { key: 'cmd+=', action: 'zoom-in', description: 'Zoom in (Mac)' },
  { key: 'ctrl+-', action: 'zoom-out', description: 'Zoom out' },
  { key: 'cmd+-', action: 'zoom-out', description: 'Zoom out (Mac)' },
  { key: 'ctrl+0', action: 'zoom-to-fit', description: 'Zoom to fit' },
  { key: 'cmd+0', action: 'zoom-to-fit', description: 'Zoom to fit (Mac)' },
  { key: 'ctrl+1', action: 'zoom-to-100', description: 'Zoom to 100%' },
  { key: 'cmd+1', action: 'zoom-to-100', description: 'Zoom to 100% (Mac)' },
  
  // File operations
  { key: 'ctrl+s', action: 'save', description: 'Save' },
  { key: 'cmd+s', action: 'save', description: 'Save (Mac)' },
  { key: 'ctrl+o', action: 'open', description: 'Open' },
  { key: 'cmd+o', action: 'open', description: 'Open (Mac)' },
  { key: 'ctrl+n', action: 'new', description: 'New' },
  { key: 'cmd+n', action: 'new', description: 'New (Mac)' },
  
  // UI toggles
  { key: 'g', action: 'toggle-grid', description: 'Toggle grid' },
  { key: 'ctrl+;', action: 'toggle-guides', description: 'Toggle guides' },
  { key: 'cmd+;', action: 'toggle-guides', description: 'Toggle guides (Mac)' },
  { key: 'ctrl+shift+;', action: 'toggle-snap', description: 'Toggle snap to grid' },
  { key: 'cmd+shift+;', action: 'toggle-snap', description: 'Toggle snap to grid (Mac)' },
  
  // Comments
  { key: 'c', action: 'comment-mode', description: 'Comment mode' },
  
  // Arrow key movements
  { key: 'arrowup', action: 'move-up', description: 'Move selection up' },
  { key: 'arrowdown', action: 'move-down', description: 'Move selection down' },
  { key: 'arrowleft', action: 'move-left', description: 'Move selection left' },
  { key: 'arrowright', action: 'move-right', description: 'Move selection right' },
  { key: 'shift+arrowup', action: 'move-up-10', description: 'Move selection up 10px' },
  { key: 'shift+arrowdown', action: 'move-down-10', description: 'Move selection down 10px' },
  { key: 'shift+arrowleft', action: 'move-left-10', description: 'Move selection left 10px' },
  { key: 'shift+arrowright', action: 'move-right-10', description: 'Move selection right 10px' },
];

export const useKeyboardShortcuts = () => {
  const {
    canvas,
    setActiveTool,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedObjects,
    toggleGrid,
    toggleSnapToGrid,
  } = useCollaborationStore();

  // Tool shortcuts
  useHotkeys('v', () => setActiveTool('select'));
  useHotkeys('r', () => setActiveTool('rectangle'));
  useHotkeys('o', () => setActiveTool('circle'));
  useHotkeys('l', () => setActiveTool('line'));
  useHotkeys('a', () => setActiveTool('arrow'));
  useHotkeys('t', () => setActiveTool('text'));
  useHotkeys('p', () => setActiveTool('pen'));
  useHotkeys('e', () => setActiveTool('eraser'));
  useHotkeys('h', () => setActiveTool('hand'));

  // Edit operations
  useHotkeys('ctrl+z, cmd+z', () => {
    if (canUndo) undo();
  }, { preventDefault: true });

  useHotkeys('ctrl+y, ctrl+shift+z, cmd+y, cmd+shift+z', () => {
    if (canRedo) redo();
  }, { preventDefault: true });

  // Selection operations
  useHotkeys('ctrl+a, cmd+a', () => {
    if (!canvas) return;
    const objects = canvas.getObjects().filter(obj => obj.evented !== false);
    if (objects.length > 0) {
      canvas.discardActiveObject();
      const selection = new fabric.ActiveSelection(objects, { canvas });
      canvas.setActiveObject(selection);
      canvas.renderAll();
    }
  }, { preventDefault: true });

  useHotkeys('delete, backspace', () => {
    if (!canvas || selectedObjects.length === 0) return;
    const activeObjects = canvas.getActiveObjects();
    activeObjects.forEach(obj => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
  });

  // Copy/Paste operations
  const copyToClipboard = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone((cloned: fabric.Object) => {
        localStorage.setItem('canvas-clipboard', JSON.stringify(cloned.toObject()));
      });
    }
  }, [canvas]);

  const pasteFromClipboard = useCallback(() => {
    if (!canvas) return;
    const clipboardData = localStorage.getItem('canvas-clipboard');
    if (clipboardData) {
      try {
        const objectData = JSON.parse(clipboardData);
        fabric.util.enlivenObjects([objectData], (objects: fabric.Object[]) => {
          objects.forEach(obj => {
            obj.set({
              left: (obj.left || 0) + 10,
              top: (obj.top || 0) + 10,
            });
            canvas.add(obj);
          });
          canvas.renderAll();
        });
      } catch (error) {
        console.error('Failed to paste object:', error);
      }
    }
  }, [canvas]);

  const duplicateSelection = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      activeObject.clone((cloned: fabric.Object) => {
        cloned.set({
          left: (cloned.left || 0) + 10,
          top: (cloned.top || 0) + 10,
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll();
      });
    }
  }, [canvas]);

  useHotkeys('ctrl+c, cmd+c', copyToClipboard, { preventDefault: true });
  useHotkeys('ctrl+v, cmd+v', pasteFromClipboard, { preventDefault: true });
  useHotkeys('ctrl+d, cmd+d', duplicateSelection, { preventDefault: true });

  // Layer operations
  const bringForward = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.bringForward(activeObject);
      canvas.renderAll();
    }
  }, [canvas]);

  const sendBackward = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.sendBackwards(activeObject);
      canvas.renderAll();
    }
  }, [canvas]);

  const bringToFront = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.bringToFront(activeObject);
      canvas.renderAll();
    }
  }, [canvas]);

  const sendToBack = useCallback(() => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
      canvas.sendToBack(activeObject);
      canvas.renderAll();
    }
  }, [canvas]);

  useHotkeys('ctrl+shift+], cmd+shift+]', bringForward);
  useHotkeys('ctrl+shift+[, cmd+shift+[', sendBackward);
  useHotkeys('ctrl+], cmd+]', bringToFront);
  useHotkeys('ctrl+[, cmd+[', sendToBack);

  // View operations
  const zoomIn = useCallback(() => {
    if (!canvas) return;
    let zoom = canvas.getZoom();
    zoom = zoom * 1.1;
    if (zoom > 20) zoom = 20;
    canvas.setZoom(zoom);
  }, [canvas]);

  const zoomOut = useCallback(() => {
    if (!canvas) return;
    let zoom = canvas.getZoom();
    zoom = zoom / 1.1;
    if (zoom < 0.01) zoom = 0.01;
    canvas.setZoom(zoom);
  }, [canvas]);

  const zoomToFit = useCallback(() => {
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setZoom(1);
  }, [canvas]);

  const zoomTo100 = useCallback(() => {
    if (!canvas) return;
    canvas.setZoom(1);
  }, [canvas]);

  useHotkeys('ctrl+=, cmd+=', zoomIn, { preventDefault: true });
  useHotkeys('ctrl+-, cmd+-', zoomOut, { preventDefault: true });
  useHotkeys('ctrl+0, cmd+0', zoomToFit, { preventDefault: true });
  useHotkeys('ctrl+1, cmd+1', zoomTo100, { preventDefault: true });

  // UI toggles
  useHotkeys('g', toggleGrid);
  useHotkeys('ctrl+shift+;, cmd+shift+;', toggleSnapToGrid);

  // Movement operations
  const moveSelection = useCallback((direction: 'up' | 'down' | 'left' | 'right', distance: number = 1) => {
    if (!canvas) return;
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    const currentLeft = activeObject.left || 0;
    const currentTop = activeObject.top || 0;

    switch (direction) {
      case 'up':
        activeObject.set('top', currentTop - distance);
        break;
      case 'down':
        activeObject.set('top', currentTop + distance);
        break;
      case 'left':
        activeObject.set('left', currentLeft - distance);
        break;
      case 'right':
        activeObject.set('left', currentLeft + distance);
        break;
    }

    activeObject.setCoords();
    canvas.renderAll();
  }, [canvas]);

  useHotkeys('arrowup', () => moveSelection('up'), { preventDefault: true });
  useHotkeys('arrowdown', () => moveSelection('down'), { preventDefault: true });
  useHotkeys('arrowleft', () => moveSelection('left'), { preventDefault: true });
  useHotkeys('arrowright', () => moveSelection('right'), { preventDefault: true });
  useHotkeys('shift+arrowup', () => moveSelection('up', 10), { preventDefault: true });
  useHotkeys('shift+arrowdown', () => moveSelection('down', 10), { preventDefault: true });
  useHotkeys('shift+arrowleft', () => moveSelection('left', 10), { preventDefault: true });
  useHotkeys('shift+arrowright', () => moveSelection('right', 10), { preventDefault: true });

  // Prevent default browser shortcuts that conflict
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
      }
      
      // Prevent browser save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }
      
      // Prevent browser new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    keyboardShortcuts,
    copyToClipboard,
    pasteFromClipboard,
    duplicateSelection,
    moveSelection,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomTo100,
  };
};
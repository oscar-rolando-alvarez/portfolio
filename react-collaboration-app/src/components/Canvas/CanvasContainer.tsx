import React, { useRef, useEffect } from 'react';
import { useCanvas } from '@/hooks/useCanvas';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { LiveCursors } from './LiveCursors';
import { Comments } from './Comments';

interface CanvasContainerProps {
  className?: string;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { canvas, zoomCanvas } = useCanvas(containerRef);
  const { users, comments } = useCollaborationStore();

  // Handle wheel events for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const pointer = canvas?.getPointer(e);
        zoomCanvas(e.deltaY, pointer);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [canvas, zoomCanvas]);

  // Handle keyboard shortcuts for canvas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canvas) return;

      // Delete selected objects
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
          activeObjects.forEach(obj => canvas.remove(obj));
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const objects = canvas.getObjects().filter(obj => obj.evented !== false);
        if (objects.length > 0) {
          canvas.discardActiveObject();
          const selection = new fabric.ActiveSelection(objects, {
            canvas: canvas,
          });
          canvas.setActiveObject(selection);
          canvas.renderAll();
        }
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const activeObject = canvas.getActiveObject();
        if (activeObject) {
          activeObject.clone((cloned: fabric.Object) => {
            localStorage.setItem('clipboard', JSON.stringify(cloned.toObject()));
          });
        }
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const clipboardData = localStorage.getItem('clipboard');
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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canvas]);

  return (
    <div className={`canvas-container ${className}`}>
      <div 
        ref={containerRef} 
        className="canvas-wrapper relative w-full h-full"
        style={{ cursor: 'default' }}
      >
        {/* Canvas will be injected here by useCanvas hook */}
        
        {/* Live cursors overlay */}
        <LiveCursors users={users} />
        
        {/* Comments overlay */}
        <Comments comments={comments} />
        
        {/* Canvas overlay for UI elements */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Ruler guides could go here */}
          {/* Selection handles could go here */}
        </div>
      </div>
    </div>
  );
};
import { useRef, useEffect } from 'react';
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
        const pointer = canvas?.getViewportPoint(e);
        zoomCanvas(e.deltaY, pointer);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [canvas, zoomCanvas]);

  // Selection, clipboard and deletion shortcuts live in useKeyboardShortcuts.

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
import React, { useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { fabric } from 'fabric';

// Drag and drop item types
export const DragItemTypes = {
  CANVAS_OBJECT: 'canvas-object',
  TEMPLATE: 'template',
  ASSET: 'asset',
  LAYER: 'layer',
};

// Template objects that can be dragged onto canvas
export interface TemplateItem {
  id: string;
  type: 'shape' | 'icon' | 'text' | 'image';
  name: string;
  preview: string;
  data: any;
}

export const defaultTemplates: TemplateItem[] = [
  {
    id: 'rect-template',
    type: 'shape',
    name: 'Rectangle',
    preview: '▬',
    data: {
      type: 'rect',
      width: 100,
      height: 60,
      fill: '#3b82f6',
      stroke: '#1e40af',
      strokeWidth: 2,
    },
  },
  {
    id: 'circle-template',
    type: 'shape',
    name: 'Circle',
    preview: '●',
    data: {
      type: 'circle',
      radius: 40,
      fill: '#ef4444',
      stroke: '#dc2626',
      strokeWidth: 2,
    },
  },
  {
    id: 'triangle-template',
    type: 'shape',
    name: 'Triangle',
    preview: '▲',
    data: {
      type: 'polygon',
      points: [
        { x: 0, y: -40 },
        { x: -35, y: 35 },
        { x: 35, y: 35 },
      ],
      fill: '#10b981',
      stroke: '#059669',
      strokeWidth: 2,
    },
  },
  {
    id: 'star-template',
    type: 'shape',
    name: 'Star',
    preview: '★',
    data: {
      type: 'polygon',
      points: [
        { x: 0, y: -40 },
        { x: 12, y: -12 },
        { x: 40, y: -12 },
        { x: 20, y: 8 },
        { x: 24, y: 36 },
        { x: 0, y: 20 },
        { x: -24, y: 36 },
        { x: -20, y: 8 },
        { x: -40, y: -12 },
        { x: -12, y: -12 },
      ],
      fill: '#f59e0b',
      stroke: '#d97706',
      strokeWidth: 2,
    },
  },
  {
    id: 'arrow-template',
    type: 'shape',
    name: 'Arrow',
    preview: '→',
    data: {
      type: 'polygon',
      points: [
        { x: -30, y: -10 },
        { x: 20, y: -10 },
        { x: 20, y: -20 },
        { x: 40, y: 0 },
        { x: 20, y: 20 },
        { x: 20, y: 10 },
        { x: -30, y: 10 },
      ],
      fill: '#8b5cf6',
      stroke: '#7c3aed',
      strokeWidth: 2,
    },
  },
  {
    id: 'text-template',
    type: 'text',
    name: 'Text',
    preview: 'T',
    data: {
      type: 'i-text',
      text: 'Click to edit',
      fontSize: 20,
      fill: '#374151',
      fontFamily: 'Arial',
    },
  },
];

// Draggable template component
interface DraggableTemplateProps {
  template: TemplateItem;
  className?: string;
}

export const DraggableTemplate: React.FC<DraggableTemplateProps> = ({
  template,
  className = '',
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: DragItemTypes.TEMPLATE,
    item: template,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag}
      className={`
        flex flex-col items-center p-3 bg-white border border-gray-200 rounded-lg
        cursor-move hover:bg-gray-50 hover:border-gray-300 transition-colors
        ${isDragging ? 'opacity-50' : ''}
        ${className}
      `}
      title={template.name}
    >
      <div className="text-2xl mb-1 text-gray-600">
        {template.preview}
      </div>
      <span className="text-xs text-gray-500 text-center">
        {template.name}
      </span>
    </div>
  );
};

// Canvas drop zone component
interface CanvasDropZoneProps {
  children: React.ReactNode;
  className?: string;
}

export const CanvasDropZone: React.FC<CanvasDropZoneProps> = ({
  children,
  className = '',
}) => {
  const { canvas, currentUser, addOperation } = useCollaborationStore();

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: [DragItemTypes.TEMPLATE, DragItemTypes.ASSET],
    drop: (item: TemplateItem, monitor) => {
      if (!canvas || !currentUser) return;

      const offset = monitor.getDropResult();
      const canvasElement = canvas.getElement();
      const rect = canvasElement.getBoundingClientRect();
      
      // Calculate drop position relative to canvas
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const canvasPoint = new fabric.Point(
        clientOffset.x - rect.left,
        clientOffset.y - rect.top
      );

      // Transform to canvas coordinates (accounting for zoom and pan)
      const pointer = fabric.util.transformPoint(
        canvasPoint,
        fabric.util.invertTransform(canvas.viewportTransform!)
      );

      // Create fabric object from template
      createObjectFromTemplate(item, pointer.x, pointer.y);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  const createObjectFromTemplate = (template: TemplateItem, x: number, y: number) => {
    if (!canvas || !currentUser) return;

    let fabricObject: fabric.Object | null = null;
    const data = template.data;

    switch (data.type) {
      case 'rect':
        fabricObject = new fabric.Rect({
          ...data,
          left: x - data.width / 2,
          top: y - data.height / 2,
        });
        break;

      case 'circle':
        fabricObject = new fabric.Circle({
          ...data,
          left: x - data.radius,
          top: y - data.radius,
        });
        break;

      case 'polygon':
        fabricObject = new fabric.Polygon(data.points, {
          ...data,
          left: x,
          top: y,
        });
        break;

      case 'i-text':
        fabricObject = new fabric.IText(data.text, {
          ...data,
          left: x,
          top: y,
        });
        break;

      default:
        console.warn('Unknown template type:', data.type);
        return;
    }

    if (fabricObject) {
      // Add unique ID and metadata
      const objectId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      fabricObject.set({
        id: objectId,
        userId: currentUser.id,
        version: 1,
        lastModified: Date.now(),
      });

      // Add to canvas
      canvas.add(fabricObject);
      canvas.setActiveObject(fabricObject);
      canvas.renderAll();

      // Create operation for collaboration
      const operation = {
        id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'add' as const,
        objectId,
        data: fabricObject.toObject(['id', 'userId', 'version', 'lastModified']),
        userId: currentUser.id,
        timestamp: Date.now(),
        version: 1,
      };

      addOperation(operation);
    }
  };

  return (
    <div
      ref={drop}
      className={`
        relative w-full h-full
        ${isOver && canDrop ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset' : ''}
        ${className}
      `}
    >
      {children}
      
      {/* Drop indicator */}
      {isOver && canDrop && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
            Drop to add to canvas
          </div>
        </div>
      )}
    </div>
  );
};

// Asset library panel
export const AssetLibrary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', name: 'All' },
    { id: 'shape', name: 'Shapes' },
    { id: 'text', name: 'Text' },
    { id: 'icon', name: 'Icons' },
  ];

  const filteredTemplates = defaultTemplates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-medium text-gray-900 mb-3">Asset Library</h3>
        
        {/* Search */}
        <input
          type="text"
          placeholder="Search assets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        {/* Category filter */}
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`
                  px-2 py-1 text-xs rounded
                  ${selectedCategory === category.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3">
          {filteredTemplates.map(template => (
            <DraggableTemplate
              key={template.id}
              template={template}
              className="aspect-square"
            />
          ))}
        </div>
        
        {filteredTemplates.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">📦</div>
            <p className="text-sm">No assets found</p>
          </div>
        )}
      </div>
    </div>
  );
};
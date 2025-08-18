import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  MoreVertical,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useDrag, useDrop } from 'react-dnd';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Layer } from '@/types';
import { cn } from '@/lib/utils';

interface LayerItemProps {
  layer: Layer;
  isActive: boolean;
  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onDelete: (layerId: string) => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  index: number;
}

const LayerItem: React.FC<LayerItemProps> = ({
  layer,
  isActive,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDelete,
  onMove,
  index,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const [isExpanded, setIsExpanded] = useState(true);

  const [{ isDragging }, drag] = useDrag({
    type: 'layer',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'layer',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        onMove(item.index, index);
        item.index = index;
      }
    },
  });

  const handleRename = () => {
    if (editName.trim() && editName !== layer.name) {
      onRename(layer.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditName(layer.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      ref={(node) => drag(drop(node))}
      className={cn(
        "layer-item group cursor-pointer border-l-2 transition-all",
        isActive ? "selected border-l-blue-500 bg-blue-50" : "border-l-transparent",
        isDragging && "opacity-50"
      )}
      onClick={() => onSelect(layer.id)}
    >
      <div className="flex items-center gap-2 p-2">
        {/* Expand/Collapse */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-1 hover:bg-gray-200 rounded"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        {/* Layer Icon */}
        <Layers className="h-4 w-4 text-gray-500" />

        {/* Layer Name */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyPress}
              className="h-6 text-sm"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span 
              className="text-sm truncate block"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {layer.name}
            </span>
          )}
        </div>

        {/* Object Count */}
        <span className="text-xs text-gray-400 bg-gray-100 px-1 rounded">
          {layer.objects.length}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            className="p-1 hover:bg-gray-200 rounded"
            title={layer.visible ? 'Hide layer' : 'Show layer'}
          >
            {layer.visible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3 text-gray-400" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(layer.id);
            }}
            className="p-1 hover:bg-gray-200 rounded"
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          >
            {layer.locked ? (
              <Lock className="h-3 w-3 text-gray-400" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(layer.id);
            }}
            className="p-1 hover:bg-red-200 rounded text-red-600"
            title="Delete layer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Layer Objects */}
      {isExpanded && layer.objects.length > 0 && (
        <div className="ml-8 border-l border-gray-200">
          {layer.objects.map((objectId, index) => (
            <div
              key={objectId}
              className="flex items-center gap-2 p-1 text-sm text-gray-600 hover:bg-gray-50"
            >
              <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
              <span className="truncate">Object {index + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const LayersPanel: React.FC = () => {
  const { 
    layers, 
    activeLayer, 
    setActiveLayer, 
    addLayer,
    canvas 
  } = useCollaborationStore();

  const [layerList, setLayerList] = useState(layers);

  useEffect(() => {
    setLayerList([...layers].sort((a, b) => b.order - a.order));
  }, [layers]);

  const createNewLayer = () => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${layers.length + 1}`,
      visible: true,
      locked: false,
      objects: [],
      order: Math.max(...layers.map(l => l.order), 0) + 1,
    };
    addLayer(newLayer);
    setActiveLayer(newLayer.id);
  };

  const toggleLayerVisibility = (layerId: string) => {
    useCollaborationStore.setState(state => ({
      layers: state.layers.map(layer =>
        layer.id === layerId
          ? { ...layer, visible: !layer.visible }
          : layer
      )
    }));

    // Update canvas objects visibility
    if (canvas) {
      const layer = layers.find(l => l.id === layerId);
      if (layer) {
        layer.objects.forEach(objectId => {
          const obj = canvas.getObjects().find(o => o.id === objectId);
          if (obj) {
            obj.set('visible', !layer.visible);
          }
        });
        canvas.renderAll();
      }
    }
  };

  const toggleLayerLock = (layerId: string) => {
    useCollaborationStore.setState(state => ({
      layers: state.layers.map(layer =>
        layer.id === layerId
          ? { ...layer, locked: !layer.locked }
          : layer
      )
    }));

    // Update canvas objects selectability
    if (canvas) {
      const layer = layers.find(l => l.id === layerId);
      if (layer) {
        layer.objects.forEach(objectId => {
          const obj = canvas.getObjects().find(o => o.id === objectId);
          if (obj) {
            obj.set('selectable', layer.locked);
            obj.set('evented', layer.locked);
          }
        });
      }
    }
  };

  const renameLayer = (layerId: string, newName: string) => {
    useCollaborationStore.setState(state => ({
      layers: state.layers.map(layer =>
        layer.id === layerId
          ? { ...layer, name: newName }
          : layer
      )
    }));
  };

  const deleteLayer = (layerId: string) => {
    if (layers.length <= 1) return; // Don't delete the last layer

    const layer = layers.find(l => l.id === layerId);
    if (layer && canvas) {
      // Remove all objects in the layer
      layer.objects.forEach(objectId => {
        const obj = canvas.getObjects().find(o => o.id === objectId);
        if (obj) {
          canvas.remove(obj);
        }
      });
      canvas.renderAll();
    }

    useCollaborationStore.setState(state => ({
      layers: state.layers.filter(layer => layer.id !== layerId),
      activeLayer: state.activeLayer === layerId 
        ? state.layers.find(l => l.id !== layerId)?.id || null
        : state.activeLayer
    }));
  };

  const moveLayer = (dragIndex: number, hoverIndex: number) => {
    const draggedLayer = layerList[dragIndex];
    const newLayerList = [...layerList];
    newLayerList.splice(dragIndex, 1);
    newLayerList.splice(hoverIndex, 0, draggedLayer);
    
    // Update order values
    const updatedLayers = newLayerList.map((layer, index) => ({
      ...layer,
      order: newLayerList.length - index
    }));

    setLayerList(updatedLayers);
    
    useCollaborationStore.setState(state => ({
      layers: state.layers.map(layer => {
        const updated = updatedLayers.find(l => l.id === layer.id);
        return updated ? { ...layer, order: updated.order } : layer;
      })
    }));
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Layers</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={createNewLayer}
          className="h-8 w-8"
          title="Add new layer"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto">
        {layerList.map((layer, index) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            index={index}
            isActive={layer.id === activeLayer}
            onSelect={setActiveLayer}
            onToggleVisibility={toggleLayerVisibility}
            onToggleLock={toggleLayerLock}
            onRename={renameLayer}
            onDelete={deleteLayer}
            onMove={moveLayer}
          />
        ))}
      </div>

      {/* Layer Controls */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Show all layers
              useCollaborationStore.setState(state => ({
                layers: state.layers.map(layer => ({ ...layer, visible: true }))
              }));
            }}
            className="flex-1"
          >
            <Eye className="h-4 w-4 mr-1" />
            Show All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Hide all layers except active
              useCollaborationStore.setState(state => ({
                layers: state.layers.map(layer => ({
                  ...layer,
                  visible: layer.id === activeLayer
                }))
              }));
            }}
            className="flex-1"
          >
            <EyeOff className="h-4 w-4 mr-1" />
            Hide Others
          </Button>
        </div>
      </div>
    </div>
  );
};
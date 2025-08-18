import React, { useEffect, useState } from 'react';
import { Settings, Lock, Unlock, Eye, EyeOff, Trash2, Copy, Layers } from 'lucide-react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { fabric } from 'fabric';

export const PropertiesPanel: React.FC = () => {
  const { canvas, selectedObjects } = useCollaborationStore();
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [properties, setProperties] = useState<any>({});

  // Update selected object when selection changes
  useEffect(() => {
    if (!canvas || selectedObjects.length === 0) {
      setSelectedObject(null);
      setProperties({});
      return;
    }

    const fabricObject = canvas.getObjects().find(obj => obj.id === selectedObjects[0]);
    if (fabricObject) {
      setSelectedObject(fabricObject);
      setProperties({
        left: Math.round(fabricObject.left || 0),
        top: Math.round(fabricObject.top || 0),
        width: Math.round(fabricObject.width || 0),
        height: Math.round(fabricObject.height || 0),
        scaleX: fabricObject.scaleX || 1,
        scaleY: fabricObject.scaleY || 1,
        angle: fabricObject.angle || 0,
        opacity: fabricObject.opacity || 1,
        fill: fabricObject.fill || '#000000',
        stroke: fabricObject.stroke || '#000000',
        strokeWidth: fabricObject.strokeWidth || 1,
        visible: fabricObject.visible !== false,
        selectable: fabricObject.selectable !== false,
      });
    }
  }, [canvas, selectedObjects]);

  const updateProperty = (key: string, value: any) => {
    if (!selectedObject || !canvas) return;

    selectedObject.set(key, value);
    canvas.renderAll();

    setProperties(prev => ({ ...prev, [key]: value }));

    // Trigger object modified event for collaboration
    canvas.fire('object:modified', { target: selectedObject });
  };

  const handlePositionChange = (axis: 'left' | 'top', value: string) => {
    const numValue = parseFloat(value) || 0;
    updateProperty(axis, numValue);
  };

  const handleDimensionChange = (dimension: 'width' | 'height', value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue > 0) {
      updateProperty(dimension, numValue);
    }
  };

  const handleScaleChange = (axis: 'scaleX' | 'scaleY', value: string) => {
    const numValue = parseFloat(value) || 1;
    updateProperty(axis, numValue);
  };

  const duplicateObject = () => {
    if (!selectedObject || !canvas) return;

    selectedObject.clone((cloned: fabric.Object) => {
      cloned.set({
        left: (cloned.left || 0) + 10,
        top: (cloned.top || 0) + 10,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
      canvas.renderAll();
    });
  };

  const deleteObject = () => {
    if (!selectedObject || !canvas) return;

    canvas.remove(selectedObject);
    canvas.renderAll();
  };

  const toggleLock = () => {
    updateProperty('selectable', !properties.selectable);
    updateProperty('evented', !properties.selectable);
  };

  const toggleVisibility = () => {
    updateProperty('visible', !properties.visible);
  };

  const bringToFront = () => {
    if (!selectedObject || !canvas) return;
    canvas.bringToFront(selectedObject);
    canvas.renderAll();
  };

  const sendToBack = () => {
    if (!selectedObject || !canvas) return;
    canvas.sendToBack(selectedObject);
    canvas.renderAll();
  };

  if (!selectedObject) {
    return (
      <div className="w-64 bg-white border-l border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
          <Settings className="h-5 w-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">Properties</h3>
        </div>
        
        <div className="text-center text-gray-500 py-8">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Select an object to see properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
        <Settings className="h-5 w-5 text-gray-600" />
        <h3 className="font-medium text-gray-900">Properties</h3>
      </div>

      {/* Object Info */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Object Info</h4>
        <div className="text-sm text-gray-600">
          <p>Type: {selectedObject.type}</p>
          <p>ID: {selectedObject.id}</p>
        </div>
      </div>

      {/* Position & Size */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Position & Size</h4>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-gray-500">X</label>
            <Input
              type="number"
              value={properties.left}
              onChange={(e) => handlePositionChange('left', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Y</label>
            <Input
              type="number"
              value={properties.top}
              onChange={(e) => handlePositionChange('top', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-gray-500">Width</label>
            <Input
              type="number"
              value={properties.width}
              onChange={(e) => handleDimensionChange('width', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Height</label>
            <Input
              type="number"
              value={properties.height}
              onChange={(e) => handleDimensionChange('height', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Transform */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Transform</h4>
        <div className="space-y-3">
          <Slider
            label="Rotation"
            value={properties.angle}
            onChange={(e) => updateProperty('angle', parseFloat(e.target.value))}
            min={-180}
            max={180}
            className="text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Scale X</label>
              <Input
                type="number"
                step="0.1"
                value={properties.scaleX}
                onChange={(e) => handleScaleChange('scaleX', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Scale Y</label>
              <Input
                type="number"
                step="0.1"
                value={properties.scaleY}
                onChange={(e) => handleScaleChange('scaleY', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Appearance</h4>
        <div className="space-y-3">
          <Slider
            label="Opacity"
            value={Math.round(properties.opacity * 100)}
            onChange={(e) => updateProperty('opacity', parseFloat(e.target.value) / 100)}
            min={0}
            max={100}
            className="text-sm"
          />
          
          {selectedObject.type !== 'line' && (
            <div>
              <label className="text-sm text-gray-600 mb-2 block">Fill Color</label>
              <ColorPicker
                value={properties.fill}
                onChange={(color) => updateProperty('fill', color)}
              />
            </div>
          )}
          
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Stroke Color</label>
            <ColorPicker
              value={properties.stroke}
              onChange={(color) => updateProperty('stroke', color)}
            />
          </div>
          
          <Slider
            label="Stroke Width"
            value={properties.strokeWidth}
            onChange={(e) => updateProperty('strokeWidth', parseInt(e.target.value))}
            min={0}
            max={20}
            className="text-sm"
          />
        </div>
      </div>

      {/* Text Properties */}
      {selectedObject.type === 'i-text' && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Text</h4>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Font Family</label>
              <Select
                value={(selectedObject as any).fontFamily || 'Arial'}
                onChange={(e) => updateProperty('fontFamily', e.target.value)}
                className="h-8 text-sm"
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
              </Select>
            </div>
            <Slider
              label="Font Size"
              value={(selectedObject as any).fontSize || 16}
              onChange={(e) => updateProperty('fontSize', parseInt(e.target.value))}
              min={8}
              max={72}
              className="text-sm"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Actions</h4>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleVisibility}
              className="flex-1"
            >
              {properties.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {properties.visible ? 'Hide' : 'Show'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLock}
              className="flex-1"
            >
              {properties.selectable ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {properties.selectable ? 'Lock' : 'Unlock'}
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={duplicateObject}
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={deleteObject}
              className="flex-1 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Layer Order */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Layer Order</h4>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={bringToFront}
            className="flex-1"
          >
            <Layers className="h-4 w-4 mr-1" />
            Front
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sendToBack}
            className="flex-1"
          >
            <Layers className="h-4 w-4 mr-1" />
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};
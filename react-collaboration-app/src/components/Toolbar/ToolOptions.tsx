import React from 'react';
import { Type, Palette, Settings } from 'lucide-react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Button } from '@/components/ui/Button';

export const ToolOptions: React.FC = () => {
  const { activeTool, toolOptions } = useCollaborationStore();

  const updateToolOption = (key: string, value: any) => {
    useCollaborationStore.setState(state => ({
      toolOptions: { ...state.toolOptions, [key]: value }
    }));
  };

  const renderTextOptions = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Font Family</label>
        <Select
          value={toolOptions.fontFamily}
          onChange={(e) => updateToolOption('fontFamily', e.target.value)}
        >
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Comic Sans MS">Comic Sans MS</option>
          <option value="Impact">Impact</option>
          <option value="Courier New">Courier New</option>
        </Select>
      </div>
      
      <div>
        <Slider
          label="Font Size"
          value={toolOptions.fontSize}
          onChange={(e) => updateToolOption('fontSize', parseInt(e.target.value))}
          min={8}
          max={72}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Text Color</label>
        <ColorPicker
          value={toolOptions.color}
          onChange={(color) => updateToolOption('color', color)}
        />
      </div>
    </div>
  );

  const renderShapeOptions = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Stroke Color</label>
        <ColorPicker
          value={toolOptions.strokeColor}
          onChange={(color) => updateToolOption('strokeColor', color)}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Fill Color</label>
        <ColorPicker
          value={toolOptions.fillColor}
          onChange={(color) => updateToolOption('fillColor', color)}
        />
      </div>
      
      <div>
        <Slider
          label="Stroke Width"
          value={toolOptions.strokeWidth}
          onChange={(e) => updateToolOption('strokeWidth', parseInt(e.target.value))}
          min={0}
          max={20}
        />
      </div>
    </div>
  );

  const renderPenOptions = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Brush Color</label>
        <ColorPicker
          value={toolOptions.color}
          onChange={(color) => updateToolOption('color', color)}
        />
      </div>
      
      <div>
        <Slider
          label="Brush Width"
          value={toolOptions.brushWidth}
          onChange={(e) => updateToolOption('brushWidth', parseInt(e.target.value))}
          min={1}
          max={50}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2">Brush Type</label>
        <Select
          value={toolOptions.brushType || 'circle'}
          onChange={(e) => updateToolOption('brushType', e.target.value)}
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
          <option value="pencil">Pencil</option>
          <option value="spray">Spray</option>
        </Select>
      </div>
    </div>
  );

  const renderEraserOptions = () => (
    <div className="space-y-4">
      <div>
        <Slider
          label="Eraser Size"
          value={toolOptions.eraserWidth || 10}
          onChange={(e) => updateToolOption('eraserWidth', parseInt(e.target.value))}
          min={1}
          max={50}
        />
      </div>
    </div>
  );

  const renderOptions = () => {
    switch (activeTool) {
      case 'text':
        return renderTextOptions();
      case 'rectangle':
      case 'circle':
      case 'line':
      case 'arrow':
        return renderShapeOptions();
      case 'pen':
        return renderPenOptions();
      case 'eraser':
        return renderEraserOptions();
      default:
        return (
          <div className="text-center text-gray-500 py-8">
            <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Select a tool to see options</p>
          </div>
        );
    }
  };

  return (
    <div className="w-64 bg-white border-l border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
        <Palette className="h-5 w-5 text-gray-600" />
        <h3 className="font-medium text-gray-900">Tool Options</h3>
      </div>
      
      {renderOptions()}
      
      {/* Quick Actions */}
      {activeTool !== 'select' && activeTool !== 'hand' && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h4>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                // Reset tool options to defaults
                const defaults = {
                  color: '#000000',
                  strokeColor: '#000000',
                  fillColor: 'transparent',
                  strokeWidth: 2,
                  fontSize: 16,
                  fontFamily: 'Arial',
                  brushWidth: 5,
                };
                useCollaborationStore.setState(state => ({
                  toolOptions: { ...state.toolOptions, ...defaults }
                }));
              }}
            >
              Reset to Default
            </Button>
            
            {(activeTool === 'rectangle' || activeTool === 'circle') && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  updateToolOption('fillColor', toolOptions.strokeColor);
                }}
              >
                Fill with Stroke Color
              </Button>
            )}
            
            {activeTool === 'text' && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  updateToolOption('fontSize', toolOptions.fontSize + 2);
                }}
              >
                Increase Font Size
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
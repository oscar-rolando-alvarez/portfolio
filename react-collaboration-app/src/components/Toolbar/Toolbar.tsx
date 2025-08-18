import React from 'react';
import { 
  MousePointer, 
  Square, 
  Circle, 
  Minus, 
  Type, 
  Pen, 
  Eraser, 
  Hand,
  ArrowRight,
  Undo,
  Redo,
  Download,
  Upload,
  Users,
  MessageCircle,
  Video,
  Mic,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Slider } from '@/components/ui/Slider';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { ToolType } from '@/types';
import { cn } from '@/lib/utils';

const drawingTools = [
  { type: 'select' as ToolType, icon: MousePointer, label: 'Select', shortcut: 'V' },
  { type: 'rectangle' as ToolType, icon: Square, label: 'Rectangle', shortcut: 'R' },
  { type: 'circle' as ToolType, icon: Circle, label: 'Circle', shortcut: 'O' },
  { type: 'line' as ToolType, icon: Minus, label: 'Line', shortcut: 'L' },
  { type: 'arrow' as ToolType, icon: ArrowRight, label: 'Arrow', shortcut: 'A' },
  { type: 'text' as ToolType, icon: Type, label: 'Text', shortcut: 'T' },
  { type: 'pen' as ToolType, icon: Pen, label: 'Pen', shortcut: 'P' },
  { type: 'eraser' as ToolType, icon: Eraser, label: 'Eraser', shortcut: 'E' },
  { type: 'hand' as ToolType, icon: Hand, label: 'Hand', shortcut: 'H' },
];

export const Toolbar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    toolOptions,
    canUndo,
    canRedo,
    undo,
    redo,
    users,
    mediaState,
  } = useCollaborationStore();

  const handleToolSelect = (tool: ToolType) => {
    setActiveTool(tool);
  };

  const handleStrokeColorChange = (color: string) => {
    useCollaborationStore.setState(state => ({
      toolOptions: { ...state.toolOptions, strokeColor: color }
    }));
  };

  const handleFillColorChange = (color: string) => {
    useCollaborationStore.setState(state => ({
      toolOptions: { ...state.toolOptions, fillColor: color }
    }));
  };

  const handleStrokeWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const strokeWidth = parseInt(event.target.value);
    useCollaborationStore.setState(state => ({
      toolOptions: { ...state.toolOptions, strokeWidth }
    }));
  };

  const handleBrushWidthChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const brushWidth = parseInt(event.target.value);
    useCollaborationStore.setState(state => ({
      toolOptions: { ...state.toolOptions, brushWidth }
    }));
  };

  return (
    <div className="toolbar flex items-center gap-4 p-4 bg-white border-b border-gray-200">
      {/* Drawing Tools */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        {drawingTools.map((tool) => {
          const IconComponent = tool.icon;
          return (
            <Tooltip key={tool.type} content={`${tool.label} (${tool.shortcut})`}>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "toolbar-button",
                  activeTool === tool.type && "active bg-primary text-primary-foreground"
                )}
                onClick={() => handleToolSelect(tool.type)}
              >
                <IconComponent className="h-4 w-4" />
              </Button>
            </Tooltip>
          );
        })}
      </div>

      {/* Color Controls */}
      <div className="flex items-center gap-3 border-r border-gray-200 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Stroke:</span>
          <ColorPicker
            value={toolOptions.strokeColor}
            onChange={handleStrokeColorChange}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Fill:</span>
          <ColorPicker
            value={toolOptions.fillColor}
            onChange={handleFillColorChange}
          />
        </div>
      </div>

      {/* Stroke Width */}
      <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
        <Slider
          label="Stroke"
          value={toolOptions.strokeWidth}
          onChange={handleStrokeWidthChange}
          min={1}
          max={20}
          className="w-20"
        />
      </div>

      {/* Brush Width (for pen tool) */}
      {activeTool === 'pen' && (
        <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
          <Slider
            label="Brush"
            value={toolOptions.brushWidth}
            onChange={handleBrushWidthChange}
            min={1}
            max={50}
            className="w-20"
          />
        </div>
      )}

      {/* History Controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        <Tooltip content="Undo (Ctrl+Z)">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!canUndo}
            className="toolbar-button"
          >
            <Undo className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Redo (Ctrl+Y)">
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={!canRedo}
            className="toolbar-button"
          >
            <Redo className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* File Operations */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        <Tooltip content="Import">
          <Button variant="ghost" size="icon" className="toolbar-button">
            <Upload className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content="Export">
          <Button variant="ghost" size="icon" className="toolbar-button">
            <Download className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* Collaboration Controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 pr-4">
        <Tooltip content="Comments">
          <Button variant="ghost" size="icon" className="toolbar-button">
            <MessageCircle className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content={mediaState.audio ? "Mute microphone" : "Unmute microphone"}>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "toolbar-button",
              mediaState.audio && "active bg-green-500 text-white"
            )}
          >
            <Mic className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip content={mediaState.video ? "Turn off camera" : "Turn on camera"}>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "toolbar-button",
              mediaState.video && "active bg-green-500 text-white"
            )}
          >
            <Video className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* User Presence */}
      <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
        <Users className="h-4 w-4 text-gray-600" />
        <span className="text-sm text-gray-600">{users.length}</span>
      </div>

      {/* Settings */}
      <div className="flex items-center gap-1">
        <Tooltip content="Settings">
          <Button variant="ghost" size="icon" className="toolbar-button">
            <Settings className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
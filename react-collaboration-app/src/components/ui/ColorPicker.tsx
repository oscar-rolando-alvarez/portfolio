import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  disabled?: boolean;
}

const predefinedColors = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff',
  '#0080ff', '#80ff00', '#ff0080', '#80ff80', '#ff8080',
  '#8080ff', '#808080', '#c0c0c0', '#800000', '#008000',
];

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  className,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorSelect = (color: string) => {
    onChange(color);
    setCustomColor(color);
    setIsOpen(false);
  };

  const handleCustomColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const color = event.target.value;
    setCustomColor(color);
    onChange(color);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-400 transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ backgroundColor: value }}
        aria-label="Choose color"
      />
      
      {isOpen && (
        <div className="absolute top-10 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
          {/* Predefined colors */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            {predefinedColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorSelect(color)}
                className={cn(
                  "w-8 h-8 rounded border-2 transition-all hover:scale-110",
                  value === color ? "border-blue-500" : "border-gray-300"
                )}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
          
          {/* Custom color input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Custom color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColorChange}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    onChange(e.target.value);
                  }
                }}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
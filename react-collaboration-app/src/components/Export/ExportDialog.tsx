import React, { useState } from 'react';
import { Download, Upload, Copy, Settings, FileImage, FileType, FilePlus, Archive } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Input } from '@/components/ui/Input';
import { useExport } from '@/hooks/useExport';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { ExportFormat, ExportOptions } from '@/types';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(1);
  const [scale, setScale] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [includeBackground, setIncludeBackground] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<string | null>(null);

  const { selectedObjects } = useCollaborationStore();
  const { exportCanvas, copyToClipboard } = useExport();

  const formatOptions = [
    { value: 'png', label: 'PNG - Raster Image', icon: FileImage },
    { value: 'svg', label: 'SVG - Vector Image', icon: FileType },
    { value: 'pdf', label: 'PDF - Document', icon: FilePlus },
    { value: 'json', label: 'JSON - Canvas Data', icon: Archive },
  ];

  const qualityOptions = [
    { value: 0.5, label: 'Low (50%)' },
    { value: 0.8, label: 'Medium (80%)' },
    { value: 1, label: 'High (100%)' },
  ];

  const scaleOptions = [
    { value: 0.5, label: '0.5x' },
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
    { value: 3, label: '3x' },
    { value: 4, label: '4x' },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    const options: ExportOptions = {
      format,
      quality: format === 'png' || format === 'pdf' ? quality : undefined,
      scale,
      selectedOnly,
      includeBackground,
    };

    try {
      const result = await exportCanvas(options);
      
      if (result.success) {
        setExportResult(`✅ Exported successfully as ${result.filename}`);
      } else {
        setExportResult(`❌ Export failed: ${result.error}`);
      }
    } catch (error) {
      setExportResult(`❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    setIsExporting(true);
    
    try {
      const result = await copyToClipboard(selectedOnly);
      
      if (result.success) {
        setExportResult('✅ Copied to clipboard');
      } else {
        setExportResult(`❌ Copy failed: ${result.error}`);
      }
    } catch (error) {
      setExportResult(`❌ Copy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const getEstimatedFileSize = () => {
    if (!format) return '';
    
    const baseSize = scale * scale; // Rough estimation based on scale
    
    switch (format) {
      case 'png':
        return `~${Math.round(baseSize * 100)}KB`;
      case 'svg':
        return '~10-50KB';
      case 'pdf':
        return `~${Math.round(baseSize * 150)}KB`;
      case 'json':
        return '~5-20KB';
      default:
        return '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Canvas"
      size="md"
    >
      <div className="space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium mb-3">Export Format</label>
          <div className="grid grid-cols-1 gap-2">
            {formatOptions.map(option => {
              const IconComponent = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => setFormat(option.value as ExportFormat)}
                  className={`
                    flex items-center gap-3 p-3 border rounded-lg text-left transition-colors
                    ${format === option.value 
                      ? 'border-blue-500 bg-blue-50 text-blue-900' 
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <IconComponent className="h-5 w-5" />
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Settings (PNG/PDF only) */}
        {(format === 'png' || format === 'pdf') && (
          <div>
            <label className="block text-sm font-medium mb-2">Quality</label>
            <Select
              value={quality.toString()}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
            >
              {qualityOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Scale Settings */}
        <div>
          <label className="block text-sm font-medium mb-2">Scale</label>
          <Select
            value={scale.toString()}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          >
            {scaleOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Higher scale produces larger, higher quality images
          </p>
        </div>

        {/* Export Options */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Options</h4>
          
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedOnly}
              onChange={(e) => setSelectedOnly(e.target.checked)}
              disabled={selectedObjects.length === 0}
              className="rounded border-gray-300"
            />
            <span className="text-sm">
              Export selected objects only
              {selectedObjects.length === 0 && (
                <span className="text-gray-400"> (no objects selected)</span>
              )}
            </span>
          </label>

          {format !== 'json' && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeBackground}
                onChange={(e) => setIncludeBackground(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Include background</span>
            </label>
          )}
        </div>

        {/* File Size Estimate */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Estimated file size:</span>
            <span className="font-medium">{getEstimatedFileSize()}</span>
          </div>
        </div>

        {/* Export Result */}
        {exportResult && (
          <div className={`p-3 rounded-lg text-sm ${
            exportResult.startsWith('✅') 
              ? 'bg-green-50 text-green-800' 
              : 'bg-red-50 text-red-800'
          }`}>
            {exportResult}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
          
          {format === 'png' && (
            <Button
              variant="outline"
              onClick={handleCopyToClipboard}
              disabled={isExporting}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

// Import dialog component
interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ isOpen, onClose }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const { importFromJSON } = useExport();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const result = await importFromJSON(text);
      
      if (result.success) {
        setImportResult(`✅ ${result.message}`);
        setTimeout(() => onClose(), 2000); // Auto-close after success
      } else {
        setImportResult(`❌ Import failed: ${result.error}`);
      }
    } catch (error) {
      setImportResult(`❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Canvas"
      size="sm"
    >
      <div className="space-y-4">
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <Upload className="h-8 w-8 mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-600 mb-3">
            Upload a JSON file to import canvas data
          </p>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            disabled={isImporting}
            className="hidden"
            id="import-file"
          />
          <Button
            variant="outline"
            onClick={() => document.getElementById('import-file')?.click()}
            disabled={isImporting}
          >
            {isImporting ? 'Importing...' : 'Choose File'}
          </Button>
        </div>

        {importResult && (
          <div className={`p-3 rounded-lg text-sm ${
            importResult.startsWith('✅') 
              ? 'bg-green-50 text-green-800' 
              : 'bg-red-50 text-red-800'
          }`}>
            {importResult}
          </div>
        )}

        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> Importing will add objects to the current canvas. 
            Only JSON files exported from this application are supported.
          </p>
        </div>
      </div>
    </Modal>
  );
};
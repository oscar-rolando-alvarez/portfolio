import { useCallback } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { ExportFormat, ExportOptions } from '@/types';
import { downloadFile } from '@/lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const useExport = () => {
  const { canvas, selectedObjects } = useCollaborationStore();

  // Export canvas as PNG
  const exportAsPNG = useCallback(async (options: ExportOptions = { format: 'png' }) => {
    if (!canvas) return;

    try {
      let dataURL: string;

      if (options.selectedOnly && selectedObjects.length > 0) {
        // Export only selected objects
        const group = canvas.getActiveObject();
        if (group) {
          dataURL = group.toDataURL({
            format: 'png',
            quality: options.quality || 1,
            multiplier: options.scale || 1,
          });
        } else {
          throw new Error('No selection found');
        }
      } else {
        // Export entire canvas
        dataURL = canvas.toDataURL({
          format: 'png',
          quality: options.quality || 1,
          multiplier: options.scale || 1,
          withoutTransform: false,
        });
      }

      // Convert data URL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      // Download file
      const filename = `canvas-export-${Date.now()}.png`;
      downloadFile(blob, filename);
      
      return { success: true, filename };
    } catch (error) {
      console.error('PNG export failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
  }, [canvas, selectedObjects]);

  // Export canvas as SVG
  const exportAsSVG = useCallback(async (options: ExportOptions = { format: 'svg' }) => {
    if (!canvas) return;

    try {
      let svgString: string;

      if (options.selectedOnly && selectedObjects.length > 0) {
        // Export only selected objects
        const group = canvas.getActiveObject();
        if (group) {
          svgString = group.toSVG();
        } else {
          throw new Error('No selection found');
        }
      } else {
        // Export entire canvas
        svgString = canvas.toSVG({
          suppressPreamble: false,
          viewBox: {
            x: 0,
            y: 0,
            width: canvas.getWidth(),
            height: canvas.getHeight(),
          },
        });
      }

      // Create blob from SVG string
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      
      // Download file
      const filename = `canvas-export-${Date.now()}.svg`;
      downloadFile(blob, filename);
      
      return { success: true, filename };
    } catch (error) {
      console.error('SVG export failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
  }, [canvas, selectedObjects]);

  // Export canvas as PDF
  const exportAsPDF = useCallback(async (options: ExportOptions = { format: 'pdf' }) => {
    if (!canvas) return;

    try {
      // Get canvas as image data
      let dataURL: string;
      let width: number;
      let height: number;

      if (options.selectedOnly && selectedObjects.length > 0) {
        // Export only selected objects
        const group = canvas.getActiveObject();
        if (group) {
          dataURL = group.toDataURL({
            format: 'png',
            quality: options.quality || 1,
            multiplier: options.scale || 2, // Higher resolution for PDF
          });
          
          const bounds = group.getBoundingRect();
          width = bounds.width;
          height = bounds.height;
        } else {
          throw new Error('No selection found');
        }
      } else {
        // Export entire canvas
        dataURL = canvas.toDataURL({
          format: 'png',
          quality: options.quality || 1,
          multiplier: options.scale || 2, // Higher resolution for PDF
        });
        
        width = canvas.getWidth();
        height = canvas.getHeight();
      }

      // Create PDF
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height],
      });

      // Add image to PDF
      pdf.addImage(dataURL, 'PNG', 0, 0, width, height);
      
      // Save PDF
      const filename = `canvas-export-${Date.now()}.pdf`;
      pdf.save(filename);
      
      return { success: true, filename };
    } catch (error) {
      console.error('PDF export failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
  }, [canvas, selectedObjects]);

  // Export canvas data as JSON
  const exportAsJSON = useCallback(async (options: ExportOptions = { format: 'json' }) => {
    if (!canvas) return;

    try {
      let data: any;

      if (options.selectedOnly && selectedObjects.length > 0) {
        // Export only selected objects
        const group = canvas.getActiveObject();
        if (group) {
          if (group.type === 'activeSelection') {
            // Multiple objects selected
            data = {
              version: '1.0',
              objects: (group as any)._objects.map((obj: any) => 
                obj.toObject(['id', 'userId', 'version', 'lastModified'])
              ),
            };
          } else {
            // Single object selected
            data = {
              version: '1.0',
              objects: [group.toObject(['id', 'userId', 'version', 'lastModified'])],
            };
          }
        } else {
          throw new Error('No selection found');
        }
      } else {
        // Export entire canvas
        data = {
          version: '1.0',
          canvas: {
            width: canvas.getWidth(),
            height: canvas.getHeight(),
            backgroundColor: canvas.backgroundColor,
          },
          objects: canvas.getObjects().map(obj => 
            obj.toObject(['id', 'userId', 'version', 'lastModified'])
          ),
        };
      }

      // Create blob from JSON
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Download file
      const filename = `canvas-export-${Date.now()}.json`;
      downloadFile(blob, filename);
      
      return { success: true, filename, data };
    } catch (error) {
      console.error('JSON export failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
  }, [canvas, selectedObjects]);

  // Main export function
  const exportCanvas = useCallback(async (options: ExportOptions) => {
    switch (options.format) {
      case 'png':
        return await exportAsPNG(options);
      case 'svg':
        return await exportAsSVG(options);
      case 'pdf':
        return await exportAsPDF(options);
      case 'json':
        return await exportAsJSON(options);
      default:
        return { success: false, error: `Unsupported format: ${options.format}` };
    }
  }, [exportAsPNG, exportAsSVG, exportAsPDF, exportAsJSON]);

  // Import from JSON
  const importFromJSON = useCallback(async (jsonData: string | object) => {
    if (!canvas) return { success: false, error: 'No canvas available' };

    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      if (!data.objects || !Array.isArray(data.objects)) {
        throw new Error('Invalid JSON format: missing objects array');
      }

      // Clear canvas if importing full canvas data
      if (data.canvas) {
        canvas.clear();
        
        // Set canvas properties
        if (data.canvas.width) canvas.setWidth(data.canvas.width);
        if (data.canvas.height) canvas.setHeight(data.canvas.height);
        if (data.canvas.backgroundColor) canvas.setBackgroundColor(data.canvas.backgroundColor, () => {});
      }

      // Import objects
      const importedObjects = await new Promise<fabric.Object[]>((resolve, reject) => {
        fabric.util.enlivenObjects(data.objects, (objects: fabric.Object[]) => {
          resolve(objects);
        }, '');
      });

      // Add objects to canvas
      importedObjects.forEach(obj => {
        // Assign new IDs to prevent conflicts
        obj.set({
          id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
        canvas.add(obj);
      });

      canvas.renderAll();
      
      return { 
        success: true, 
        message: `Imported ${importedObjects.length} objects`,
        objectCount: importedObjects.length 
      };
    } catch (error) {
      console.error('Import failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Import failed' 
      };
    }
  }, [canvas]);

  // Export with high-quality settings
  const exportHighQuality = useCallback(async (format: ExportFormat) => {
    return await exportCanvas({
      format,
      quality: 1,
      scale: 2,
      includeBackground: true,
      selectedOnly: false,
    });
  }, [exportCanvas]);

  // Export selection only
  const exportSelection = useCallback(async (format: ExportFormat) => {
    if (selectedObjects.length === 0) {
      return { success: false, error: 'No objects selected' };
    }

    return await exportCanvas({
      format,
      quality: 1,
      scale: 1,
      includeBackground: false,
      selectedOnly: true,
    });
  }, [exportCanvas, selectedObjects]);

  // Copy to clipboard (PNG only)
  const copyToClipboard = useCallback(async (selectedOnly: boolean = false) => {
    if (!canvas) return { success: false, error: 'No canvas available' };

    try {
      let dataURL: string;

      if (selectedOnly && selectedObjects.length > 0) {
        const group = canvas.getActiveObject();
        if (group) {
          dataURL = group.toDataURL({ format: 'png', quality: 1 });
        } else {
          throw new Error('No selection found');
        }
      } else {
        dataURL = canvas.toDataURL({ format: 'png', quality: 1 });
      }

      // Convert to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();

      // Copy to clipboard using Clipboard API
      if (navigator.clipboard && ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        
        return { success: true, message: 'Copied to clipboard' };
      } else {
        throw new Error('Clipboard API not supported');
      }
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Copy failed' 
      };
    }
  }, [canvas, selectedObjects]);

  return {
    exportCanvas,
    exportAsPNG,
    exportAsSVG,
    exportAsPDF,
    exportAsJSON,
    importFromJSON,
    exportHighQuality,
    exportSelection,
    copyToClipboard,
  };
};
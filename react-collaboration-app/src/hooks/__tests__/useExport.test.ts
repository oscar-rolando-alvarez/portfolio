import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExport } from '../useExport';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { mockCanvas, mockFabricObject } from '@/test/utils';

// Mock the store
vi.mock('@/stores/collaborationStore');

// Mock download utility
vi.mock('@/lib/utils', () => ({
  downloadFile: vi.fn(),
}));

const mockStore = {
  canvas: mockCanvas,
  selectedObjects: [],
};

describe('useExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCollaborationStore as any).mockReturnValue(mockStore);
  });

  describe('exportAsPNG', () => {
    it('should export canvas as PNG', async () => {
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportAsPNG();
      
      expect(exportResult.success).toBe(true);
      expect(exportResult.filename).toMatch(/canvas-export-\d+\.png/);
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith({
        format: 'png',
        quality: 1,
        multiplier: 1,
        withoutTransform: false,
      });
    });

    it('should export with custom quality and scale', async () => {
      const { result } = renderHook(() => useExport());
      
      await result.current.exportAsPNG({
        format: 'png',
        quality: 0.8,
        scale: 2,
      });
      
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith({
        format: 'png',
        quality: 0.8,
        multiplier: 2,
        withoutTransform: false,
      });
    });

    it('should export selected objects only', async () => {
      const storeWithSelection = {
        ...mockStore,
        selectedObjects: ['obj1'],
      };
      (useCollaborationStore as any).mockReturnValue(storeWithSelection);
      
      mockCanvas.getActiveObject.mockReturnValue(mockFabricObject);
      
      const { result } = renderHook(() => useExport());
      
      await result.current.exportAsPNG({
        format: 'png',
        selectedOnly: true,
      });
      
      expect(mockFabricObject.toDataURL).toHaveBeenCalledWith({
        format: 'png',
        quality: 1,
        multiplier: 1,
      });
    });
  });

  describe('exportAsSVG', () => {
    it('should export canvas as SVG', async () => {
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportAsSVG();
      
      expect(exportResult.success).toBe(true);
      expect(exportResult.filename).toMatch(/canvas-export-\d+\.svg/);
      expect(mockCanvas.toSVG).toHaveBeenCalledWith({
        suppressPreamble: false,
        viewBox: {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
        },
      });
    });

    it('should export selected object as SVG', async () => {
      const storeWithSelection = {
        ...mockStore,
        selectedObjects: ['obj1'],
      };
      (useCollaborationStore as any).mockReturnValue(storeWithSelection);
      
      const mockObject = {
        ...mockFabricObject,
        toSVG: vi.fn(() => '<svg>test</svg>'),
      };
      mockCanvas.getActiveObject.mockReturnValue(mockObject);
      
      const { result } = renderHook(() => useExport());
      
      await result.current.exportAsSVG({
        format: 'svg',
        selectedOnly: true,
      });
      
      expect(mockObject.toSVG).toHaveBeenCalled();
    });
  });

  describe('exportAsJSON', () => {
    it('should export canvas as JSON', async () => {
      mockCanvas.getObjects.mockReturnValue([mockFabricObject]);
      
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportAsJSON();
      
      expect(exportResult.success).toBe(true);
      expect(exportResult.filename).toMatch(/canvas-export-\d+\.json/);
      expect(exportResult.data).toHaveProperty('version', '1.0');
      expect(exportResult.data).toHaveProperty('canvas');
      expect(exportResult.data).toHaveProperty('objects');
    });

    it('should export selected objects as JSON', async () => {
      const storeWithSelection = {
        ...mockStore,
        selectedObjects: ['obj1'],
      };
      (useCollaborationStore as any).mockReturnValue(storeWithSelection);
      
      mockCanvas.getActiveObject.mockReturnValue(mockFabricObject);
      
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportAsJSON({
        format: 'json',
        selectedOnly: true,
      });
      
      expect(exportResult.success).toBe(true);
      expect(exportResult.data.objects).toHaveLength(1);
    });
  });

  describe('importFromJSON', () => {
    it('should import objects from JSON', async () => {
      const jsonData = {
        version: '1.0',
        objects: [
          {
            type: 'rect',
            left: 100,
            top: 100,
            width: 100,
            height: 100,
          },
        ],
      };
      
      const { result } = renderHook(() => useExport());
      
      const importResult = await result.current.importFromJSON(jsonData);
      
      expect(importResult.success).toBe(true);
      expect(importResult.objectCount).toBe(1);
      expect(mockCanvas.add).toHaveBeenCalled();
    });

    it('should handle invalid JSON', async () => {
      const { result } = renderHook(() => useExport());
      
      const importResult = await result.current.importFromJSON('invalid json');
      
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('Unexpected token');
    });

    it('should handle missing objects array', async () => {
      const { result } = renderHook(() => useExport());
      
      const importResult = await result.current.importFromJSON({ version: '1.0' });
      
      expect(importResult.success).toBe(false);
      expect(importResult.error).toContain('missing objects array');
    });
  });

  describe('copyToClipboard', () => {
    it('should copy canvas to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          write: vi.fn(() => Promise.resolve()),
        },
      });
      
      global.ClipboardItem = vi.fn();
      
      const { result } = renderHook(() => useExport());
      
      const copyResult = await result.current.copyToClipboard();
      
      expect(copyResult.success).toBe(true);
      expect(copyResult.message).toBe('Copied to clipboard');
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith({
        format: 'png',
        quality: 1,
      });
    });

    it('should handle clipboard API not supported', async () => {
      // Mock clipboard API as undefined
      Object.assign(navigator, {
        clipboard: undefined,
      });
      
      const { result } = renderHook(() => useExport());
      
      const copyResult = await result.current.copyToClipboard();
      
      expect(copyResult.success).toBe(false);
      expect(copyResult.error).toContain('Clipboard API not supported');
    });
  });

  describe('exportSelection', () => {
    it('should return error when no objects selected', async () => {
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportSelection('png');
      
      expect(exportResult.success).toBe(false);
      expect(exportResult.error).toBe('No objects selected');
    });

    it('should export selection when objects are selected', async () => {
      const storeWithSelection = {
        ...mockStore,
        selectedObjects: ['obj1'],
      };
      (useCollaborationStore as any).mockReturnValue(storeWithSelection);
      
      mockCanvas.getActiveObject.mockReturnValue(mockFabricObject);
      
      const { result } = renderHook(() => useExport());
      
      const exportResult = await result.current.exportSelection('png');
      
      expect(exportResult.success).toBe(true);
    });
  });

  describe('exportHighQuality', () => {
    it('should export with high quality settings', async () => {
      const { result } = renderHook(() => useExport());
      
      await result.current.exportHighQuality('png');
      
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith({
        format: 'png',
        quality: 1,
        multiplier: 2,
        withoutTransform: false,
      });
    });
  });
});
import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { vi } from 'vitest';

// Mock implementation of DndProvider for tests
const TestDndProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <DndProvider backend={HTML5Backend}>
      {children}
    </DndProvider>
  );
};

// Custom render function that includes providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
      <TestDndProvider>
        {children}
      </TestDndProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...options });
};

// Create mock user for tests
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-1',
  name: 'Test User',
  color: '#3b82f6',
  isOnline: true,
  cursor: { x: 100, y: 100 },
  ...overrides,
});

// Create mock canvas object
export const createMockCanvasObject = (overrides = {}) => ({
  id: 'test-object-1',
  type: 'rect',
  data: {
    type: 'rect',
    left: 100,
    top: 100,
    width: 100,
    height: 100,
    fill: '#3b82f6',
    stroke: '#1e40af',
    strokeWidth: 2,
  },
  userId: 'test-user-1',
  timestamp: Date.now(),
  version: 1,
  ...overrides,
});

// Create mock operation
export const createMockOperation = (overrides = {}) => ({
  id: 'test-op-1',
  type: 'add' as const,
  objectId: 'test-object-1',
  data: createMockCanvasObject().data,
  userId: 'test-user-1',
  timestamp: Date.now(),
  version: 1,
  ...overrides,
});

// Create mock layer
export const createMockLayer = (overrides = {}) => ({
  id: 'test-layer-1',
  name: 'Test Layer',
  visible: true,
  locked: false,
  objects: ['test-object-1'],
  order: 0,
  ...overrides,
});

// Create mock comment
export const createMockComment = (overrides = {}) => ({
  id: 'test-comment-1',
  x: 200,
  y: 200,
  text: 'Test comment',
  userId: 'test-user-1',
  timestamp: Date.now(),
  resolved: false,
  replies: [],
  ...overrides,
});

// Mock canvas methods
export const mockCanvas = {
  add: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  renderAll: vi.fn(),
  getObjects: vi.fn((): unknown[] => []),
  setActiveObject: vi.fn(),
  getActiveObject: vi.fn((): unknown => undefined),
  discardActiveObject: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  fire: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,test'),
  toSVG: vi.fn(() => '<svg></svg>'),
  getWidth: vi.fn(() => 800),
  getHeight: vi.fn(() => 600),
  setDimensions: vi.fn(),
  setZoom: vi.fn(),
  getZoom: vi.fn(() => 1),
  viewportTransform: [1, 0, 0, 1, 0, 0],
  setViewportTransform: vi.fn(),
  getScenePoint: vi.fn(() => ({ x: 0, y: 0 })),
  getViewportPoint: vi.fn(() => ({ x: 0, y: 0 })),
  getElement: vi.fn(() => ({
    getBoundingClientRect: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })),
  })),
  bringObjectToFront: vi.fn(),
  sendObjectToBack: vi.fn(),
  bringObjectForward: vi.fn(),
  sendObjectBackwards: vi.fn(),
};

// Mock fabric object
export const mockFabricObject = {
  set: vi.fn(),
  get: vi.fn(),
  toObject: vi.fn(() => ({})),
  toDataURL: vi.fn(() => 'data:image/png;base64,test'),
  setCoords: vi.fn(),
  clone: vi.fn(async (): Promise<unknown> => mockFabricObject),
  getBoundingRect: vi.fn(() => ({
    left: 100,
    top: 100,
    width: 100,
    height: 100,
  })),
  left: 100,
  top: 100,
  width: 100,
  height: 100,
  id: 'test-object-1',
  type: 'rect',
};

// Utility to wait for next tick
export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0));

// Utility to simulate drag and drop
export const simulateDragDrop = async (
  source: HTMLElement,
  target: HTMLElement,
  dataTransferData: Record<string, string> = {}
) => {
  const dragStartEvent = new Event('dragstart', { bubbles: true });
  Object.defineProperty(dragStartEvent, 'dataTransfer', {
    value: {
      setData: vi.fn(),
      getData: vi.fn((type: string) => dataTransferData[type] || ''),
      effectAllowed: 'all',
      dropEffect: 'move',
    },
  });

  const dragOverEvent = new Event('dragover', { bubbles: true });
  Object.defineProperty(dragOverEvent, 'dataTransfer', {
    value: {
      getData: vi.fn((type: string) => dataTransferData[type] || ''),
      effectAllowed: 'all',
      dropEffect: 'move',
    },
  });

  const dropEvent = new Event('drop', { bubbles: true });
  Object.defineProperty(dropEvent, 'dataTransfer', {
    value: {
      getData: vi.fn((type: string) => dataTransferData[type] || ''),
      effectAllowed: 'all',
      dropEffect: 'move',
    },
  });

  source.dispatchEvent(dragStartEvent);
  target.dispatchEvent(dragOverEvent);
  target.dispatchEvent(dropEvent);

  await waitForNextTick();
};

// Export everything
export * from '@testing-library/react';
export { customRender as render };
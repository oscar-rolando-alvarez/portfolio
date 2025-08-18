import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fabric.js
vi.mock('fabric', () => ({
  fabric: {
    Canvas: vi.fn(() => ({
      add: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      renderAll: vi.fn(),
      getObjects: vi.fn(() => []),
      setActiveObject: vi.fn(),
      getActiveObject: vi.fn(),
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
      getPointer: vi.fn(() => ({ x: 0, y: 0 })),
      getElement: vi.fn(() => ({
        getBoundingClientRect: vi.fn(() => ({
          left: 0,
          top: 0,
          width: 800,
          height: 600,
        })),
      })),
      bringToFront: vi.fn(),
      sendToBack: vi.fn(),
      bringForward: vi.fn(),
      sendBackwards: vi.fn(),
    })),
    Rect: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
    })),
    Circle: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
    })),
    Line: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
    })),
    IText: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
      enterEditing: vi.fn(),
      selectAll: vi.fn(),
    })),
    Path: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
    })),
    Polygon: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
    })),
    ActiveSelection: vi.fn(() => ({
      set: vi.fn(),
      toObject: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      setCoords: vi.fn(),
      _objects: [],
    })),
    Point: vi.fn((x, y) => ({ x, y })),
    util: {
      enlivenObjects: vi.fn((objects, callback) => {
        callback(objects.map(() => ({
          set: vi.fn(),
          toObject: vi.fn(() => ({})),
        })));
      }),
      transformPoint: vi.fn((point) => point),
      invertTransform: vi.fn((transform) => transform),
    },
  },
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    id: 'test-socket-id',
  })),
}));

// Mock simple-peer
vi.mock('simple-peer', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    signal: vi.fn(),
    send: vi.fn(),
    destroy: vi.fn(),
    connected: true,
  })),
}));

// Mock HTML2Canvas
vi.mock('html2canvas', () => ({
  default: vi.fn(() => Promise.resolve({
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
  })),
}));

// Mock jsPDF
vi.mock('jspdf', () => ({
  default: vi.fn(() => ({
    addImage: vi.fn(),
    save: vi.fn(),
  })),
}));

// Mock navigator APIs
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    write: vi.fn(() => Promise.resolve()),
  },
});

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: vi.fn(() => []),
      getAudioTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => []),
    })),
    getDisplayMedia: vi.fn(() => Promise.resolve({
      getTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => [{
        onended: null,
      }]),
    })),
  },
});

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn(() => Promise.resolve()),
    controller: {
      postMessage: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
});

// Mock IndexedDB
const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  result: null,
};

const mockIDBObjectStore = {
  put: vi.fn(() => mockIDBRequest),
  get: vi.fn(() => mockIDBRequest),
  getAll: vi.fn(() => mockIDBRequest),
  delete: vi.fn(() => mockIDBRequest),
  createIndex: vi.fn(),
};

const mockIDBTransaction = {
  objectStore: vi.fn(() => mockIDBObjectStore),
};

const mockIDB = {
  transaction: vi.fn(() => mockIDBTransaction),
  createObjectStore: vi.fn(() => mockIDBObjectStore),
  objectStoreNames: {
    contains: vi.fn(() => false),
  },
};

Object.defineProperty(window, 'indexedDB', {
  value: {
    open: vi.fn(() => ({
      ...mockIDBRequest,
      onupgradeneeded: null,
      result: mockIDB,
    })),
  },
});

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock intersection observer
global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};
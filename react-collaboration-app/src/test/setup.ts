import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Network and media libraries are replaced with inert fakes so unit tests
// never open sockets or peer connections.
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() },
    id: 'test-socket-id',
    connected: false,
  })),
}));

vi.mock('simple-peer', () => ({
  default: vi.fn(function SimplePeerMock() {
    return {
      on: vi.fn(),
      signal: vi.fn(),
      send: vi.fn(),
      destroy: vi.fn(),
      connected: true,
    };
  }),
}));

vi.mock('html2canvas', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    })
  ),
}));

vi.mock('jspdf', () => ({
  default: vi.fn(function JsPdfMock() {
    return {
      addImage: vi.fn(),
      save: vi.fn(),
      output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
    };
  }),
}));

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    write: vi.fn(() => Promise.resolve()),
  },
});

Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: vi.fn(() => []),
        getAudioTracks: vi.fn(() => []),
        getVideoTracks: vi.fn(() => []),
      })
    ),
    getDisplayMedia: vi.fn(() =>
      Promise.resolve({
        getTracks: vi.fn(() => []),
        getVideoTracks: vi.fn(() => [{ onended: null }]),
      })
    ),
  },
});

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;

import React, { useEffect } from 'react';
import { Toolbar } from '@/components/Toolbar/Toolbar';
import { CanvasContainer } from '@/components/Canvas/CanvasContainer';
import { PropertiesPanel } from '@/components/Panels/PropertiesPanel';
import { LayersPanel } from '@/components/Panels/LayersPanel';
import { UsersPanel } from '@/components/Panels/UsersPanel';
import { PresenceIndicators } from '@/components/Presence/PresenceIndicators';
import { UserPresence } from '@/components/Presence/UserPresence';
import { ActivityFeed } from '@/components/Presence/ActivityFeed';
import { ShortcutsHelp } from '@/components/Help/ShortcutsHelp';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSocket } from '@/hooks/useSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useOperationalTransform } from '@/hooks/useOperationalTransform';
import { loadStoreState } from '@/stores/collaborationStore';

function App() {
  // Initialize hooks
  useKeyboardShortcuts();
  const { connectionStatus } = useSocket();
  const { mediaState } = useWebRTC();
  const { processIncomingOperation } = useOperationalTransform();

  // Load persisted state on mount
  useEffect(() => {
    loadStoreState();
  }, []);

  // Handle incoming operations from other users
  useEffect(() => {
    const handleSocketOperation = (event: CustomEvent) => {
      const operation = event.detail;
      processIncomingOperation(operation);
    };

    window.addEventListener('socket-operation', handleSocketOperation as EventListener);
    return () => window.removeEventListener('socket-operation', handleSocketOperation as EventListener);
  }, [processIncomingOperation]);

  return (
    <UserPresence>
      <div className="h-screen flex flex-col bg-gray-100">
        {/* Connection Status */}
        {!connectionStatus.isConnected && (
          <div className="bg-yellow-100 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              Connecting to server...
            </div>
          </div>
        )}

        {/* Main Toolbar */}
        <Toolbar />

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Left Sidebar - Layers Panel */}
          <LayersPanel />

          {/* Canvas Area */}
          <div className="flex-1 relative">
            <CanvasContainer className="w-full h-full" />
            
            {/* Presence Indicators */}
            <PresenceIndicators />
          </div>

          {/* Right Sidebar - Properties Panel */}
          <PropertiesPanel />
        </div>

        {/* Users Panel - Floating */}
        <div className="fixed top-20 right-4 z-30">
          <UsersPanel />
        </div>

        {/* Activity Feed - Floating */}
        <ActivityFeed />

        {/* Help - Floating */}
        <ShortcutsHelp />

        {/* Status Bar */}
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              Status: {connectionStatus.isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {mediaState.audio && (
              <span className="flex items-center gap-1">
                🎤 Audio On
              </span>
            )}
            {mediaState.video && (
              <span className="flex items-center gap-1">
                📹 Video On
              </span>
            )}
            {mediaState.screen && (
              <span className="flex items-center gap-1">
                🖥️ Screen Sharing
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <span>Zoom: 100%</span>
            <span>Canvas: 1920 × 1080</span>
          </div>
        </div>
      </div>
    </UserPresence>
  );
}

export default App;
import React, { useState } from 'react';
import { HelpCircle, Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { keyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { KeyboardShortcut } from '@/types';

const shortcutCategories = {
  tools: 'Drawing Tools',
  edit: 'Edit Operations',
  selection: 'Selection & Manipulation',
  layers: 'Layer Operations',
  view: 'View Operations',
  file: 'File Operations',
  ui: 'UI Toggles',
  movement: 'Movement',
};

const categorizeShortcuts = (shortcuts: KeyboardShortcut[]) => {
  const categories: Record<string, KeyboardShortcut[]> = {
    tools: [],
    edit: [],
    selection: [],
    layers: [],
    view: [],
    file: [],
    ui: [],
    movement: [],
  };

  shortcuts.forEach(shortcut => {
    if (shortcut.action.includes('tool')) {
      categories.tools.push(shortcut);
    } else if (shortcut.action.includes('undo') || shortcut.action.includes('redo')) {
      categories.edit.push(shortcut);
    } else if (
      shortcut.action.includes('select') || 
      shortcut.action.includes('copy') || 
      shortcut.action.includes('paste') || 
      shortcut.action.includes('duplicate') ||
      shortcut.action.includes('delete')
    ) {
      categories.selection.push(shortcut);
    } else if (
      shortcut.action.includes('bring') || 
      shortcut.action.includes('send')
    ) {
      categories.layers.push(shortcut);
    } else if (shortcut.action.includes('zoom')) {
      categories.view.push(shortcut);
    } else if (
      shortcut.action.includes('save') || 
      shortcut.action.includes('open') || 
      shortcut.action.includes('new')
    ) {
      categories.file.push(shortcut);
    } else if (shortcut.action.includes('toggle') || shortcut.action === 'comment-mode') {
      categories.ui.push(shortcut);
    } else if (shortcut.action.includes('move')) {
      categories.movement.push(shortcut);
    }
  });

  return categories;
};

const formatKey = (key: string) => {
  return key
    .replace('ctrl', 'Ctrl')
    .replace('cmd', '⌘')
    .replace('shift', 'Shift')
    .replace('alt', 'Alt')
    .replace('+', ' + ')
    .replace('arrowup', '↑')
    .replace('arrowdown', '↓')
    .replace('arrowleft', '←')
    .replace('arrowright', '→')
    .replace('delete', 'Del')
    .replace('backspace', '⌫');
};

export const ShortcutsHelp: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const categorizedShortcuts = categorizeShortcuts(keyboardShortcuts);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-40 bg-white shadow-md border border-gray-200 hover:bg-gray-50"
        title="View keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Keyboard Shortcuts"
        size="lg"
      >
        <div className="max-h-96 overflow-y-auto">
          {Object.entries(categorizedShortcuts).map(([category, shortcuts]) => {
            if (shortcuts.length === 0) return null;
            
            return (
              <div key={category} className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  {shortcutCategories[category as keyof typeof shortcutCategories]}
                </h3>
                <div className="space-y-2">
                  {shortcuts.map((shortcut, index) => (
                    <div
                      key={`${shortcut.action}-${index}`}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded"
                    >
                      <span className="text-sm text-gray-700">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.key.includes(',') ? (
                          shortcut.key.split(', ').map((key, keyIndex) => (
                            <React.Fragment key={keyIndex}>
                              {keyIndex > 0 && (
                                <span className="text-xs text-gray-400 mx-1">or</span>
                              )}
                              <kbd className="px-2 py-1 text-xs font-mono bg-white border border-gray-300 rounded shadow-sm">
                                {formatKey(key)}
                              </kbd>
                            </React.Fragment>
                          ))
                        ) : (
                          <kbd className="px-2 py-1 text-xs font-mono bg-white border border-gray-300 rounded shadow-sm">
                            {formatKey(shortcut.key)}
                          </kbd>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Tips:</p>
              <ul className="space-y-1 text-xs">
                <li>• Press and hold Shift with arrow keys to move objects by 10px</li>
                <li>• Use Ctrl/Cmd + mouse wheel to zoom in and out</li>
                <li>• Double-click text objects to edit them directly</li>
                <li>• Hold Alt while drawing to draw from center</li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
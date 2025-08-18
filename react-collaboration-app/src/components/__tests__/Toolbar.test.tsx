import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils';
import { Toolbar } from '../Toolbar/Toolbar';
import { useCollaborationStore } from '@/stores/collaborationStore';

// Mock the store
vi.mock('@/stores/collaborationStore');

const mockStore = {
  activeTool: 'select',
  setActiveTool: vi.fn(),
  toolOptions: {
    color: '#000000',
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    fontSize: 16,
    fontFamily: 'Arial',
    brushWidth: 5,
  },
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn(),
  users: [],
  mediaState: {
    audio: false,
    video: false,
    screen: false,
  },
};

describe('Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCollaborationStore as any).mockReturnValue(mockStore);
  });

  it('renders all drawing tools', () => {
    render(<Toolbar />);
    
    // Check for tool buttons by their aria-labels or text content
    expect(screen.getByTitle(/Select/)).toBeInTheDocument();
    expect(screen.getByTitle(/Rectangle/)).toBeInTheDocument();
    expect(screen.getByTitle(/Circle/)).toBeInTheDocument();
    expect(screen.getByTitle(/Line/)).toBeInTheDocument();
    expect(screen.getByTitle(/Text/)).toBeInTheDocument();
    expect(screen.getByTitle(/Pen/)).toBeInTheDocument();
    expect(screen.getByTitle(/Hand/)).toBeInTheDocument();
  });

  it('highlights active tool', () => {
    const storeWithActiveTool = {
      ...mockStore,
      activeTool: 'rectangle',
    };
    (useCollaborationStore as any).mockReturnValue(storeWithActiveTool);
    
    render(<Toolbar />);
    
    const rectangleButton = screen.getByTitle(/Rectangle/);
    expect(rectangleButton).toHaveClass('active');
  });

  it('calls setActiveTool when tool is clicked', () => {
    render(<Toolbar />);
    
    const rectangleButton = screen.getByTitle(/Rectangle/);
    fireEvent.click(rectangleButton);
    
    expect(mockStore.setActiveTool).toHaveBeenCalledWith('rectangle');
  });

  it('renders color controls', () => {
    render(<Toolbar />);
    
    expect(screen.getByText('Stroke:')).toBeInTheDocument();
    expect(screen.getByText('Fill:')).toBeInTheDocument();
  });

  it('renders stroke width slider', () => {
    render(<Toolbar />);
    
    expect(screen.getByText('Stroke')).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('shows brush width control when pen tool is active', () => {
    const storeWithPenTool = {
      ...mockStore,
      activeTool: 'pen',
    };
    (useCollaborationStore as any).mockReturnValue(storeWithPenTool);
    
    render(<Toolbar />);
    
    expect(screen.getByText('Brush')).toBeInTheDocument();
  });

  it('renders undo/redo buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle(/Undo/)).toBeInTheDocument();
    expect(screen.getByTitle(/Redo/)).toBeInTheDocument();
  });

  it('disables undo button when canUndo is false', () => {
    render(<Toolbar />);
    
    const undoButton = screen.getByTitle(/Undo/);
    expect(undoButton).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    const storeWithUndo = {
      ...mockStore,
      canUndo: true,
    };
    (useCollaborationStore as any).mockReturnValue(storeWithUndo);
    
    render(<Toolbar />);
    
    const undoButton = screen.getByTitle(/Undo/);
    expect(undoButton).not.toBeDisabled();
  });

  it('calls undo when undo button is clicked', () => {
    const storeWithUndo = {
      ...mockStore,
      canUndo: true,
    };
    (useCollaborationStore as any).mockReturnValue(storeWithUndo);
    
    render(<Toolbar />);
    
    const undoButton = screen.getByTitle(/Undo/);
    fireEvent.click(undoButton);
    
    expect(mockStore.undo).toHaveBeenCalled();
  });

  it('renders media controls', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle(/microphone/)).toBeInTheDocument();
    expect(screen.getByTitle(/camera/)).toBeInTheDocument();
  });

  it('shows active state for enabled media', () => {
    const storeWithMedia = {
      ...mockStore,
      mediaState: {
        audio: true,
        video: false,
        screen: false,
      },
    };
    (useCollaborationStore as any).mockReturnValue(storeWithMedia);
    
    render(<Toolbar />);
    
    const audioButton = screen.getByTitle(/Mute microphone/);
    expect(audioButton).toHaveClass('active');
  });

  it('displays user count', () => {
    const storeWithUsers = {
      ...mockStore,
      users: [
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ],
    };
    (useCollaborationStore as any).mockReturnValue(storeWithUsers);
    
    render(<Toolbar />);
    
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders file operation buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle(/Import/)).toBeInTheDocument();
    expect(screen.getByTitle(/Export/)).toBeInTheDocument();
  });

  it('renders settings button', () => {
    render(<Toolbar />);
    
    expect(screen.getByTitle(/Settings/)).toBeInTheDocument();
  });
});
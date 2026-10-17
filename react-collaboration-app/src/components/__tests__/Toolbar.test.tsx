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
    vi.mocked(useCollaborationStore).mockReturnValue(mockStore);
  });

  it('renders all drawing tools', () => {
    render(<Toolbar />);
    
    // Check for tool buttons by their aria-labels or text content
    expect(screen.getByRole('button', { name: /Select/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rectangle/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Circle/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Line/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Text/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hand/ })).toBeInTheDocument();
  });

  it('highlights active tool', () => {
    const storeWithActiveTool = {
      ...mockStore,
      activeTool: 'rectangle',
    };
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithActiveTool);
    
    render(<Toolbar />);
    
    const rectangleButton = screen.getByRole('button', { name: /Rectangle/ });
    expect(rectangleButton).toHaveClass('active');
  });

  it('calls setActiveTool when tool is clicked', () => {
    render(<Toolbar />);
    
    const rectangleButton = screen.getByRole('button', { name: /Rectangle/ });
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
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithPenTool);
    
    render(<Toolbar />);
    
    expect(screen.getByText('Brush')).toBeInTheDocument();
  });

  it('renders undo/redo buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByRole('button', { name: /Undo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Redo/ })).toBeInTheDocument();
  });

  it('disables undo button when canUndo is false', () => {
    render(<Toolbar />);
    
    const undoButton = screen.getByRole('button', { name: /Undo/ });
    expect(undoButton).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    const storeWithUndo = {
      ...mockStore,
      canUndo: true,
    };
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithUndo);
    
    render(<Toolbar />);
    
    const undoButton = screen.getByRole('button', { name: /Undo/ });
    expect(undoButton).not.toBeDisabled();
  });

  it('calls undo when undo button is clicked', () => {
    const storeWithUndo = {
      ...mockStore,
      canUndo: true,
    };
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithUndo);
    
    render(<Toolbar />);
    
    const undoButton = screen.getByRole('button', { name: /Undo/ });
    fireEvent.click(undoButton);
    
    expect(mockStore.undo).toHaveBeenCalled();
  });

  it('renders media controls', () => {
    render(<Toolbar />);
    
    expect(screen.getByRole('button', { name: /microphone/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera/ })).toBeInTheDocument();
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
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithMedia);
    
    render(<Toolbar />);
    
    const audioButton = screen.getByRole('button', { name: /Mute microphone/ });
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
    vi.mocked(useCollaborationStore).mockReturnValue(storeWithUsers);
    
    render(<Toolbar />);
    
    expect(screen.getByLabelText('2 users online')).toHaveTextContent('2');
  });

  it('renders file operation buttons', () => {
    render(<Toolbar />);
    
    expect(screen.getByRole('button', { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
  });

  it('renders settings button', () => {
    render(<Toolbar />);
    
    expect(screen.getByRole('button', { name: /Settings/ })).toBeInTheDocument();
  });
});
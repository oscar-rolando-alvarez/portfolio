import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status', { hidden: true });
    expect(spinner).toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { rerender } = render(<LoadingSpinner size="sm" />);
    let spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('w-4', 'h-4');

    rerender(<LoadingSpinner size="lg" />);
    spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('w-8', 'h-8');
  });

  it('applies correct color classes', () => {
    const { rerender } = render(<LoadingSpinner color="primary" />);
    let spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('border-primary-600');

    rerender(<LoadingSpinner color="white" />);
    spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('border-white');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    
    const spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('custom-class');
  });

  it('has spinning animation', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status', { hidden: true });
    expect(spinner.firstChild).toHaveClass('animate-spin');
  });
});
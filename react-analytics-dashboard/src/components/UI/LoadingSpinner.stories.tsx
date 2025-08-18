import type { Meta, StoryObj } from '@storybook/react';
import { LoadingSpinner } from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingSpinner',
  component: LoadingSpinner,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'A customizable loading spinner component with different sizes and colors.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      description: 'Size of the spinner',
      table: {
        type: { summary: 'sm | md | lg | xl' },
        defaultValue: { summary: 'md' },
      },
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'white'],
      description: 'Color theme of the spinner',
      table: {
        type: { summary: 'primary | secondary | white' },
        defaultValue: { summary: 'primary' },
      },
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes',
      table: {
        type: { summary: 'string' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story
export const Default: Story = {
  args: {
    size: 'md',
    color: 'primary',
  },
};

// Size variations
export const Small: Story = {
  args: {
    size: 'sm',
    color: 'primary',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    color: 'primary',
  },
};

export const ExtraLarge: Story = {
  args: {
    size: 'xl',
    color: 'primary',
  },
};

// Color variations
export const Secondary: Story = {
  args: {
    size: 'md',
    color: 'secondary',
  },
};

export const White: Story = {
  args: {
    size: 'md',
    color: 'white',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

// Size comparison
export const SizeComparison: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <LoadingSpinner size="sm" />
        <p className="mt-2 text-sm text-gray-600">Small</p>
      </div>
      <div className="text-center">
        <LoadingSpinner size="md" />
        <p className="mt-2 text-sm text-gray-600">Medium</p>
      </div>
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-2 text-sm text-gray-600">Large</p>
      </div>
      <div className="text-center">
        <LoadingSpinner size="xl" />
        <p className="mt-2 text-sm text-gray-600">Extra Large</p>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all available spinner sizes.',
      },
    },
  },
};

// Color comparison
export const ColorComparison: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <LoadingSpinner color="primary" />
        <p className="mt-2 text-sm text-gray-600">Primary</p>
      </div>
      <div className="text-center">
        <LoadingSpinner color="secondary" />
        <p className="mt-2 text-sm text-gray-600">Secondary</p>
      </div>
      <div className="text-center bg-gray-800 p-4 rounded">
        <LoadingSpinner color="white" />
        <p className="mt-2 text-sm text-white">White</p>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all available spinner colors.',
      },
    },
  },
};

// Custom styling
export const CustomStyling: Story = {
  args: {
    size: 'lg',
    color: 'primary',
    className: 'opacity-50',
  },
  parameters: {
    docs: {
      description: {
        story: 'Example of custom styling using the className prop.',
      },
    },
  },
};
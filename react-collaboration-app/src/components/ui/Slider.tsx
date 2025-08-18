import React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  showValue?: boolean;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, showValue = true, value, onChange, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{label}</label>
            {showValue && (
              <span className="text-sm text-muted-foreground">{value}</span>
            )}
          </div>
        )}
        <input
          type="range"
          className={cn(
            "w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider",
            className
          )}
          ref={ref}
          value={value}
          onChange={onChange}
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
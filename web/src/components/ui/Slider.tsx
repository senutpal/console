import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text displayed above the slider */
  label?: ReactNode
  /** Unit text displayed next to the value (e.g., "ms") */
  unit?: string
  /** Custom formatter for displaying the value */
  formatValue?: (value: number) => string
  /** Min value */
  min?: number
  /** Max value */
  max?: number
  /** Step size */
  step?: number
}

export function Slider({
  label,
  unit = '',
  formatValue,
  value,
  onChange,
  min = 1000,
  max = 30000,
  step = 1000,
  disabled,
  className,
  ...props
}: SliderProps) {
  const id = useId()
  const displayValue =
    formatValue && typeof value === 'number'
      ? formatValue(value)
      : `${value}${unit}`

  return (
    <div className="w-full space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <span className="text-sm text-muted-foreground font-mono">
            {displayValue}
          </span>
        </div>
      )}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          'w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md',
          '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-0',
          className,
        )}
        {...props}
      />
    </div>
  )
}

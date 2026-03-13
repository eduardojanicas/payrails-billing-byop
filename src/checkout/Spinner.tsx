"use client"
/**
 * Spinner
 * Minimal Tailwind-based loading indicator used across the tutorial examples.
 * Accessible: includes visually hidden status text for screen readers.
 */
import React from 'react'

interface SpinnerProps {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export const Spinner: React.FC<SpinnerProps> = ({ label = 'Loading…', size = 'md', className = '' }) => (
  <div className={`inline-flex items-center gap-2 ${className}`} aria-live="polite" aria-busy="true">
    <span
      className={`animate-spin rounded-full border-2 border-current border-r-transparent ${sizeMap[size]}`}
      aria-hidden="true"
    />
    <span className="sr-only">{label}</span>
  </div>
)

export default Spinner

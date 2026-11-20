import React from 'react';

/**
 * Accessible button with calm, high-contrast states.
 * Respects design system: no loud gradients, clear focus rings.
 */
export function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  onClick,
  className = '',
  ariaLabel,
  ...rest
}) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors duration-150 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-5 py-3 gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900 focus-visible:ring-brand-800 shadow-sm',
    secondary: 'bg-surface-muted text-stone-800 hover:bg-surface-subtle active:bg-stone-200 border border-border focus-visible:ring-brand-700',
    outline: 'bg-transparent text-brand-900 hover:bg-brand-50 border border-brand-800 active:bg-brand-100 focus-visible:ring-brand-800',
    ghost: 'bg-transparent text-stone-700 hover:bg-surface-muted active:bg-surface-subtle focus-visible:ring-brand-700',
    danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 focus-visible:ring-red-700',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`
        ${baseStyles}
        ${sizeStyles[size] || sizeStyles.md}
        ${variantStyles[variant] || variantStyles.primary}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...rest}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

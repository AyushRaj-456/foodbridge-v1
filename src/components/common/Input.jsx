import React from 'react';

/**
 * Accessible form field supporting input, textarea, and select.
 */
export function Input({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  hint,
  disabled = false,
  required = false,
  className = '',
  rows = 3,
  children, // For select options
  as = 'input',
  ...rest
}) {
  const inputId = id || name;
  const isSelect = as === 'select';
  const isTextarea = as === 'textarea';

  const baseStyles = 'w-full px-3.5 py-2.5 text-sm bg-white text-stone-900 border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:bg-surface-muted disabled:text-stone-400 disabled:cursor-not-allowed';
  const borderStyles = error
    ? 'border-red-400 focus-visible:ring-red-600 focus-visible:border-red-600'
    : 'border-border focus-visible:ring-brand-700 focus-visible:border-brand-700';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs sm:text-sm font-medium text-stone-700 flex items-center justify-between">
          <span>
            {label}
            {required && <span className="text-red-600 ml-1" aria-hidden="true">*</span>}
          </span>
          {required && <span className="text-[11px] text-stone-400">Required</span>}
        </label>
      )}

      {isTextarea ? (
        <textarea
          id={inputId}
          name={name}
          rows={rows}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`${baseStyles} ${borderStyles} resize-y`}
          {...rest}
        />
      ) : isSelect ? (
        <select
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`${baseStyles} ${borderStyles}`}
          {...rest}
        >
          {children}
        </select>
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`${baseStyles} ${borderStyles}`}
          {...rest}
        />
      )}

      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-red-600 font-medium">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-xs text-stone-500">
          {hint}
        </p>
      )}
    </div>
  );
}

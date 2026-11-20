import React from 'react';

/**
 * Compact semantic status and category badge.
 * Provides distinct styles for each recipient category and status.
 */
export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  icon: Icon
}) {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  const variantStyles = {
    // Recipient Category Badges
    human: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    animal: 'bg-amber-50 text-amber-800 border-amber-200/80',
    compost: 'bg-lime-50 text-lime-800 border-lime-200/80',
    biogas: 'bg-sky-50 text-sky-800 border-sky-200/80',

    // Status Badges
    verified: 'bg-brand-50 text-brand-800 border-brand-200',
    active: 'bg-green-50 text-green-800 border-green-200',
    pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    neutral: 'bg-surface-muted text-stone-700 border-border',
    accent: 'bg-brand-800 text-white border-transparent'
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-medium rounded-full border
        ${sizeStyles[size] || sizeStyles.md}
        ${variantStyles[variant] || variantStyles.neutral}
        ${className}
      `}
    >
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}

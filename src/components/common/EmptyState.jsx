import React from 'react';

/**
 * Standard zero-state and empty-state card.
 * Never leaves users looking at blank space.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = ''
}) {
  return (
    <div className={`text-center p-8 sm:p-12 border border-dashed border-border rounded-xl bg-surface-muted/40 ${className}`}>
      {Icon && (
        <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-brand-50 text-brand-800 mb-4">
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base sm:text-lg font-semibold text-stone-900 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-stone-600 max-w-md mx-auto mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <div className="flex justify-center">
          {action}
        </div>
      )}
    </div>
  );
}

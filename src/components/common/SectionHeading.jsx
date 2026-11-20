import React from 'react';

/**
 * Standard section header with overline, h2 title, and descriptive subtitle.
 */
export function SectionHeading({
  overline,
  title,
  subtitle,
  align = 'center',
  className = ''
}) {
  const alignStyles = {
    left: 'text-left',
    center: 'text-center mx-auto',
    right: 'text-right ml-auto'
  };

  return (
    <div className={`max-w-2xl mb-12 ${alignStyles[align] || alignStyles.center} ${className}`}>
      {overline && (
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 mb-2">
          {overline}
        </p>
      )}
      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 tracking-tight leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base sm:text-lg text-stone-600 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

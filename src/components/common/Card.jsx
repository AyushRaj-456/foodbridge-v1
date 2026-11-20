import React from 'react';

/**
 * Standard card container with calm borders and subtle elevation.
 */
export function Card({
  children,
  className = '',
  hover = false,
  as: Component = 'div',
  ...rest
}) {
  return (
    <Component
      className={`
        bg-white rounded-xl border border-border/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]
        ${hover ? 'transition-all duration-200 hover:border-border-strong hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]' : ''}
        ${className}
      `}
      {...rest}
    >
      {children}
    </Component>
  );
}

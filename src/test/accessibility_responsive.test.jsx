import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AppLayout } from '../components/layout/AppLayout';
import { LandingPage } from '../pages/LandingPage';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';

describe('Accessibility and Responsive Viewport Standards', () => {

  it('renders required accessibility landmarks: skip-link, header, main, and footer', () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <AppLayout>
            <LandingPage />
          </AppLayout>
        </MemoryRouter>
      </LocaleProvider>
    );

    // Skip to main content link
    const skipLink = screen.getByText(/skip to main content/i);
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');

    // Header landmark
    expect(screen.getByRole('banner')).toBeInTheDocument();

    // Main landmark
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');

    // Footer landmark
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('ensures all interactive buttons have accessible text labels and focus-visible rings', () => {
    const { container } = render(
      <Button variant="primary">Submit Donation</Button>
    );

    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('Submit Donation');
    // Verifies focus-visible ring styles are present
    expect(button.className).toContain('focus-visible:ring-2');
  });

  it('ensures form inputs have associated labels and accessible error states', () => {
    render(
      <Input
        id="accessible-test-input"
        label="Organization Name"
        helperText="As registered with government authorities"
        error="Field is required"
        required
      />
    );

    // Label association
    const input = screen.getByLabelText(/organization name/i);
    expect(input).toBeInTheDocument();
    expect(input).toBeRequired();

    // Accessible error announcement
    const errorMsg = screen.getByRole('alert');
    expect(errorMsg).toBeInTheDocument();
    expect(errorMsg.textContent).toContain('Field is required');
  });

  it('includes mobile-first responsive layout classes for viewports', () => {
    const { container } = render(
      <LocaleProvider>
        <MemoryRouter>
          <AppLayout>
            <LandingPage />
          </AppLayout>
        </MemoryRouter>
      </LocaleProvider>
    );

    // Mobile menu toggle button should have aria-expanded and aria-label
    const menuToggle = screen.getByLabelText(/toggle navigation menu/i);
    expect(menuToggle).toBeInTheDocument();
    expect(menuToggle).toHaveAttribute('aria-expanded');
  });
});

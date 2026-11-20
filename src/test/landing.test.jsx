import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { LandingPage } from '../pages/LandingPage';
import { AppLayout } from '../components/layout/AppLayout';

describe('LandingPage Integration', () => {
  it('renders hero headline, supporting copy, and CTAs', () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <AppLayout>
            <LandingPage />
          </AppLayout>
        </MemoryRouter>
      </LocaleProvider>
    );

    // Hero Headline
    expect(screen.getByText('Good Food Deserves a Second Chance.')).toBeInTheDocument();

    // CTAs (Donate food in nav & hero)
    const donateButtons = screen.getAllByRole('button', { name: /donate food/i });
    expect(donateButtons.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /explore how it works/i })).toBeInTheDocument();

    // How It Works Steps
    expect(screen.getByText('List surplus food')).toBeInTheDocument();
    expect(screen.getByText('Find a suitable recipient')).toBeInTheDocument();
    expect(screen.getByText('Arrange pickup & confirm')).toBeInTheDocument();

    // Four Recipient Categories
    expect(screen.getByText('Human-Food Recipients')).toBeInTheDocument();
    expect(screen.getByText('Animal-Food Recipients')).toBeInTheDocument();
    expect(screen.getByText('Composting Facilities')).toBeInTheDocument();
    expect(screen.getByText('Biogas Plants')).toBeInTheDocument();

    // Strict safety banner
    expect(screen.getByText(/food safety is non-negotiable/i)).toBeInTheDocument();

    // Impact zero states (No fake numbers!)
    expect(screen.getAllByText('0').length).toBe(4);
    expect(screen.getByText('Meals Provided')).toBeInTheDocument();
    expect(screen.getByText('Surplus Food Saved')).toBeInTheDocument();
    expect(screen.getByText('Verified Partners')).toBeInTheDocument();
    expect(screen.getByText('GHG Avoided')).toBeInTheDocument();

    // Footer links & placeholders
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Governance & Safety')).toBeInTheDocument();
  });
});

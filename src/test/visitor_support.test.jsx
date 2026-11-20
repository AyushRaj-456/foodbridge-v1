import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { SupportPage } from '../pages/support/SupportPage';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { ProfileSettingsPage } from '../pages/profile/ProfileSettingsPage';

describe('Visitor Mode & Voluntary Support ("Buy Us a Coffee") Features', () => {
  it('renders Support FoodBridge page with voluntary contribution explanation and amount options', () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SupportPage />
        </MemoryRouter>
      </LocaleProvider>
    );

    expect(screen.getByRole('heading', { name: /support foodbridge/i })).toBeInTheDocument();
    expect(screen.getByText(/buy us a coffee/i)).toBeInTheDocument();
    expect(screen.getByText(/zero-cost architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/volunteer driver stipends/i)).toBeInTheDocument();

    // Voluntary tiers: ₹50, ₹100, ₹250
    expect(screen.getByText('₹50')).toBeInTheDocument();
    expect(screen.getByText('₹100')).toBeInTheDocument();
    expect(screen.getByText('₹250')).toBeInTheDocument();

    // Selecting an amount highlights it
    const tier100 = screen.getByText('₹100').closest('button');
    fireEvent.click(tier100);
    expect(tier100.className).toContain('ring-brand-700');
  });

  it('displays honest fallback notice when UPI channel is not configured (does not invent fake UPI IDs)', () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SupportPage />
        </MemoryRouter>
      </LocaleProvider>
    );

    // If VITE_CONTRIBUTION_UPI_ID is empty, it informs the user honestly
    if (!import.meta.env.VITE_CONTRIBUTION_UPI_ID) {
      expect(screen.getByText(/upi channel setup in progress/i)).toBeInTheDocument();
      expect(screen.getByText(/official platform upi id is currently being configured/i)).toBeInTheDocument();
    }
  });

  it('ProtectedRoute strictly blocks Visitors from accessing operational donor/recipient/delivery dashboards', () => {
    const visitorAuthContext = {
      user: { uid: 'visitor-01', email: 'visitor@explore.org' },
      userDoc: { uid: 'visitor-01', roles: ['visitor'], activeRole: 'visitor', onboardingComplete: true },
      profileData: null,
      loading: false,
      isAdmin: false,
      isVerified: true
    };

    render(
      <LocaleProvider>
        <AuthContext.Provider value={visitorAuthContext}>
          <MemoryRouter>
            <ProtectedRoute allowedRoles={['donor']}>
              <div>Operational Donor Dashboard Content</div>
            </ProtectedRoute>
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    // Operational content must be blocked
    expect(screen.queryByText('Operational Donor Dashboard Content')).not.toBeInTheDocument();

    // Must display Participation Role Required notice
    expect(screen.getByText(/participation role required/i)).toBeInTheDocument();
    expect(screen.getByText(/you are currently exploring foodbridge in visitor mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore foodbridge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select active role/i })).toBeInTheDocument();
  });

  it('ProfileSettingsPage renders Visitor Mode overview card with options to support or change role', () => {
    const visitorAuthContext = {
      user: { uid: 'visitor-01', email: 'visitor@explore.org' },
      userDoc: { uid: 'visitor-01', roles: ['visitor'], activeRole: 'visitor', onboardingComplete: true },
      profileData: null,
      loading: false,
      isAdmin: false,
      isVerified: true,
      switchActiveRole: vi.fn(),
      logout: vi.fn(),
      refreshUserProfile: vi.fn()
    };

    render(
      <LocaleProvider>
        <AuthContext.Provider value={visitorAuthContext}>
          <MemoryRouter>
            <ProfileSettingsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    expect(screen.getByRole('heading', { name: /visitor mode/i })).toBeInTheDocument();
    expect(screen.getByText(/exploring and supporting the foodbridge community mission/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /support foodbridge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change participation role/i })).toBeInTheDocument();
  });
});

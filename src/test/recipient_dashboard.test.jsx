import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { RecipientDashboardPage } from '../pages/recipient/RecipientDashboardPage';

describe('Recipient Dashboard UI', () => {
  const mockRecipientAuth = {
    user: { uid: 'rec-user-123', email: 'director@ashraya.org' },
    userDoc: { uid: 'rec-user-123', roles: ['recipient'], activeRole: 'recipient', onboardingComplete: true },
    profileData: {
      organizationName: 'Ashraya Foundation',
      category: 'human',
      verificationStatus: 'verified',
      operationalStatus: 'active',
      totalCapacity: 300,
      committedCapacity: 50,
      availableAdditionalCapacity: 250,
      capacityUnit: 'meals',
      district: 'Bengaluru Urban',
      latitude: 12.9716,
      longitude: 77.5946
    },
    loading: false,
    isAdmin: false,
    refreshUserProfile: vi.fn()
  };

  it('renders recipient dashboard with available donations, capacity, and tabs', async () => {
    // Mock getDocs to return empty lists initially
    vi.mock('../services/firebase', async () => {
      const actual = await vi.importActual('../services/firebase');
      return {
        ...actual,
        getDocs: vi.fn().mockResolvedValue({ docs: [] }),
        collection: vi.fn(),
        query: vi.fn(),
        where: vi.fn(),
        doc: vi.fn(),
        updateDoc: vi.fn()
      };
    });

    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockRecipientAuth}>
          <MemoryRouter>
            <RecipientDashboardPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    // Organization name and role badge
    expect(screen.getByText('Ashraya Foundation')).toBeInTheDocument();
    expect(screen.getByText('HUMAN RECIPIENT')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();

    // Capacity figure
    expect(screen.getByText(/available additional intake/i)).toBeInTheDocument();

    // Tabs
    expect(screen.getByRole('button', { name: /available donations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accepted \/ handover/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capacity & alerts/i })).toBeInTheDocument();
  });
});

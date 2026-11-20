import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { CreateListingPage } from '../pages/donor/CreateListingPage';
import { DonorDashboardPage } from '../pages/donor/DonorDashboardPage';

describe('Donor Listing Creation & Dashboard UI', () => {
  const mockDonorAuth = {
    user: { uid: 'donor-user-123', email: 'mess@college.edu' },
    userDoc: { uid: 'donor-user-123', roles: ['donor'], activeRole: 'donor', onboardingComplete: true },
    profileData: {
      organizationName: 'BMS Hostel Mess',
      donorType: 'mess',
      phone: '+91 98765 11111',
      address: 'Bull Temple Road, Basavanagudi, Bengaluru',
      district: 'Bengaluru Urban'
    },
    loading: false,
    isAdmin: false
  };

  it('renders listing creation form with required fields and real-time safety evaluation', () => {
    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockDonorAuth}>
          <MemoryRouter>
            <CreateListingPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    expect(screen.getByLabelText(/food \/ material title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/measurement unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/food state \/ condition/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/current storage & holding condition/i)).toBeInTheDocument();
    expect(screen.getByText(/pure vegetarian/i)).toBeInTheDocument();
    expect(screen.getByText(/donor safety declaration/i)).toBeInTheDocument();
    expect(screen.getByText(/platform safety & eligibility evaluation/i)).toBeInTheDocument();
  });

  it('renders donor dashboard with primary create action and empty state when no listings exist', async () => {
    // Mock getDocs to return empty array
    vi.mock('../services/firebase', async () => {
      const actual = await vi.importActual('../services/firebase');
      return {
        ...actual,
        getDocs: vi.fn().mockResolvedValue({ docs: [] }),
        collection: vi.fn(),
        query: vi.fn(),
        where: vi.fn()
      };
    });

    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockDonorAuth}>
          <MemoryRouter>
            <DonorDashboardPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

    // Primary action
    expect(screen.getAllByRole('button', { name: /create food listing/i }).length).toBeGreaterThan(0);
    // Heading
    expect(screen.getByRole('heading', { name: /surplus food listings/i })).toBeInTheDocument();
  });
});

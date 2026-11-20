import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { OnboardingFlow } from '../pages/onboarding/OnboardingFlow';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('Single Participation Role Selection and Visitor Mode Flow', () => {
  let mockAuthContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthContext = {
      user: { uid: 'test-user-123', email: 'visitor@community.org' },
      userDoc: { uid: 'test-user-123', roles: [], onboardingComplete: false },
      profileData: null,
      loading: false,
      completeOnboarding: vi.fn().mockResolvedValue({}),
    };
  });

  const renderComponent = (overrides = {}) =>
    render(
      <LocaleProvider>
        <AuthContext.Provider value={{ ...mockAuthContext, ...overrides }}>
          <MemoryRouter>
            <OnboardingFlow />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

  it('renders heading "How would you like to participate?" and all 4 participation roles', () => {
    renderComponent();
    expect(screen.getByRole('heading', { name: /how would you like to participate\?/i })).toBeInTheDocument();
    expect(screen.getByText(/choose how you would like to be part of foodbridge/i)).toBeInTheDocument();

    // 4 Distinct Cards
    expect(screen.getByText('Donor')).toBeInTheDocument();
    expect(screen.getByText('Recipient Organization')).toBeInTheDocument();
    expect(screen.getByText('Delivery Partner')).toBeInTheDocument();
    expect(screen.getByText('Visitor')).toBeInTheDocument();
  });

  it('enforces single role selection and dynamically changes button label for Visitor', async () => {
    renderComponent();

    // Default selected role is Donor -> button says "Continue"
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument();

    // Select Visitor
    fireEvent.click(screen.getByText('Visitor'));

    // Button label dynamically changes to "Explore FoodBridge"
    const exploreBtn = screen.getByRole('button', { name: /explore foodbridge/i });
    expect(exploreBtn).toBeInTheDocument();

    // Clicking "Explore FoodBridge" completes onboarding directly without Step 2 forms
    fireEvent.click(exploreBtn);

    await waitFor(() => {
      expect(mockAuthContext.completeOnboarding).toHaveBeenCalledWith({ selectedRole: 'visitor' });
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('navigates to specific profile form for Donor when selected', () => {
    renderComponent();

    // Select Donor
    fireEvent.click(screen.getByText('Donor'));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    // Should render Donor Profile only
    expect(screen.getByRole('heading', { name: /donor profile/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/establishment \/ donor name/i)).toBeInTheDocument();
    expect(screen.queryByText(/recipient organization profile/i)).not.toBeInTheDocument();
  });

  it('navigates to specific profile form for Recipient Organization when selected', () => {
    renderComponent();

    // Select Recipient Organization
    fireEvent.click(screen.getByText('Recipient Organization'));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    // Should render Recipient Organization Profile only
    expect(screen.getByRole('heading', { name: /recipient organization profile/i })).toBeInTheDocument();
    expect(screen.getByText(/human-food recipient/i)).toBeInTheDocument();
    expect(screen.getByText(/animal-food recipient/i)).toBeInTheDocument();
    expect(screen.getByText(/composting facility/i)).toBeInTheDocument();
    expect(screen.getByText(/biogas plant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/available additional capacity/i)).toBeInTheDocument();
  });

  it('allows returning back to Step 1 via Back to Role Selection button', () => {
    renderComponent();

    // Go to step 2 for Delivery Partner
    fireEvent.click(screen.getByText('Delivery Partner'));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(screen.getByRole('heading', { name: /delivery partner profile/i })).toBeInTheDocument();

    // Click Back
    fireEvent.click(screen.getByText(/back to participation selection/i));

    // Back to Step 1
    expect(screen.getByRole('heading', { name: /how would you like to participate\?/i })).toBeInTheDocument();
  });

  it('automatically redirects onboarded users to their role dashboard and does not show role selection screen', () => {
    renderComponent({
      userDoc: { uid: 'donor-1', roles: ['donor'], activeRole: 'donor', onboardingComplete: true }
    });

    expect(mockNavigate).toHaveBeenCalledWith('/donor/dashboard', { replace: true });
    expect(screen.queryByRole('heading', { name: /how would you like to participate\?/i })).not.toBeInTheDocument();
  });

  it('resumes directly at Step 2 profile setup when user has already selected a role but not finished onboarding', () => {
    renderComponent({
      userDoc: { uid: 'donor-2', roles: ['donor'], activeRole: 'donor', onboardingComplete: false }
    });

    // Directly renders Donor Profile (Step 2)
    expect(screen.getByRole('heading', { name: /donor profile/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /how would you like to participate\?/i })).not.toBeInTheDocument();
  });
});

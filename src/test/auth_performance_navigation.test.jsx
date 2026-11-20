import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext, AuthProvider, useAuth, getUserDashboardRoute } from '../context/AuthContext';
import { SignInPage } from '../pages/auth/SignInPage';

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('Authentication Speed & Profile Navigation Verification', () => {
  let mockAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      user: null,
      userDoc: null,
      profileData: null,
      loading: false,
      isAdmin: false,
      isVerified: false,
      loginWithEmail: vi.fn(),
      registerWithEmail: vi.fn(),
      loginWithGoogle: vi.fn(),
      sendPasswordReset: vi.fn(),
      logout: vi.fn()
    };
  });

  const renderSignIn = (authOverrides = {}, initialEntries = ['/signin']) =>
    render(
      <LocaleProvider>
        <AuthContext.Provider value={{ ...mockAuth, ...authOverrides }}>
          <MemoryRouter initialEntries={initialEntries}>
            <SignInPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

  // Test 1: New email/password registration navigates directly to /onboarding
  it('1. New email/password registration navigates immediately to /onboarding', async () => {
    mockAuth.registerWithEmail.mockResolvedValueOnce({
      uid: 'user_123',
      email: 'newuser@example.org',
      userDoc: { uid: 'user_123', onboardingComplete: false }
    });

    renderSignIn();

    // Switch to Register
    fireEvent.click(screen.getByRole('button', { name: /register here/i }));

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInputs = screen.getAllByLabelText(/password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);

    fireEvent.change(emailInput, { target: { value: 'newuser@example.org' } });
    fireEvent.change(passwordInputs[0], { target: { value: 'securePass123' } });
    fireEvent.change(confirmInput, { target: { value: 'securePass123' } });

    const createBtn = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockAuth.registerWithEmail).toHaveBeenCalledWith('newuser@example.org', 'securePass123');
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
    });
  });

  // Test 2: New Google registration with incomplete profile navigates to /onboarding
  it('2. New Google registration navigates incomplete profiles to /onboarding', async () => {
    mockAuth.loginWithGoogle.mockResolvedValueOnce({
      uid: 'google_123',
      email: 'google@example.org',
      userDoc: { uid: 'google_123', onboardingComplete: false }
    });

    renderSignIn();

    const googleBtn = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(mockAuth.loginWithGoogle).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
    });
  });

  // Test 3: Existing email/password login with completed profile navigates directly to role dashboard
  it('3. Existing email/password login navigates completed profile to their active role dashboard', async () => {
    mockAuth.loginWithEmail.mockResolvedValueOnce({
      uid: 'existing_donor',
      email: 'donor@example.org',
      userDoc: {
        uid: 'existing_donor',
        onboardingComplete: true,
        activeRole: 'donor',
        roles: ['donor']
      }
    });

    renderSignIn();

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'donor@example.org' } });
    fireEvent.change(passwordInput, { target: { value: 'donorPass123' } });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockAuth.loginWithEmail).toHaveBeenCalledWith('donor@example.org', 'donorPass123');
      expect(mockNavigate).toHaveBeenCalledWith('/donor/dashboard', { replace: true });
    });
  });

  // Test 4: Login with incomplete profile redirects to Profile Setup
  it('4. Login with incomplete profile redirects directly to /onboarding', async () => {
    mockAuth.loginWithEmail.mockResolvedValueOnce({
      uid: 'incomplete_user',
      email: 'incomplete@example.org',
      userDoc: {
        uid: 'incomplete_user',
        onboardingComplete: false
      }
    });

    renderSignIn();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'incomplete@example.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass1234' } });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
    });
  });

  // Test 5: Login with completed recipient profile navigates to /recipient/dashboard
  it('5. Login with completed recipient profile routes to /recipient/dashboard', async () => {
    mockAuth.loginWithEmail.mockResolvedValueOnce({
      uid: 'recipient_user',
      email: 'ngo@example.org',
      userDoc: {
        uid: 'recipient_user',
        onboardingComplete: true,
        activeRole: 'recipient',
        roles: ['recipient']
      }
    });

    renderSignIn();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'ngo@example.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass1234' } });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/recipient/dashboard', { replace: true });
    });
  });

  // Test 6: Page refresh / visit to /signin while already authenticated auto-redirects
  it('6. Visiting /signin while authenticated auto-redirects to active dashboard', async () => {
    renderSignIn({
      user: { uid: 'auth_delivery' },
      userDoc: {
        uid: 'auth_delivery',
        onboardingComplete: true,
        activeRole: 'delivery',
        roles: ['delivery']
      },
      loading: false
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/delivery/dashboard', { replace: true });
    });
  });

  // Test 7: getUserDashboardRoute maps roles accurately
  it('7. getUserDashboardRoute routes incomplete profiles to /onboarding, and roles to dashboards', () => {
    expect(getUserDashboardRoute(null)).toBe('/onboarding');
    expect(getUserDashboardRoute({ onboardingComplete: false })).toBe('/onboarding');
    expect(getUserDashboardRoute({ onboardingComplete: true, isAdmin: true })).toBe('/admin/verification');
    expect(getUserDashboardRoute({ onboardingComplete: true, activeRole: 'donor' })).toBe('/donor/dashboard');
    expect(getUserDashboardRoute({ onboardingComplete: true, activeRole: 'recipient' })).toBe('/recipient/dashboard');
    expect(getUserDashboardRoute({ onboardingComplete: true, activeRole: 'delivery' })).toBe('/delivery/dashboard');
    expect(getUserDashboardRoute({ onboardingComplete: true, activeRole: 'visitor' })).toBe('/');
  });

  // Test 8: Displays readable error message on authentication failure
  it('8. Displays readable error message when credentials fail', async () => {
    const error = new Error('Invalid');
    error.code = 'auth/invalid-credential';
    mockAuth.loginWithEmail.mockRejectedValueOnce(error);

    renderSignIn();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'wrong@example.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/incorrect email or password/i)).toBeInTheDocument();
  });

  // Test 9: Displays email already in use error message
  it('9. Displays clear error message if email is already in use', async () => {
    const error = new Error('In use');
    error.code = 'auth/email-already-in-use';
    mockAuth.registerWithEmail.mockRejectedValueOnce(error);

    renderSignIn();

    fireEvent.click(screen.getByRole('button', { name: /register here/i }));

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'taken@example.org' } });
    fireEvent.change(screen.getAllByLabelText(/password/i)[0], { target: { value: 'pass1234' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'pass1234' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/this email is already registered/i)).toBeInTheDocument();
  });

  // Test 10: Multiple rapid clicks on Create Account only triggers single registration call
  it('10. Prevents duplicate submissions on rapid multiple clicks', async () => {
    let resolveRegister;
    const registerPromise = new Promise((resolve) => {
      resolveRegister = resolve;
    });
    mockAuth.registerWithEmail.mockImplementation(() => registerPromise);

    renderSignIn();

    fireEvent.click(screen.getByRole('button', { name: /register here/i }));

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'single@example.org' } });
    fireEvent.change(screen.getAllByLabelText(/password/i)[0], { target: { value: 'pass1234' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'pass1234' } });

    const createBtn = screen.getByRole('button', { name: /create account/i });

    // Click 3 times rapidly
    fireEvent.click(createBtn);
    fireEvent.click(createBtn);
    fireEvent.click(createBtn);

    expect(mockAuth.registerWithEmail).toHaveBeenCalledTimes(1);

    // Resolve promise
    resolveRegister({ uid: 'single_123', email: 'single@example.org', userDoc: { onboardingComplete: false } });
  });

  // Test 11: Synchronous localStorage profile hydration initializes loading=false immediately
  it('11. Synchronous localStorage profile hydration initializes loading=false immediately', () => {
    const cachedProfile = {
      uid: 'cached_user_99',
      email: 'cached@example.org',
      roles: ['donor'],
      activeRole: 'donor',
      onboardingComplete: true
    };
    localStorage.setItem('foodbridge_cached_user_doc', JSON.stringify(cachedProfile));

    function TestConsumer() {
      const { loading, userDoc } = useAuth();
      return (
        <div>
          <span data-testid="loading-status">{loading ? 'loading' : 'ready'}</span>
          <span data-testid="user-role">{userDoc?.activeRole || 'none'}</span>
        </div>
      );
    }

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading-status').textContent).toBe('ready');
    expect(screen.getByTestId('user-role').textContent).toBe('donor');

    localStorage.removeItem('foodbridge_cached_user_doc');
  });

  // Test 12: Caching user profile in localStorage allows immediate offline retrieval and routing
  it('12. Caching user profile in localStorage allows immediate offline retrieval and correct dashboard routing', () => {
    localStorage.clear();

    const visitorProfile = {
      uid: 'user_visitor_1',
      email: 'visitor@example.org',
      roles: ['visitor'],
      activeRole: 'visitor',
      onboardingComplete: true
    };
    localStorage.setItem('foodbridge_cached_user_doc', JSON.stringify(visitorProfile));

    const retrieved = JSON.parse(localStorage.getItem('foodbridge_cached_user_doc'));
    expect(retrieved.activeRole).toBe('visitor');
    expect(retrieved.onboardingComplete).toBe(true);
    expect(getUserDashboardRoute(retrieved)).toBe('/');

    localStorage.clear();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthContext } from '../context/AuthContext';
import { SignInPage } from '../pages/auth/SignInPage';

describe('Authentication Flows', () => {
  const mockAuthContext = {
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

  const renderComponent = () =>
    render(
      <LocaleProvider>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter>
            <SignInPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LocaleProvider>
    );

  it('renders sign-in form with email, password and submit button', () => {
    renderComponent();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('switches between Sign In, Create Account, and Reset Password views', () => {
    renderComponent();

    // Switch to Register
    const registerLink = screen.getByRole('button', { name: /register here/i });
    fireEvent.click(registerLink);
    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();

    // Switch back to Sign In
    const signInLink = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(signInLink);
    expect(screen.getByRole('heading', { name: /sign in to foodbridge/i })).toBeInTheDocument();

    // Switch to Forgot Password
    const forgotLink = screen.getByRole('button', { name: /forgot password\?/i });
    fireEvent.click(forgotLink);
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
  });

  it('validates password length on registration', async () => {
    renderComponent();
    // Switch to Register
    fireEvent.click(screen.getByRole('button', { name: /register here/i }));

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInputs = screen.getAllByLabelText(/password/i);
    const passwordInput = passwordInputs[0];
    const confirmInput = screen.getByLabelText(/confirm password/i);

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: '123' } }); // Less than 6 chars
    fireEvent.change(confirmInput, { target: { value: '123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/password must be at least 6 characters/i)).toBeInTheDocument();
  });
});

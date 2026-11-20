import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth, getUserDashboardRoute } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { HeartHandshake, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

export function SignInPage() {
  const { t } = useLocale();
  const { user, userDoc, loading: authLoading, loginWithEmail, registerWithEmail, loginWithGoogle, sendPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('signin'); // 'signin' | 'register' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-redirect if user is already authenticated
  useEffect(() => {
    if (!authLoading && user && userDoc) {
      const destination = location.state?.from?.pathname || getUserDashboardRoute(userDoc);
      navigate(destination, { replace: true });
    }
  }, [user, userDoc, authLoading, navigate, location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevent rapid multiple clicks

    setError('');
    setSuccessMsg('');

    if (!email || !email.includes('@')) {
      setError(t('auth.errors.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    if (mode === 'forgot') {
      try {
        setLoading(true);
        await sendPasswordReset(email);
        setSuccessMsg(t('auth.success.resetSent', 'Password reset email sent. Please check your inbox.'));
      } catch (err) {
        setError(getReadableErrorMessage(err.code));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setError(t('auth.errors.shortPassword', 'Password must be at least 6 characters'));
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch', 'Passwords do not match'));
      return;
    }

    try {
      setLoading(true);
      if (mode === 'signin') {
        const loggedUser = await loginWithEmail(email, password);
        const targetRoute = location.state?.from?.pathname || getUserDashboardRoute(loggedUser?.userDoc);
        navigate(targetRoute, { replace: true });
      } else {
        await registerWithEmail(email, password);
        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setError(getReadableErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return; // Prevent rapid multiple clicks
    setError('');
    try {
      setLoading(true);
      const loggedUser = await loginWithGoogle();
      const targetRoute = location.state?.from?.pathname || getUserDashboardRoute(loggedUser?.userDoc);
      navigate(targetRoute, { replace: true });
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(getReadableErrorMessage(err.code));
      }
    } finally {
      setLoading(false);
    }
  };

  const getReadableErrorMessage = (code) => {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return t('auth.errors.invalidCredentials', 'Incorrect email or password.');
      case 'auth/email-already-in-use':
        return t('auth.errors.emailInUse', 'This email is already registered. Please sign in instead.');
      case 'auth/too-many-requests':
        return t('auth.errors.tooManyRequests', 'Too many attempts. Please wait a moment and try again.');
      case 'auth/weak-password':
        return t('auth.errors.weakPassword', 'Please choose a stronger password (at least 6 characters).');
      default:
        return t('auth.errors.generic', 'Authentication failed. Please verify your details.');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-20">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('auth.backHome', 'Back to Home')}</span>
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brand-800 text-white flex items-center justify-center">
            <HeartHandshake className="w-5 h-5 text-brand-100" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              {mode === 'signin' && t('auth.signInTitle', 'Sign In')}
              {mode === 'register' && t('auth.registerTitle', 'Create Account')}
              {mode === 'forgot' && t('auth.forgotTitle', 'Reset Password')}
            </h1>
            <p className="text-xs text-stone-500">
              {mode === 'signin' && t('auth.signInSubtitle', 'Access your FoodBridge account')}
              {mode === 'register' && t('auth.registerSubtitle', 'Join the Karnataka redistribution network')}
              {mode === 'forgot' && t('auth.forgotSubtitle', 'Enter your email to receive a password reset link')}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-start gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="auth-email"
            type="email"
            label={t('auth.email', 'Email Address')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coordinator@organization.org"
            required
            autoComplete="email"
          />

          {mode !== 'forgot' && (
            <Input
              id="auth-password"
              type="password"
              label={t('auth.password', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          )}

          {mode === 'register' && (
            <Input
              id="auth-confirm-password"
              type="password"
              label={t('auth.confirmPassword', 'Confirm Password')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          )}

          {mode === 'signin' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
                className="text-xs text-stone-600 hover:text-brand-800 font-medium"
              >
                {t('auth.forgotPasswordLink', 'Forgot password?')}
              </button>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={loading}
            size="md"
          >
            {mode === 'signin' && t('auth.signInBtn', 'Sign In')}
            {mode === 'register' && t('auth.createAccountBtn', 'Create Account')}
            {mode === 'forgot' && t('auth.sendResetBtn', 'Send Reset Link')}
          </Button>
        </form>

        {/* Optional Google Sign-In */}
        {mode !== 'forgot' && (
          <div className="mt-5 pt-5 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              size="md"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="text-stone-700"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.37 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.98 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>{t('auth.googleSignIn', 'Continue with Google')}</span>
            </Button>
          </div>
        )}

        {/* Mode Toggle footer */}
        <div className="mt-6 pt-4 border-t border-border/80 text-center text-xs text-stone-600">
          {mode === 'signin' && (
            <p>
              {t('auth.noAccount', "Don't have an account?")}{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                className="font-semibold text-brand-800 hover:underline ml-1"
              >
                {t('auth.registerNow', 'Register here')}
              </button>
            </p>
          )}

          {mode === 'register' && (
            <p>
              {t('auth.alreadyAccount', 'Already registered?')}{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); setSuccessMsg(''); }}
                className="font-semibold text-brand-800 hover:underline ml-1"
              >
                {t('auth.signInNow', 'Sign in')}
              </button>
            </p>
          )}

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); setSuccessMsg(''); }}
              className="font-semibold text-brand-800 hover:underline"
            >
              {t('auth.backToSignIn', 'Back to Sign In')}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { ShieldAlert, Clock, AlertCircle } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

export function ProtectedRoute({
  children,
  requireAdmin = false,
  allowedRoles = null,
  requireVerified = false
}) {
  const { user, userDoc, profileData, loading, isAdmin, isVerified } = useAuth();
  const { t } = useLocale();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-stone-600">
          <div className="w-8 h-8 border-3 border-brand-800 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  // 1. Must be signed in
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  // 2. Must complete onboarding before accessing operational dashboards
  if (userDoc && !userDoc.onboardingComplete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // 3. Admin-only check
  if (requireAdmin && !isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <Card className="p-8 text-center border-red-200 bg-red-50/20">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">
            Administrator Access Required
          </h2>
          <p className="text-sm text-stone-600 mb-6 leading-relaxed">
            This verification workspace is restricted to authorized platform administrators. Regular participants cannot access this audit console.
          </p>
          <Button variant="primary" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  // 4. Allowed roles check
  if (allowedRoles && userDoc) {
    const hasRole = allowedRoles.some((role) =>
      userDoc.roles?.includes(role) || userDoc.activeRole === role || isAdmin
    );
    if (!hasRole) {
      const isVisitor = userDoc.activeRole === 'visitor' || (userDoc.roles?.includes('visitor') && userDoc.roles?.length === 1);
      return (
        <div className="max-w-md mx-auto px-4 py-20">
          <Card className="p-8 text-center border-amber-200">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">
              {isVisitor ? 'Participation Role Required' : 'Role Access Restricted'}
            </h2>
            <p className="text-sm text-stone-600 mb-6 leading-relaxed">
              {isVisitor
                ? 'You are currently exploring FoodBridge in Visitor mode. To create surplus food listings, accept food donations, or provide delivery assistance, please select an active operational role.'
                : 'Your active role does not have permission to view this section. You can switch your active role in your account settings if you have multiple roles.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="outline" onClick={() => (window.location.href = '/')}>
                Explore FoodBridge
              </Button>
              <Button variant="primary" onClick={() => (window.location.href = '/settings')}>
                {isVisitor ? 'Select Active Role' : 'Account Settings'}
              </Button>
            </div>
          </Card>
        </div>
      );
    }
  }

  // 5. Verification required check (for pending recipients or unverified delivery partners)
  if (requireVerified && !isVerified) {
    const status = profileData?.verificationStatus || 'pending';
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <Card className="p-8 text-center border-amber-200">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">
            Verification In Progress
          </h2>
          <p className="text-sm text-stone-600 mb-4 leading-relaxed">
            Your organization details are currently under review by our community administrators. In accordance with food safety standards, donations cannot be accepted until verification is complete.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 mb-6">
            Status: {status.toUpperCase()}
          </div>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => (window.location.href = '/settings')}>
              View Account Settings
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return children;
}

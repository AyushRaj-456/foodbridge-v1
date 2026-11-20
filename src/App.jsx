import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LocaleProvider } from './context/LocaleContext';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { SignInPage } from './pages/auth/SignInPage';
import { OnboardingFlow } from './pages/onboarding/OnboardingFlow';
import { ProfileSettingsPage } from './pages/profile/ProfileSettingsPage';
import { AdminVerificationPage } from './pages/admin/AdminVerificationPage';
import { DonorDashboardPage } from './pages/donor/DonorDashboardPage';
import { CreateListingPage } from './pages/donor/CreateListingPage';
import { RecipientDashboardPage } from './pages/recipient/RecipientDashboardPage';
import { DeliveryDashboardPage } from './pages/delivery/DeliveryDashboardPage';
import { SupportPage } from './pages/support/SupportPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/support" element={<SupportPage />} />

              {/* Onboarding & Common Profile */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <OnboardingFlow />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <ProfileSettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Donor Routes */}
              <Route
                path="/donor/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['donor']}>
                    <DonorDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/listings"
                element={<Navigate to="/donor/dashboard" replace />}
              />
              <Route
                path="/listings/create"
                element={
                  <ProtectedRoute allowedRoles={['donor']}>
                    <CreateListingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/listings/edit/:id"
                element={
                  <ProtectedRoute allowedRoles={['donor']}>
                    <CreateListingPage />
                  </ProtectedRoute>
                }
              />

              {/* Recipient Routes */}
              <Route
                path="/recipient/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['recipient']}>
                    <RecipientDashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Delivery Partner Routes */}
              <Route
                path="/delivery/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['delivery']}>
                    <DeliveryDashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Admin Protected Route */}
              <Route
                path="/admin"
                element={<Navigate to="/admin/verification" replace />}
              />
              <Route
                path="/admin/verification"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminVerificationPage />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </AuthProvider>
    </LocaleProvider>
  );
}

export default App;

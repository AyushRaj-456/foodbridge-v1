import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { LanguageSelector } from '../language/LanguageSelector';
import { NotificationBell } from '../notifications/NotificationBell';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  HeartHandshake,
  Menu,
  X,
  User,
  ChevronDown,
  LogOut,
  Settings,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Building2,
  Truck,
  Coffee,
  Compass
} from 'lucide-react';

export function Navbar() {
  const { t } = useLocale();
  const { user, userDoc, profileData, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = async () => {
    setProfileDropdownOpen(false);
    setMobileMenuOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  }, [location.pathname]);

  // Click outside to close profile dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeRole = userDoc?.activeRole || userDoc?.roles?.[0] || 'donor';
  const verificationStatus = profileData?.verificationStatus || 'pending';

  const navLinks = [
    { href: '/', label: t('nav.home', 'Home') },
    { href: '/#how-it-works', label: t('nav.howItWorks', 'How it works') },
    { href: '/#recipients', label: t('nav.recipients', 'Recipients') },
    { href: '/#impact', label: t('nav.impact', 'Impact') },
    ...(activeRole !== 'recipient' ? [{ href: '/support', label: t('nav.support', 'Support Us') }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-border transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo / Brand Mark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-stone-900 hover:text-brand-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-md py-1"
            aria-label="FoodBridge Home"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-800 text-white flex items-center justify-center shadow-sm">
              <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6 text-brand-100" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-xl tracking-tight leading-none text-stone-900">
                {t('nav.mark', 'FoodBridge')}
              </span>
              <span className="text-[10px] text-stone-500 font-medium tracking-wide uppercase mt-0.5">
                Karnataka
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-stone-700 hover:text-brand-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-md px-1 py-0.5"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right actions: Language Selector & Auth status */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSelector />
            {user && <NotificationBell />}

            {!user ? (
              <>
                <Link to="/signin">
                  <Button variant="outline" size="sm">
                    {t('nav.signIn', 'Sign in')}
                  </Button>
                </Link>
                <Link to="/signin">
                  <Button variant="primary" size="sm">
                    {t('nav.donateFood', 'Donate food')}
                  </Button>
                </Link>
              </>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  aria-haspopup="true"
                  aria-expanded={profileDropdownOpen}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-brand-700"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-900 flex items-center justify-center text-xs font-bold">
                    {user.email ? user.email[0].toUpperCase() : 'U'}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-bold text-stone-900 capitalize">
                      {isAdmin ? 'Admin' : activeRole}
                    </span>
                    {(activeRole === 'recipient' || activeRole === 'delivery') && !isAdmin && (
                      <span className="text-[10px] text-stone-500 capitalize flex items-center gap-1">
                        {verificationStatus === 'verified' ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                        ) : (
                          <Clock className="w-2.5 h-2.5 text-amber-600" />
                        )}
                        {verificationStatus}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-border shadow-lg py-1.5 z-50 text-xs animate-in fade-in-50 duration-150">
                    <div className="px-3.5 py-2 border-b border-border">
                      <p className="font-semibold text-stone-900 truncate">{user.email}</p>
                      <p className="text-[11px] text-stone-500 capitalize mt-0.5">Role: {activeRole}</p>
                    </div>

                    <Link
                      to="/settings"
                      className="flex items-center gap-2 px-3.5 py-2.5 text-stone-700 hover:bg-surface-muted transition-colors"
                    >
                      <Settings className="w-4 h-4 text-stone-400" />
                      <span>Account Settings</span>
                    </Link>

                    {activeRole === 'donor' && (
                      <Link
                        to="/donor/dashboard"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-brand-900 hover:bg-brand-50 transition-colors font-semibold"
                      >
                        <HeartHandshake className="w-4 h-4 text-brand-700" />
                        <span>Donor Dashboard</span>
                      </Link>
                    )}

                    {activeRole === 'recipient' && (
                      <Link
                        to="/recipient/dashboard"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-amber-900 hover:bg-amber-50 transition-colors font-semibold"
                      >
                        <Building2 className="w-4 h-4 text-amber-700" />
                        <span>Recipient Dashboard</span>
                      </Link>
                    )}

                    {activeRole === 'delivery' && (
                      <Link
                        to="/delivery/dashboard"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-blue-900 hover:bg-blue-50 transition-colors font-semibold"
                      >
                        <Truck className="w-4 h-4 text-blue-700" />
                        <span>Delivery Dashboard</span>
                      </Link>
                    )}

                    {activeRole === 'visitor' && (
                      <Link
                        to="/support"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-amber-900 hover:bg-amber-50 transition-colors font-semibold"
                      >
                        <Coffee className="w-4 h-4 text-amber-700" />
                        <span>Support FoodBridge</span>
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin/verification"
                        className="flex items-center gap-2 px-3.5 py-2.5 text-red-700 hover:bg-red-50 transition-colors font-semibold"
                      >
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span>Admin Verification</span>
                      </Link>
                    )}

                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left flex items-center gap-2 px-3.5 py-2 text-stone-700 hover:bg-red-50 hover:text-red-700 transition-colors"
                      >
                        <LogOut className="w-4 h-4 text-stone-400" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu trigger button */}
          <div className="flex items-center gap-2 md:hidden">
            <LanguageSelector />
            {user && <NotificationBell />}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-stone-700 hover:text-stone-900 hover:bg-surface-muted rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              aria-label={t('nav.toggleMenu', 'Toggle navigation menu')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-white px-4 pt-3 pb-6 animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col gap-3" aria-label="Mobile Navigation">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-base font-medium text-stone-800 hover:text-brand-800 py-2 border-b border-border/50"
              >
                {link.label}
              </a>
            ))}

            {!user ? (
              <div className="flex flex-col gap-2.5 pt-3">
                <Link to="/signin" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" fullWidth size="md">
                    {t('nav.signIn', 'Sign in')}
                  </Button>
                </Link>
                <Link to="/signin" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" fullWidth size="md">
                    {t('nav.donateFood', 'Donate food')}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-3">
                <div className="p-3 rounded-lg bg-surface-muted text-xs text-stone-600 mb-2">
                  <span className="font-bold text-stone-900 block truncate">{user.email}</span>
                  <span className="capitalize">Role: {activeRole}</span>
                </div>
                <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" fullWidth size="md">
                    Account Settings
                  </Button>
                </Link>
                {activeRole === 'donor' && (
                  <Link to="/donor/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth size="md">
                      Donor Dashboard
                    </Button>
                  </Link>
                )}
                {activeRole === 'recipient' && (
                  <Link to="/recipient/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth size="md">
                      Recipient Dashboard
                    </Button>
                  </Link>
                )}
                {activeRole === 'delivery' && (
                  <Link to="/delivery/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth size="md">
                      Delivery Dashboard
                    </Button>
                  </Link>
                )}
                {activeRole === 'visitor' && (
                  <Link to="/support" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth size="md">
                      Support FoodBridge
                    </Button>
                  </Link>
                )}
                {isAdmin && (
                  <Link to="/admin/verification" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth size="md">
                      Admin Verification Console
                    </Button>
                  </Link>
                )}
                <Button variant="danger" fullWidth size="md" onClick={handleLogout}>
                  Sign Out
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

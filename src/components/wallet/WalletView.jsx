import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { PaymentModal } from '../support/PaymentModal';
import { RedemptionModal } from './RedemptionModal';
import { getUserWallet, getRedemptionRequests } from '../../services/walletService';
import {
  getSupportTransactions,
  getUserMembershipPeriods,
  cancelMembershipPeriod,
  parseDate
} from '../../services/membershipService';
import {
  Coins,
  Sparkles,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Coffee,
  HelpCircle,
  Layers,
  Calendar,
  XCircle,
  Ban,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  SlidersHorizontal,
  RotateCcw,
  Check,
  ArrowRight,
  FlaskConical
} from 'lucide-react';

export function WalletView({ role = 'donor', onNavigateToHistory }) {
  const { user, userDoc, isAdmin } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [supportTxns, setSupportTxns] = useState([]);
  const [membershipPeriods, setMembershipPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchDetails, setSelectedBatchDetails] = useState(null);

  // Authorization for Demo Mode (strictly restricted to administrators and authorized testers)
  const isAuthorizedTester = Boolean(
    isAdmin ||
    userDoc?.isAdmin ||
    userDoc?.isTester ||
    userDoc?.roles?.includes('admin') ||
    userDoc?.roles?.includes('tester')
  );

  // Demo Mode state: defaults to false (Normal Mode). Persisted in localStorage for authorized testers.
  const [demoMode, setDemoMode] = useState(() => {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    try {
      const stored = window.localStorage.getItem('foodbridge_demo_mode');
      return stored === 'true';
    } catch (e) {
      return false;
    }
  });

  // Security guard: If user is not authorized, force demoMode strictly to false
  const activeDemoMode = isAuthorizedTester && demoMode;

  const handleToggleDemoMode = () => {
    if (!isAuthorizedTester) return;
    const nextVal = !demoMode;
    setDemoMode(nextVal);
    try {
      window.localStorage.setItem('foodbridge_demo_mode', String(nextVal));
    } catch (e) {}
  };

  // Modals & Subtabs
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('schedule'); // 'schedule' | 'contributions' | 'batches' | 'redemptions'

  // Interactive timeline accordion
  const [expandedPeriodId, setExpandedPeriodId] = useState(null);

  // Notifications
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Payment History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [txFilter, setTxFilter] = useState('all'); // 'all' | 'completed' | 'failed' | 'cancelled'
  const [methodFilter, setMethodFilter] = useState('all'); // 'all' | 'card' | 'upi' | 'net_banking'
  const [purposeFilter, setPurposeFilter] = useState('all'); // 'all' | 'memberships' | 'coffee'
  const [datePreset, setDatePreset] = useState('all'); // 'all' | '30' | '90'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'

  // Cancellation modal state
  const [cancellingPeriod, setCancellingPeriod] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('Donor requested cancellation');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWalletData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setErrorNotice('');
      const [wData, rData, sData, pData] = await Promise.all([
        getUserWallet(undefined, user.uid),
        getRedemptionRequests(undefined, { userId: user.uid, limitCount: 50 }),
        getSupportTransactions(undefined, { userId: user.uid, limitCount: 50 }),
        getUserMembershipPeriods(undefined, user.uid)
      ]);
      setWallet(wData);
      setRedemptions(rData);
      setSupportTxns(sData);
      setMembershipPeriods(pData);
    } catch (err) {
      console.warn('Error fetching wallet view data:', err.message);
      setErrorNotice('Notice loading wallet data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, [user?.uid]);

  const membership = wallet?.membership;
  const isMemberActive = Boolean(membership?.isActive);
  const availableTokens = wallet?.availableTokens || 0;
  const batches = wallet?.batches || [];

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Evaluate and classify all membership passes from actual Firestore records
  const sortedPeriods = [...membershipPeriods].sort((a, b) => {
    const sA = parseDate(a.startDate)?.getTime() || a.timestampMs || 0;
    const sB = parseDate(b.startDate)?.getTime() || b.timestampMs || 0;
    return sA - sB;
  });

  const evaluatedPeriods = sortedPeriods.map((p) => {
    const sDate = parseDate(p.startDate);
    const eDate = parseDate(p.expiryDate);
    const pDate = parseDate(p.purchaseDate || p.createdAt);
    const sTime = sDate ? sDate.getTime() : 0;
    const eTime = eDate ? eDate.getTime() : 0;
    const isCancelled = Boolean(p.isCancelled || p.status === 'cancelled' || p.status === 'active_cancelled');

    let status = p.status || 'active';
    if (p.status === 'cancelled') {
      status = 'cancelled';
    } else if (now >= sTime && now < eTime) {
      status = isCancelled ? 'active_cancelled' : 'active';
    } else if (sTime > now && !isCancelled) {
      status = 'upcoming';
    } else if (eTime <= now) {
      status = 'expired';
    }

    return {
      ...p,
      sDate,
      eDate,
      pDate,
      sTime,
      eTime,
      computedStatus: status,
      isCancelled
    };
  });

  // A. Current Membership pass
  const activePeriod = evaluatedPeriods.find(
    (p) => now >= p.sTime && now < p.eTime && p.computedStatus !== 'cancelled'
  );

  // B. Upcoming Queued passes with explicit Queue order
  const upcomingPeriods = evaluatedPeriods
    .filter((p) => p.computedStatus === 'upcoming')
    .map((up, idx) => ({ ...up, queueOrder: idx + 1 }));

  const nextUpcomingPass = upcomingPeriods.length > 0 ? upcomingPeriods[0] : null;

  // C. Total Membership Coverage calculation
  const validFuturePeriods = evaluatedPeriods.filter(
    (p) => p.eTime > now && p.computedStatus !== 'cancelled'
  );
  const calculatedTotalExpiryTime = validFuturePeriods.reduce(
    (max, p) => Math.max(max, p.eTime),
    activePeriod ? activePeriod.eTime : 0
  );
  const totalCoverageExpiry = calculatedTotalExpiryTime > 0
    ? new Date(calculatedTotalExpiryTime)
    : (membership?.totalCoverage?.finalExpiryDate ? parseDate(membership.totalCoverage.finalExpiryDate) : parseDate(membership?.expiresAt));

  const totalCoverageDays = totalCoverageExpiry
    ? Math.max(0, Math.ceil((totalCoverageExpiry.getTime() - now) / MS_PER_DAY))
    : (membership?.totalCoverage?.totalDaysRemaining || 0);

  // Current pass days remaining: strictly capped to <= 30 days
  const currentPassDaysRemaining = activePeriod
    ? Math.max(0, Math.ceil((activePeriod.eTime - now) / MS_PER_DAY))
    : (membership?.currentMembership?.daysRemaining || (isMemberActive ? Math.min(30, membership?.daysRemaining || 0) : 0));

  // Current active plan name
  const currentPlanName = activePeriod?.planName
    || membership?.currentMembership?.planName
    || membership?.planDetails?.name
    || (isMemberActive ? 'Active Donor Member' : 'No Active Membership');

  // Current reward rate
  const currentRewardRate = activePeriod?.planId === 'corridor_help' || membership?.activePlan === 'corridor_help'
    ? 6
    : (membership?.currentMembership?.rewardRatePer100 || membership?.redemptionRatePer100 || 2);

  // Handle cancellation action
  const handleConfirmCancel = async () => {
    if (!cancellingPeriod || actionLoading) return;
    try {
      setActionLoading(true);
      setErrorNotice('');
      const res = await cancelMembershipPeriod(undefined, {
        userId: user.uid,
        periodId: cancellingPeriod.periodId || cancellingPeriod.id,
        cancellationReason: cancellationReason || 'Donor requested cancellation'
      });
      setNotice(res.message || 'Membership pass updated successfully.');
      setCancellingPeriod(null);
      await fetchWalletData();
    } catch (err) {
      console.error('Cancellation error:', err);
      setErrorNotice('Failed to cancel membership pass: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Payment History Filtered Transactions
  const filteredTxns = supportTxns
    .filter((tx) => {
      // 1. Status filter
      const status = tx.paymentStatus || 'completed';
      if (txFilter !== 'all' && status !== txFilter) return false;

      // 2. Method filter
      if (methodFilter !== 'all' && tx.paymentMethod !== methodFilter) return false;

      // 3. Purpose filter
      if (purposeFilter === 'memberships' && !tx.activatesMembership) return false;
      if (purposeFilter === 'coffee' && tx.activatesMembership) return false;

      // 4. Date preset filter
      if (datePreset !== 'all') {
        const txTime = tx.timestampMs || parseDate(tx.createdAt)?.getTime() || 0;
        const daysAgo = (now - txTime) / MS_PER_DAY;
        if (datePreset === '30' && daysAgo > 30) return false;
        if (datePreset === '90' && daysAgo > 90) return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const txId = (tx.transactionId || tx.id || '').toLowerCase();
        const pName = (tx.planName || '').toLowerCase();
        const method = (tx.paymentMethod || '').toLowerCase();
        const pId = (tx.periodId || '').toLowerCase();
        if (!txId.includes(q) && !pName.includes(q) && !method.includes(q) && !pId.includes(q)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const tA = a.timestampMs || parseDate(a.createdAt)?.getTime() || 0;
      const tB = b.timestampMs || parseDate(b.createdAt)?.getTime() || 0;
      return sortOrder === 'asc' ? tA - tB : tB - tA;
    });

  const hasActiveFilters = txFilter !== 'all' || methodFilter !== 'all' || purposeFilter !== 'all' || datePreset !== 'all' || searchQuery.trim().length > 0 || sortOrder !== 'desc';

  const resetFilters = () => {
    setSearchQuery('');
    setTxFilter('all');
    setMethodFilter('all');
    setPurposeFilter('all');
    setDatePreset('all');
    setSortOrder('desc');
  };

  // KPI Calculations (Computed strictly from actual user Firestore records)
  const completedTxns = supportTxns.filter((t) => (t.paymentStatus || 'completed') === 'completed');
  const membershipTxns = completedTxns.filter((t) => t.activatesMembership);
  const coffeeTxns = completedTxns.filter((t) => !t.activatesMembership);

  const totalSpentOnMemberships = membershipTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalCoffeeSpent = coffeeTxns.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalSpentAll = totalSpentOnMemberships + totalCoffeeSpent;

  return (
    <div className="space-y-6">
      {/* Authorized Tester Banner when Demo Mode is Active */}
      {activeDemoMode && (
        <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold uppercase tracking-wider text-[11px] px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 border border-amber-300">
                Demo Testing Mode Active
              </span>
              <span className="text-amber-900">
                Simulation metrics and testing indicators are visible for authorized tester accounts. Real user records remain isolated.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleDemoMode}
            className="text-amber-900 hover:text-amber-950 font-bold underline text-xs shrink-0 self-start sm:self-auto"
          >
            Switch to Normal Mode
          </button>
        </div>
      )}

      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span className="font-medium">{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-emerald-800 hover:text-emerald-950 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-950 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <span className="font-medium">{errorNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorNotice('')}
            className="text-red-800 hover:text-red-950 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. MEMBERSHIP OVERVIEW SECTION (CONSISTENT FOODBRIDGE BRANDING & WCAG AAA CONTRAST) */}
      <Card className="p-5 sm:p-6 bg-white border border-border shadow-sm rounded-2xl">
        <div className="space-y-5">
          {/* Top Bar: Title, Status, Action Buttons, and Demo Mode Toggle */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/80 pb-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800 block mb-1">
                Support Membership Overview
              </span>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900">
                  {currentPlanName}
                </h2>

                {/* Status Badges with High Contrast */}
                {isMemberActive ? (
                  activePeriod?.isCancelled || membership?.isCancelled ? (
                    <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 shadow-sm">
                      NON-RENEWING
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm">
                      ACTIVE
                    </span>
                  )
                ) : nextUpcomingPass ? (
                  <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-900 border border-brand-300 shadow-sm">
                    SCHEDULED
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-800 border border-stone-300 shadow-sm">
                    INACTIVE
                  </span>
                )}

                {activeDemoMode && (
                  <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                    TESTING MODE
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-auto">
              {/* Authorized Demo Mode Toggle */}
              {isAuthorizedTester && (
                <button
                  type="button"
                  onClick={handleToggleDemoMode}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    activeDemoMode
                      ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-sm'
                      : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                  title={activeDemoMode ? 'Click to disable Demo Mode' : 'Click to enable Demo Mode (Tester)'}
                >
                  <FlaskConical className={`w-3.5 h-3.5 ${activeDemoMode ? 'text-amber-700' : 'text-stone-500'}`} />
                  <span>Demo Mode: {activeDemoMode ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {/* Refresh Balance Button */}
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-stone-50 text-stone-700 border-stone-300 text-xs px-3 py-1.5 font-medium shadow-none"
                onClick={fetchWalletData}
                disabled={loading}
                title="Refresh balance and periods"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </Button>

              {/* Primary Action Button */}
              <Button
                variant="primary"
                size="sm"
                className="bg-brand-800 hover:bg-brand-700 text-white font-semibold text-xs px-4 py-1.5 shadow-sm border-none"
                onClick={() => setShowPaymentModal(true)}
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                <span>{isMemberActive ? 'Add 30-Day Pass (Stack)' : 'Join Support Membership'}</span>
              </Button>
            </div>
          </div>

          {/* Three Sub-Cards: Current Pass, Upcoming Passes, Total Coverage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* BLOCK A: CURRENT MEMBERSHIP PASS */}
            <div className="p-4 rounded-xl bg-white border-2 border-brand-700/25 shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">
                    A. Current Active Pass
                  </span>
                  <Clock className="w-3.5 h-3.5 text-brand-700" />
                </div>

                {isMemberActive ? (
                  <div className="space-y-1">
                    <div className="text-xl font-extrabold text-stone-900 flex items-baseline gap-1.5">
                      <span>{currentPassDaysRemaining} Days</span>
                      <span className="text-xs text-stone-600 font-medium">remaining</span>
                    </div>
                    <p className="text-xs text-stone-800 font-mono font-medium">
                      {activePeriod?.sDate ? activePeriod.sDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Active'} →{' '}
                      {activePeriod?.eDate ? activePeriod.eDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '30-Day Cycle'}
                    </p>
                    <p className="text-xs text-brand-800 font-semibold pt-1">
                      Rate: ₹{currentRewardRate} / 100 tokens (10 tokens per 2 kg donated)
                    </p>
                  </div>
                ) : nextUpcomingPass ? (
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-amber-900 block">Current Pass Expired</span>
                    <p className="text-xs text-stone-700">
                      Previous pass completed. Next pass activates on{' '}
                      <strong className="text-stone-900">
                        {nextUpcomingPass.sDate ? nextUpcomingPass.sDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'scheduled date'}
                      </strong>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-stone-800 block">No Active Pass</span>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Support memberships activate reward token earning for verified completed food donation handovers.
                    </p>
                  </div>
                )}
              </div>

              {isMemberActive && activePeriod && !activePeriod.isCancelled && (
                <button
                  type="button"
                  onClick={() => setCancellingPeriod(activePeriod)}
                  className="text-xs text-red-700 hover:text-red-900 text-left underline font-medium transition-colors pt-1"
                >
                  {activeDemoMode ? 'Cancel active pass (simulation)' : 'Cancel active pass'}
                </button>
              )}
            </div>

            {/* BLOCK B: UPCOMING MEMBERSHIPS */}
            <div className="p-4 rounded-xl bg-white border border-border shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                    B. Upcoming Memberships
                  </span>
                  <Layers className="w-3.5 h-3.5 text-stone-600" />
                </div>

                {upcomingPeriods.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-xl font-extrabold text-stone-900 flex items-baseline gap-1.5">
                      <span>{upcomingPeriods.length} Queued Pass{upcomingPeriods.length > 1 ? 'es' : ''}</span>
                    </div>
                    <div className="text-xs text-stone-900 font-bold">
                      Queue #1: {nextUpcomingPass.planName}
                    </div>
                    <p className="text-xs text-stone-700 font-mono">
                      Starts: {nextUpcomingPass.sDate ? nextUpcomingPass.sDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Scheduled'}
                    </p>
                    <p className="text-xs text-stone-600">
                      Expires: {nextUpcomingPass.eDate ? nextUpcomingPass.eDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Scheduled'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-stone-800 block">0 Passes Queued</span>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Multiple passes stack consecutively without overlap. Additional passes activate on the exact day the current pass expires.
                    </p>
                  </div>
                )}
              </div>

              <div className="text-xs text-stone-600 pt-1 font-medium">
                {upcomingPeriods.length > 0 ? (
                  <span className="text-brand-800">Activates automatically upon cycle completion</span>
                ) : (
                  <span>Ready for consecutive extension</span>
                )}
              </div>
            </div>

            {/* BLOCK C: TOTAL MEMBERSHIP COVERAGE */}
            <div className="p-4 rounded-xl bg-brand-50/70 border border-brand-200 shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-900">
                    C. Total Coverage
                  </span>
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-800" />
                </div>

                <div className="space-y-1">
                  <div className="text-xl font-extrabold text-brand-950 flex items-baseline gap-1.5">
                    <span>{totalCoverageDays} Days</span>
                    <span className="text-xs text-brand-800 font-medium">total coverage</span>
                  </div>
                  {totalCoverageExpiry && totalCoverageDays > 0 ? (
                    <p className="text-xs text-brand-900 font-medium">
                      Coverage valid through{' '}
                      <strong className="text-stone-900">
                        {totalCoverageExpiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </strong>
                    </p>
                  ) : (
                    <p className="text-xs text-stone-600">No scheduled membership coverage.</p>
                  )}
                  <p className="text-xs text-brand-800 pt-1 font-medium">
                    {(activePeriod ? 1 : 0) + upcomingPeriods.length} pass{((activePeriod ? 1 : 0) + upcomingPeriods.length) === 1 ? '' : 'es'} stacked consecutively.
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('schedule')}
                  className="text-xs text-brand-800 hover:text-brand-950 flex items-center gap-1 font-bold transition-colors"
                >
                  <span>View Timeline Schedule</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. MEMBERSHIP STATISTICS ROW (WCAG COMPLIANT, NO CLASHING COLORS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
        {/* Available Tokens */}
        <Card className="p-3.5 sm:p-4 border-emerald-300 bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Available Tokens</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-900 font-mono mt-1">
            {availableTokens}
          </div>
          <span className="text-xs text-emerald-800 font-medium block mt-0.5">Ready to redeem</span>
        </Card>

        {/* Est. Redeemable Value */}
        <Card className="p-3.5 sm:p-4 border-brand-300 bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Redeemable Value</span>
          <div className="text-xl sm:text-2xl font-extrabold text-brand-900 font-mono mt-1">
            ₹{wallet?.estimatedRedeemableValue || 0}
          </div>
          <span className="text-xs text-brand-800 font-medium block mt-0.5">Plan FIFO rate</span>
        </Card>

        {/* Total Support Spent */}
        <Card className="p-3.5 sm:p-4 border-border bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">
            {activeDemoMode ? 'Total Demo Spent' : 'Total Contributions'}
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-stone-900 font-mono mt-1">
            ₹{totalSpentAll}
          </div>
          <span className="text-xs text-stone-600 font-medium block mt-0.5">
            {activeDemoMode ? `${completedTxns.length} verified demo txns` : `${completedTxns.length} contributions`}
          </span>
        </Card>

        {/* Membership Passes */}
        <Card className="p-3.5 sm:p-4 border-border bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Membership Passes</span>
          <div className="text-xl sm:text-2xl font-extrabold text-stone-900 font-mono mt-1">
            {membershipTxns.length}
          </div>
          <span className="text-xs text-stone-600 font-medium block mt-0.5">₹{totalSpentOnMemberships} spent</span>
        </Card>

        {/* Coffee Contributions */}
        <Card className="p-3.5 sm:p-4 border-border bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Coffee Support</span>
          <div className="text-xl sm:text-2xl font-extrabold text-stone-900 font-mono mt-1">
            {coffeeTxns.length}
          </div>
          <span className="text-xs text-stone-600 font-medium block mt-0.5">₹{totalCoffeeSpent} voluntary</span>
        </Card>

        {/* Active & Queued */}
        <Card className="p-3.5 sm:p-4 border-border bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Active & Queued</span>
          <div className="text-xl sm:text-2xl font-extrabold text-stone-900 font-mono mt-1">
            {(activePeriod ? 1 : 0) + upcomingPeriods.length}
          </div>
          <span className="text-xs text-stone-600 font-medium block mt-0.5">{upcomingPeriods.length} in queue</span>
        </Card>

        {/* Total Coverage */}
        <Card className="p-3.5 sm:p-4 border-brand-200 bg-white shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block">Total Coverage</span>
          <div className="text-xl sm:text-2xl font-extrabold text-brand-900 font-mono mt-1">
            {totalCoverageDays}d
          </div>
          <span className="text-xs text-stone-600 font-medium block mt-0.5 truncate" title={totalCoverageExpiry ? totalCoverageExpiry.toLocaleDateString() : 'None'}>
            {totalCoverageExpiry ? `Until ${totalCoverageExpiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No coverage'}
          </span>
        </Card>
      </div>

      {/* 3. ACTION BAR: REDEEM TOKENS CTA */}
      <div className="p-4 sm:p-5 rounded-2xl bg-brand-50/50 border border-brand-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <h4 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-brand-800" />
            <span>Redeem Tokens for Monetary Rewards</span>
          </h4>
          <p className="text-xs text-stone-700 mt-0.5 leading-relaxed">
            {isMemberActive
              ? 'Minimum redemption: 100 tokens (multiples of 100). Payout calculated via FIFO based on the plan under which each token was earned.'
              : 'An active support membership is required to submit token redemption requests. Your existing tokens remain safely preserved in your wallet.'}
          </p>
        </div>

        <div>
          <Button
            variant="primary"
            size="md"
            disabled={!isMemberActive || availableTokens < 100}
            onClick={() => setShowRedeemModal(true)}
            className="w-full sm:w-auto justify-center bg-brand-800 hover:bg-brand-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-sm border-none"
          >
            <Coins className="w-4 h-4 mr-1.5" />
            <span>Redeem Tokens</span>
          </Button>
        </div>
      </div>

      {/* 4. SUBTABS CARD */}
      <Card className="p-5 sm:p-6 space-y-4 bg-white border border-border shadow-sm rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveSubTab('schedule')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'schedule'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Membership Schedule ({membershipPeriods.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('contributions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'contributions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Payment History ({supportTxns.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('batches')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'batches'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Reward Ledger ({batches.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('redemptions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'redemptions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Redemptions ({redemptions.length})</span>
            </button>
          </div>

          <span className="text-xs text-stone-600 hidden sm:inline font-semibold">
            {activeDemoMode ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 font-bold text-[10px]">
                DEMO MODE ACTIVE
              </span>
            ) : (
              'Consecutive Stacking Active'
            )}
          </span>
        </div>

        {/* ============================================================== */}
        {/* SUBTAB 1: MEMBERSHIP SCHEDULE & TIMELINE                      */}
        {/* ============================================================== */}
        {activeSubTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-stone-900">Membership Timeline & Pass Breakdown</h4>
                <p className="text-xs text-stone-600">
                  Each pass provides 30 calendar days of consecutive coverage without gaps or overlapping days.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPaymentModal(true)}
                className="bg-white hover:bg-stone-50 text-stone-800 border-stone-300 text-xs self-start sm:self-auto font-medium"
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                <span>Purchase 30-Day Pass</span>
              </Button>
            </div>

            {evaluatedPeriods.length === 0 ? (
              <div className="py-12 text-center space-y-3 text-stone-600 text-xs">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-500">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-stone-900 text-sm">No membership passes recorded yet</p>
                  <p className="text-xs text-stone-600 max-w-sm mx-auto mt-1 leading-relaxed">
                    Purchasing a Fuel Support or Corridor Help plan creates consecutive 30-day passes. Multiple purchases extend coverage consecutively.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="mt-2 bg-brand-800 hover:bg-brand-700 text-white font-semibold text-xs"
                >
                  Explore Support Plans
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {evaluatedPeriods.map((pass) => {
                  const isCurrentActive = pass.computedStatus === 'active' || pass.computedStatus === 'active_cancelled';
                  const isUpcoming = pass.computedStatus === 'upcoming';
                  const isExpired = pass.computedStatus === 'expired';
                  const isCancelled = pass.computedStatus === 'cancelled';
                  const isExpanded = expandedPeriodId === (pass.id || pass.periodId);

                  const paymentMethodLabel = pass.paymentMethod === 'card'
                    ? `Card (•••• ${pass.paymentMethodDetails?.last4 || '8892'})`
                    : pass.paymentMethod === 'upi'
                    ? `UPI (${pass.paymentMethodDetails?.upiId || 'donor@upi'})`
                    : pass.paymentMethod === 'net_banking'
                    ? `Net Banking (${pass.paymentMethodDetails?.bankName || 'SBI'} ••••${pass.paymentMethodDetails?.maskedAccount?.slice(-4) || '5678'})`
                    : (activeDemoMode ? 'Simulated Demo Checkout' : 'Online Payment');

                  return (
                    <div
                      key={pass.id || pass.periodId}
                      className={`rounded-xl border transition-all ${
                        isCurrentActive
                          ? 'border-emerald-500 bg-emerald-50/25 shadow-sm'
                          : isUpcoming
                          ? 'border-brand-300 bg-brand-50/20'
                          : isCancelled
                          ? 'border-stone-200 bg-stone-50/60'
                          : 'border-border bg-white'
                      }`}
                    >
                      {/* Pass Summary Bar */}
                      <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-stone-900 text-sm">
                              {pass.planName}
                            </span>

                            {/* Badge with proper contrast */}
                            {isCurrentActive ? (
                              pass.isCancelled ? (
                                <Badge variant="warning" size="sm" className="bg-amber-100 text-amber-950 border-amber-300 font-bold">
                                  NON-RENEWING
                                </Badge>
                              ) : (
                                <Badge variant="active" size="sm" className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold">
                                  ACTIVE PASS
                                </Badge>
                              )
                            ) : isUpcoming ? (
                              <Badge variant="neutral" size="sm" className="bg-brand-100 text-brand-900 border-brand-300 font-bold">
                                QUEUE #{upcomingPeriods.findIndex((u) => u.id === pass.id) + 1}
                              </Badge>
                            ) : isCancelled ? (
                              <Badge variant="danger" size="sm" className="bg-red-100 text-red-900 border-red-300 font-semibold">
                                CANCELLED
                              </Badge>
                            ) : (
                              <Badge variant="neutral" size="sm" className="bg-stone-100 text-stone-800 border-stone-300 font-medium">
                                EXPIRED
                              </Badge>
                            )}

                            <span className="text-xs font-mono font-extrabold text-stone-900">₹{pass.amount}</span>
                            <span className="text-xs text-stone-600 font-medium">30-Day Duration</span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-stone-700 font-mono flex-wrap font-medium">
                            <span>
                              Window: <strong className="text-stone-900">{pass.sDate ? pass.sDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}</strong> →{' '}
                              <strong className="text-stone-900">{pass.eDate ? pass.eDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}</strong>
                            </span>
                            {pass.pDate && (
                              <span className="text-stone-600 hidden md:inline">
                                Purchased: {pass.pDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions & Accordion Toggle */}
                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                          {((isCurrentActive && !pass.isCancelled) || isUpcoming) && (
                            <button
                              type="button"
                              onClick={() => setCancellingPeriod(pass)}
                              className="px-2.5 py-1 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold transition-colors"
                            >
                              {isCurrentActive ? (activeDemoMode ? 'Cancel Active (Sim)' : 'Cancel Pass') : 'Cancel Pass'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setExpandedPeriodId(isExpanded ? null : (pass.id || pass.periodId))}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-700 hover:text-stone-950 hover:bg-stone-100 border border-stone-200 flex items-center gap-1 transition-colors"
                          >
                            <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Details Tray */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 border-t border-stone-200 bg-stone-50/70 rounded-b-xl text-xs space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Membership Period ID</span>
                              <span className="font-mono text-stone-900 font-medium break-all">{pass.periodId || pass.id}</span>
                            </div>
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Linked Transaction ID</span>
                              <span className="font-mono text-stone-900 font-medium break-all">{pass.transactionId || '—'}</span>
                            </div>
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Payment Method</span>
                              <span className="font-mono text-stone-900 font-medium">{paymentMethodLabel}</span>
                            </div>
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Purchase Timestamp</span>
                              <span className="font-mono text-stone-900 font-medium">
                                {pass.pDate ? pass.pDate.toLocaleString('en-IN') : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Scheduled Duration</span>
                              <span className="font-mono text-stone-900 font-medium">
                                30 consecutive calendar days
                              </span>
                            </div>
                            <div>
                              <span className="text-stone-600 uppercase font-bold block text-[10px]">Status</span>
                              <span className="font-bold text-stone-900 uppercase">{pass.computedStatus}</span>
                            </div>
                          </div>

                          {/* Cancellation information if applicable */}
                          {(pass.isCancelled || pass.computedStatus === 'cancelled') && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1">
                              <p className="font-bold flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 text-amber-800" />
                                <span>Cancellation Details</span>
                              </p>
                              {pass.computedStatus === 'active_cancelled' ? (
                                <p className="leading-relaxed">
                                  Cancellation requested. Benefits remain fully active through{' '}
                                  <strong className="text-amber-950">{pass.eDate ? pass.eDate.toLocaleDateString() : 'scheduled expiry'}</strong>, and will not auto-renew.
                                </p>
                              ) : (
                                <p className="leading-relaxed">
                                  Pass was cancelled. Reason: {pass.cancellationReason || 'User requested cancellation'}. Subsequent queued passes were shifted forward.
                                </p>
                              )}
                              {activeDemoMode && (
                                <p className="text-[11px] text-amber-900 font-medium pt-0.5">
                                  Demo Mode Note: In this testing simulation, cancellation modifies future pass scheduling without processing real banking transactions.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 2: PAYMENT HISTORY & AUDIT TRAIL                       */}
        {/* ============================================================== */}
        {activeSubTab === 'contributions' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-stone-900">Payment & Contribution History</h4>
              <p className="text-xs text-stone-600">
                Complete record of all support transactions and contributions. Sensitive banking credentials are never stored.
              </p>
            </div>

            {/* Comprehensive Search & Filter Controls */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Txn ID, Plan, Method..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-brand-700"
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={txFilter}
                    onChange={(e) => setTxFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700 font-medium"
                  >
                    <option value="all">All Payment Statuses</option>
                    <option value="completed">Completed / Successful</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Purpose Filter */}
                <div>
                  <select
                    value={purposeFilter}
                    onChange={(e) => setPurposeFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700 font-medium"
                  >
                    <option value="all">All Purposes (Memberships & Coffee)</option>
                    <option value="memberships">30-Day Membership Passes Only</option>
                    <option value="coffee">Voluntary Coffee Support (₹50)</option>
                  </select>
                </div>

                {/* Payment Method Filter */}
                <div>
                  <select
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700 font-medium"
                  >
                    <option value="all">All Payment Methods</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="upi">UPI</option>
                    <option value="net_banking">Net Banking</option>
                  </select>
                </div>
              </div>

              {/* Date Presets, Sort, and Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-200 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-stone-700 mr-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-stone-600" /> Date Range:
                  </span>
                  {[
                    { key: 'all', label: 'All Time' },
                    { key: '30', label: 'Last 30 Days' },
                    { key: '90', label: 'Last 90 Days' }
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setDatePreset(p.key)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                        datePreset === p.key
                          ? 'bg-brand-800 text-white shadow-sm'
                          : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-2.5 py-1 rounded bg-white border border-stone-300 text-xs text-stone-800 hover:bg-stone-50 flex items-center gap-1 font-semibold"
                  >
                    <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
                  </button>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-2.5 py-1 rounded text-xs text-brand-800 hover:text-brand-950 hover:bg-brand-50 flex items-center gap-1 font-bold transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto">
              {filteredTxns.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-600 space-y-2">
                  <History className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="font-bold text-stone-800 text-sm">No payment transactions found</p>
                  <p className="text-xs text-stone-600">
                    {hasActiveFilters ? 'No transactions match the selected filters.' : 'Support contributions and membership payments will appear here.'}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={resetFilters} className="mt-2 text-xs bg-white text-stone-800 font-semibold border-stone-300">
                      Reset All Filters
                    </Button>
                  )}
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-800 text-[11px] font-bold uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Plan / Purpose</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Period / Coverage</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTxns.map((tx) => {
                      const dateStr = tx.timestampMs
                        ? new Date(tx.timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—';
                      const timeStr = tx.timestampMs
                        ? new Date(tx.timestampMs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : '';

                      const methodLabel = tx.paymentMethod === 'card'
                        ? `Card (•••• ${tx.paymentMethodDetails?.last4 || '8892'})`
                        : tx.paymentMethod === 'upi'
                        ? `UPI (${tx.paymentMethodDetails?.upiId || 'vpa'})`
                        : tx.paymentMethod === 'net_banking'
                        ? `Net Banking (${tx.paymentMethodDetails?.bankName || 'Bank'})`
                        : (activeDemoMode ? 'Demo Checkout' : 'Online Payment');

                      const status = tx.paymentStatus || 'completed';
                      const isCoffee = !tx.activatesMembership || tx.planId === 'coffee';

                      return (
                        <tr key={tx.id || tx.transactionId} className="hover:bg-stone-50 transition-colors text-stone-800">
                          <td className="py-2.5 px-3 font-mono font-bold text-stone-900 whitespace-nowrap">
                            {tx.transactionId || tx.id}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-700 whitespace-nowrap">
                            <div>{dateStr}</div>
                            {timeStr && <div className="text-[10px] text-stone-500">{timeStr}</div>}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-stone-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{tx.planName}</span>
                              {isCoffee ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-950 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                  <Coffee className="w-2.5 h-2.5 text-amber-800" /> Coffee
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-bold text-brand-900 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200">
                                  30-Day Pass
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-stone-800 font-mono text-xs whitespace-nowrap">
                            {methodLabel}
                            {activeDemoMode && <span className="ml-1 text-[10px] text-amber-800 font-sans font-bold">[Demo]</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-stone-900 whitespace-nowrap text-sm">
                            ₹{tx.amount}
                          </td>
                          <td className="py-2.5 px-3 text-stone-700 font-mono text-xs">
                            {tx.periodId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSubTab('schedule');
                                  setExpandedPeriodId(tx.periodId);
                                }}
                                className="text-brand-800 hover:text-brand-950 underline flex items-center gap-1 font-mono text-xs font-semibold"
                                title="Click to view in Schedule"
                              >
                                <span>{tx.periodId.slice(-10)}</span>
                              </button>
                            ) : isCoffee ? (
                              <span className="text-stone-500 text-xs">Voluntary Support</span>
                            ) : (
                              <span className="text-stone-500 text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={
                                status === 'completed'
                                  ? 'active'
                                  : status === 'failed'
                                  ? 'danger'
                                  : 'neutral'
                              }
                              size="sm"
                              className={`text-[10px] font-bold ${
                                status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : status === 'failed'
                                  ? 'bg-red-100 text-red-900 border-red-300'
                                  : 'bg-stone-200 text-stone-800 border-stone-300'
                              }`}
                            >
                              {status.toUpperCase()}
                            </Badge>
                            {tx.failureReason && (
                              <span className="block text-[10px] text-red-700 font-medium mt-0.5 max-w-[150px] truncate" title={tx.failureReason}>
                                {tx.failureReason}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 3: REWARD LEDGER BATCHES (FIFO)                        */}
        {/* ============================================================== */}
        {activeSubTab === 'batches' && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-stone-900">FIFO Reward Ledger</h4>
              <p className="text-xs text-stone-600">
                Detailed record of reward tokens earned from completed food rescues, valued according to the plan under which each batch was earned.
              </p>
            </div>

            <div className="overflow-x-auto">
              {batches.length === 0 ? (
                <div className="py-10 text-center text-xs text-stone-600 space-y-1">
                  <Coins className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="font-bold text-stone-800 text-sm">No reward tokens recorded yet</p>
                  <p className="text-xs text-stone-600">Complete verified food donation handovers to earn tokens.</p>
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-800 text-[11px] font-bold uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Listing Reference</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Tokens</th>
                      <th className="py-2.5 px-3">Plan & Rate</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Remaining</th>
                      <th className="py-2.5 px-3 text-right">Est. Value</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {batches.map((b) => {
                      const dateStr = b.timestampMs
                        ? new Date(b.timestampMs).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '—';
                      const value = Math.round((b.remainingTokens || 0) * (b.redemptionRate || 0) * 100) / 100;
                      const qtyDisplay = b.foodQuantityKg != null ? `${b.foodQuantityKg} kg` : '—';
                      const tokensDisplay = b.tokensEarned != null ? `+${b.tokensEarned}` : '—';

                      return (
                        <tr
                          key={b.id || b.batchId}
                          onClick={() => setSelectedBatchDetails(b)}
                          className="hover:bg-stone-50 text-stone-800 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono text-stone-700 whitespace-nowrap">{dateStr}</td>
                          <td className="py-2.5 px-3 font-semibold text-stone-900 max-w-[180px] truncate">
                            <span className="text-brand-900 hover:underline">
                              {b.listingId ? `${b.listingId} • ` : ''}{b.donationTitle || 'Food Handover'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-900">
                            {qtyDisplay}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900">
                            {tokensDisplay}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" size="sm" className="text-[10px] bg-white border-stone-300 text-stone-800 font-semibold">
                                {b.planNameAtEarning || b.planAtEarning || 'Fuel Support'}
                              </Badge>
                              <span className="text-[11px] font-mono text-stone-600">
                                (₹{b.redemptionRatePer100 || (b.redemptionRate * 100)}/100)
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300">
                              Credited
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-stone-900">
                            {b.remainingTokens}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-brand-900 text-sm">
                            ₹{value}
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[11px] px-2.5 py-1 h-auto text-brand-900 border-stone-300 hover:bg-brand-50"
                              onClick={() => setSelectedBatchDetails(b)}
                            >
                              Inspect
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SUBTAB 4: REDEMPTION REQUESTS                                 */}
        {/* ============================================================== */}
        {activeSubTab === 'redemptions' && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-stone-900">Token Redemptions</h4>
              <p className="text-xs text-stone-600">
                History of token cashout requests. Verification takes 24–48 hours for UPI payouts.
              </p>
            </div>

            <div className="overflow-x-auto">
              {redemptions.length === 0 ? (
                <div className="py-10 text-center text-xs text-stone-600 space-y-1">
                  <ArrowUpRight className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="font-bold text-stone-800 text-sm">No token redemptions requested yet</p>
                  <p className="text-xs text-stone-600">Redeem available tokens in multiples of 100.</p>
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-100 text-stone-800 text-[11px] font-bold uppercase tracking-wider border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Request ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Tokens</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">UPI ID</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {redemptions.map((r) => {
                      const dateStr = r.timestampMs
                        ? new Date(r.timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '—';
                      return (
                        <tr key={r.id || r.requestId} className="hover:bg-stone-50 text-stone-800">
                          <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{r.requestId || r.id}</td>
                          <td className="py-2.5 px-3 font-mono text-stone-700">{dateStr}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{r.requestedTokens}</td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-emerald-900 text-sm">₹{r.calculatedAmount}</td>
                          <td className="py-2.5 px-3 font-mono text-stone-800 font-medium">{r.upiId}</td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={
                                r.status === 'paid'
                                  ? 'active'
                                  : r.status === 'approved'
                                  ? 'active'
                                  : r.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                              }
                              size="sm"
                              className={`text-[10px] font-bold ${
                                r.status === 'paid' || r.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : r.status === 'rejected'
                                  ? 'bg-red-100 text-red-900 border-red-300'
                                  : 'bg-amber-100 text-amber-950 border-amber-300'
                              }`}
                            >
                              {(r.status || 'PENDING').toUpperCase()}
                            </Badge>
                            {r.rejectionReason && (
                              <span className="block text-[10px] text-red-700 font-medium mt-0.5 max-w-[150px] truncate" title={r.rejectionReason}>
                                {r.rejectionReason}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ============================================================== */}
      {/* CANCELLATION CONFIRMATION MODAL                                */}
      {/* ============================================================== */}
      {cancellingPeriod && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-red-700" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-base">
                  Cancel {cancellingPeriod.planName} Pass
                </h4>
                <p className="text-xs text-stone-600">
                  {activeDemoMode ? 'Simulation pass cancellation control' : 'Membership pass cancellation control'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 space-y-2.5 leading-relaxed">
              {cancellingPeriod.id === activePeriod?.id ? (
                <div>
                  <p className="font-bold text-stone-900 mb-1">Active Pass Policy:</p>
                  <p>
                    Cancelling your active membership marks it as <strong>non-renewing</strong>. Your member benefits (token earning and redemptions) remain <strong>100% active</strong> until the scheduled end of your current cycle on{' '}
                    <strong className="text-stone-900">{activePeriod.eDate ? activePeriod.eDate.toLocaleDateString() : 'scheduled date'}</strong>.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-bold text-stone-900 mb-1">Upcoming Queued Pass Policy:</p>
                  <p>
                    Cancelling this queued pass removes it from your future schedule. Any subsequent queued passes will automatically <strong>shift forward by 30 days</strong> to maintain uninterrupted consecutive coverage.
                  </p>
                </div>
              )}

              {activeDemoMode && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 font-medium">
                  Simulation Notice: FoodBridge operates on demo simulation mode. No real bank debits occurred and no real monetary refunds will be issued.
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-800 uppercase tracking-wider block mb-1">
                Cancellation Reason (Optional)
              </label>
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason for cancellation"
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-brand-700 font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancellingPeriod(null)}
                disabled={actionLoading}
                className="bg-white border-stone-300 text-stone-800 hover:bg-stone-50 text-xs font-semibold px-4 py-2"
              >
                Keep Pass
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-red-700 hover:bg-red-800 text-white border-none text-xs font-semibold px-4 py-2 shadow-sm"
                onClick={handleConfirmCancel}
                loading={actionLoading}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Checkout Modal */}
      {showPaymentModal && (
        <PaymentModal
          planId={membership?.activePlan === 'fuel_support' ? 'corridor_help' : 'fuel_support'}
          isDemoMode={activeDemoMode}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(res) => {
            setNotice(`Payment completed! Pass created for plan "${res.plan?.name}".`);
            fetchWalletData();
          }}
        />
      )}

      {/* Token Redemption Modal */}
      {showRedeemModal && (
        <RedemptionModal
          wallet={wallet}
          onClose={() => setShowRedeemModal(false)}
          onSuccess={(res) => {
            setNotice(`Redemption request (${res.requestedTokens} tokens, ₹${res.calculatedAmount}) submitted for review.`);
            fetchWalletData();
          }}
        />
      )}

      {/* Reward Batch Traceability & Donation Linkage Modal */}
      {selectedBatchDetails && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-border space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  <span>Verified Reward Transaction</span>
                </div>
                <h3 className="text-base font-bold text-stone-900">
                  {selectedBatchDetails.donationTitle || 'Completed Donation Reward'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchDetails(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-stone-50 border border-border">
                <div>
                  <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide block">
                    Listing Reference
                  </span>
                  <span className="font-mono font-bold text-stone-900 text-xs">
                    {selectedBatchDetails.listingId || selectedBatchDetails.donationId || 'FB-DONATION'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide block">
                    Food Quantity Donated
                  </span>
                  <span className="font-mono font-bold text-stone-900 text-xs">
                    {selectedBatchDetails.foodQuantityKg != null ? `${selectedBatchDetails.foodQuantityKg} kg` : 'Recorded Handover'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide block">
                    Tokens Credited
                  </span>
                  <span className="font-mono font-black text-emerald-900 text-sm">
                    +{selectedBatchDetails.tokensEarned} tokens
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide block">
                    Transaction Status
                  </span>
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 mt-0.5">
                    Credited
                  </span>
                </div>
              </div>

              {/* Formula & Calculation Box */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <span className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider block">
                  Reward Earning Rule & Calculation
                </span>
                <p className="font-mono font-semibold text-emerald-900 text-xs">
                  {selectedBatchDetails.calculationDetails ||
                    (selectedBatchDetails.foodQuantityKg != null
                      ? `(${selectedBatchDetails.foodQuantityKg} kg / 2) × 10 = ${selectedBatchDetails.tokensEarned} tokens`
                      : 'Standard Handover Reward')}
                </p>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Earn 10 tokens for every 2 kg of food rescued. Fractional quantities calculate proportionally without rounding down.
                </p>
              </div>

              {/* Plan Valuation Details */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-stone-600">Plan at Earning:</span>
                  <span className="font-semibold text-stone-900">
                    {selectedBatchDetails.planNameAtEarning || selectedBatchDetails.planAtEarning || 'Fuel Support'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-stone-600">Applicable Redemption Rate:</span>
                  <span className="font-mono font-semibold text-stone-900">
                    ₹{selectedBatchDetails.redemptionRatePer100 || (selectedBatchDetails.redemptionRate * 100)} per 100 tokens
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-stone-600">Remaining in Batch:</span>
                  <span className="font-mono font-bold text-stone-900">
                    {selectedBatchDetails.remainingTokens} tokens
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60">
                  <span className="text-stone-600">Transaction ID:</span>
                  <span className="font-mono text-stone-700 text-[11px] truncate max-w-[200px]" title={selectedBatchDetails.rewardTransactionId || selectedBatchDetails.batchId}>
                    {selectedBatchDetails.rewardTransactionId || selectedBatchDetails.batchId}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-stone-600">Timestamp:</span>
                  <span className="font-mono text-stone-700">
                    {selectedBatchDetails.timestampMs
                      ? new Date(selectedBatchDetails.timestampMs).toLocaleString('en-IN')
                      : 'Recorded'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-border">
              {onNavigateToHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-stone-300 text-stone-700 hover:bg-stone-100 text-xs font-semibold"
                  onClick={() => {
                    setSelectedBatchDetails(null);
                    onNavigateToHistory();
                  }}
                >
                  <History className="w-3.5 h-3.5 mr-1 text-stone-600" />
                  <span>View in Donation History</span>
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                className="bg-brand-800 hover:bg-brand-700 text-white text-xs font-semibold px-4"
                onClick={() => setSelectedBatchDetails(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

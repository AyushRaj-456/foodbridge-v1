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
  AlertCircle,
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
  Filter
} from 'lucide-react';

export function WalletView({ role = 'donor' }) {
  const { user } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [supportTxns, setSupportTxns] = useState([]);
  const [membershipPeriods, setMembershipPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('schedule'); // 'schedule' | 'batches' | 'redemptions' | 'contributions'
  const [txFilter, setTxFilter] = useState('all'); // 'all' | 'completed' | 'failed' | 'cancelled'
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

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

  // Compute upcoming and active periods
  const now = Date.now();
  const activePeriod = membershipPeriods.find((p) => {
    const s = parseDate(p.startDate)?.getTime() || 0;
    const e = parseDate(p.expiryDate)?.getTime() || 0;
    return now >= s && now < e && p.status !== 'cancelled';
  });

  const upcomingPeriods = membershipPeriods.filter((p) => {
    const s = parseDate(p.startDate)?.getTime() || 0;
    return s > now && p.status !== 'cancelled';
  });

  const pastOrCancelledPeriods = membershipPeriods.filter((p) => {
    const e = parseDate(p.expiryDate)?.getTime() || 0;
    return e <= now || p.status === 'cancelled';
  });

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
      setNotice(res.message || 'Membership period updated.');
      setCancellingPeriod(null);
      await fetchWalletData();
    } catch (err) {
      console.error('Cancellation error:', err);
      setErrorNotice('Failed to cancel membership pass: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered transactions for payment history
  const filteredTxns = supportTxns.filter((tx) => {
    if (txFilter === 'all') return true;
    return (tx.paymentStatus || 'completed') === txFilter;
  });

  // Payment KPIs
  const totalSpent = supportTxns
    .filter((t) => (t.paymentStatus || 'completed') === 'completed')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const completedCount = supportTxns.filter((t) => (t.paymentStatus || 'completed') === 'completed').length;
  const failedCount = supportTxns.filter((t) => t.paymentStatus === 'failed').length;
  const cancelledCount = supportTxns.filter((t) => t.paymentStatus === 'cancelled').length;

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-950 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorNotice('')}
            className="text-red-700 hover:text-red-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Membership Status & Stacking Header Card */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-stone-900 via-stone-850 to-stone-800 text-white border-stone-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                Support Membership
              </span>
              {isMemberActive ? (
                membership?.isCancelled ? (
                  <Badge variant="warning" size="sm" className="bg-amber-500 text-white border-amber-400">
                    CANCELLED (ACTIVE UNTIL EXPIRY)
                  </Badge>
                ) : (
                  <Badge variant="active" size="sm" className="bg-emerald-500 text-white border-emerald-400">
                    ACTIVE
                  </Badge>
                )
              ) : membership?.status === 'expired' ? (
                <Badge variant="warning" size="sm" className="bg-amber-500 text-white border-amber-400">
                  EXPIRED
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm" className="bg-stone-700 text-stone-300 border-stone-600">
                  NO MEMBERSHIP
                </Badge>
              )}

              {upcomingPeriods.length > 0 && (
                <Badge variant="outline" size="sm" className="bg-blue-900/60 text-blue-200 border-blue-400 text-[10px]">
                  +{upcomingPeriods.length} QUEUED PASS{upcomingPeriods.length > 1 ? 'ES' : ''}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {membership?.planDetails?.name || (isMemberActive ? 'Active Donor Member' : 'Community Member')}
              </h2>
              {isMemberActive && (
                <span className="text-xs text-emerald-400 font-medium">
                  ({membership.daysRemaining} days left in current cycle)
                </span>
              )}
            </div>

            <p className="text-xs text-stone-300 leading-relaxed max-w-xl">
              {isMemberActive ? (
                <>
                  Earn <strong>10 tokens</strong> on every verified completed donation handover. Current redemption rate: <strong>₹{membership.redemptionRatePer100} / 100 tokens</strong>.
                  {membership.totalStackDaysRemaining > membership.daysRemaining && (
                    <span className="block mt-1 text-emerald-300 font-medium">
                      Consecutive Stacking: Total combined coverage of <strong>{membership.totalStackDaysRemaining} days</strong> (valid until {membership.totalStackExpiry ? new Date(membership.totalStackExpiry).toLocaleDateString() : 'scheduled date'}).
                    </span>
                  )}
                  {membership.isCancelled && (
                    <span className="block mt-1 text-amber-300">
                      Cancellation requested: Benefits remain active until {membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString() : 'end of period'}, and will not auto-renew.
                    </span>
                  )}
                </>
              ) : membership?.status === 'expired' ? (
                <>
                  Your membership has expired. Existing reward tokens remain safely in your wallet. Activate a membership to earn new tokens and unlock redemptions.
                </>
              ) : (
                <>
                  Voluntary support memberships enable token rewards for food rescue handovers. Multiple purchases stack consecutively without overlap.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
            <Button
              variant="primary"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-sm justify-center"
              onClick={() => setShowPaymentModal(true)}
            >
              <CreditCard className="w-4 h-4 mr-1.5" />
              <span>{isMemberActive ? 'Add 30-Day Pass (Stack)' : 'Activate Membership'}</span>
            </Button>

            {isMemberActive && !membership?.isCancelled && activePeriod && (
              <button
                type="button"
                onClick={() => setCancellingPeriod(activePeriod)}
                className="text-[11px] text-stone-400 hover:text-red-400 text-center py-1 underline transition-colors"
              >
                Cancel Active Membership (Simulation)
              </button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="text-stone-300 border-stone-700 hover:bg-stone-800 hover:text-white justify-center text-xs"
              onClick={fetchWalletData}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Balance</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Available Tokens */}
        <Card className="p-4 sm:p-5 border-emerald-200/80 bg-emerald-50/30">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-950">Available Tokens</span>
            <Coins className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-900 font-mono">
            {wallet?.availableTokens || 0}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">Ready for redemption</span>
        </Card>

        {/* Estimated Value */}
        <Card className="p-4 sm:p-5 border-brand-200/80 bg-brand-50/30">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-950">Est. Redeemable Value</span>
            <Sparkles className="w-4 h-4 text-brand-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-brand-900 font-mono">
            ₹{wallet?.estimatedRedeemableValue || 0}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">Plan-based FIFO valuation</span>
        </Card>

        {/* Total Simulated Spent */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Total Support Spent</span>
            <CreditCard className="w-4 h-4 text-brand-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            ₹{totalSpent}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">({completedCount} verified demo txns)</span>
        </Card>

        {/* Queued Passes */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Stacked Passes</span>
            <Layers className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {(activePeriod ? 1 : 0) + upcomingPeriods.length}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">
            {upcomingPeriods.length} queued for future dates
          </span>
        </Card>
      </div>

      {/* 3. Action Bar: Redeem Tokens CTA */}
      <div className="p-4 rounded-xl bg-surface-muted border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-stone-900">Redeem Tokens for Monetary Rewards</h4>
          <p className="text-xs text-stone-600">
            {isMemberActive
              ? 'Minimum redemption: 100 tokens (multiples of 100). Payout calculated via FIFO across original earning plans.'
              : 'Active membership required to redeem tokens. Your existing tokens remain safely preserved.'}
          </p>
        </div>

        <div>
          <Button
            variant="primary"
            size="md"
            disabled={!isMemberActive || availableTokens < 100}
            onClick={() => setShowRedeemModal(true)}
            className="w-full sm:w-auto justify-center"
          >
            <Coins className="w-4 h-4 mr-1.5" />
            <span>Redeem Tokens</span>
          </Button>
        </div>
      </div>

      {/* 4. Detailed Navigation Subtabs */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveSubTab('schedule')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'schedule'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Membership Schedule ({membershipPeriods.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('contributions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'contributions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Payment History ({supportTxns.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('batches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'batches'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Reward Ledger ({batches.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('redemptions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeSubTab === 'redemptions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Redemptions ({redemptions.length})</span>
            </button>
          </div>
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            Consecutive Stacking Enabled
          </span>
        </div>

        {/* SUBTAB 1: MEMBERSHIP SCHEDULE & CONSECUTIVE STACKING */}
        {activeSubTab === 'schedule' && (
          <div className="space-y-4">
            {/* Active and Queued Timeline Cards */}
            {membershipPeriods.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-stone-500 text-xs">
                <Layers className="w-8 h-8 text-stone-400 mx-auto" />
                <p>No membership periods purchased yet.</p>
                <p className="text-[11px] text-stone-400">
                  Purchasing a support plan creates consecutive 30-day coverage passes.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  className="mt-2"
                >
                  View Membership Plans
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Period Highlight */}
                {activePeriod && (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-950 text-sm">
                            Current Active Period ({activePeriod.planName})
                          </span>
                          <Badge variant="active" size="sm">ACTIVE</Badge>
                          {activePeriod.isCancelled && (
                            <Badge variant="warning" size="sm">NON-RENEWING</Badge>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 font-mono">
                          {activePeriod.startDate ? new Date(activePeriod.startDate).toLocaleDateString() : 'Now'} → {activePeriod.expiryDate ? new Date(activePeriod.expiryDate).toLocaleDateString() : '30 Days'}
                        </p>
                      </div>

                      {!activePeriod.isCancelled ? (
                        <button
                          type="button"
                          onClick={() => setCancellingPeriod(activePeriod)}
                          className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
                        >
                          Cancel Active Membership
                        </button>
                      ) : (
                        <span className="text-[11px] text-amber-800 font-medium">
                          Cancellation effective on {activePeriod.expiryDate ? new Date(activePeriod.expiryDate).toLocaleDateString() : 'expiry'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Upcoming Queued Passes */}
                {upcomingPeriods.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-700" />
                      <span>Upcoming Queued Passes ({upcomingPeriods.length})</span>
                    </h5>
                    <p className="text-[11px] text-stone-500">
                      These passes activate automatically on their scheduled start date. Cancelling an upcoming pass removes it and shifts later passes forward.
                    </p>

                    <div className="space-y-2">
                      {upcomingPeriods.map((upPass, idx) => {
                        const sDate = parseDate(upPass.startDate);
                        const eDate = parseDate(upPass.expiryDate);
                        return (
                          <div
                            key={upPass.id || upPass.periodId}
                            className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-stone-900">
                                  Pass #{idx + 1}: {upPass.planName}
                                </span>
                                <Badge variant="neutral" size="sm" className="bg-blue-100 text-blue-800 border-blue-300">
                                  QUEUED
                                </Badge>
                                <span className="text-stone-500 font-mono">₹{upPass.amount}</span>
                              </div>
                              <p className="text-stone-600 font-mono text-[11px]">
                                Scheduled Window: {sDate ? sDate.toLocaleDateString() : 'Pending'} → {eDate ? eDate.toLocaleDateString() : 'Pending'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setCancellingPeriod(upPass)}
                              className="px-2.5 py-1 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-medium self-start sm:self-auto transition-colors"
                            >
                              Cancel Pass
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* All Periods Table */}
                <div className="pt-2">
                  <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-2">
                    Complete Membership History
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3">Pass ID</th>
                          <th className="py-2.5 px-3">Plan</th>
                          <th className="py-2.5 px-3">Start Date</th>
                          <th className="py-2.5 px-3">Expiry Date</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {membershipPeriods.map((p) => {
                          const sDate = parseDate(p.startDate);
                          const eDate = parseDate(p.expiryDate);
                          const isNowActive = now >= (sDate?.getTime() || 0) && now < (eDate?.getTime() || 0) && p.status !== 'cancelled';
                          const isNowUpcoming = (sDate?.getTime() || 0) > now && p.status !== 'cancelled';
                          return (
                            <tr key={p.id || p.periodId} className="hover:bg-surface-muted/50">
                              <td className="py-2.5 px-3 font-mono font-semibold text-stone-700">
                                {(p.periodId || p.id).slice(-8)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-stone-900">{p.planName}</td>
                              <td className="py-2.5 px-3 font-mono text-stone-600">
                                {sDate ? sDate.toLocaleDateString() : '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-stone-600">
                                {eDate ? eDate.toLocaleDateString() : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                                ₹{p.amount}
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge
                                  variant={
                                    p.status === 'cancelled'
                                      ? 'danger'
                                      : p.isCancelled
                                      ? 'warning'
                                      : isNowActive
                                      ? 'active'
                                      : isNowUpcoming
                                      ? 'neutral'
                                      : 'neutral'
                                  }
                                  size="sm"
                                  className="text-[10px]"
                                >
                                  {p.status === 'cancelled'
                                    ? 'CANCELLED'
                                    : p.isCancelled
                                    ? 'NON-RENEWING'
                                    : isNowActive
                                    ? 'ACTIVE'
                                    : isNowUpcoming
                                    ? 'UPCOMING'
                                    : 'EXPIRED'}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {(isNowActive && !p.isCancelled) || isNowUpcoming ? (
                                  <button
                                    type="button"
                                    onClick={() => setCancellingPeriod(p)}
                                    className="text-red-600 hover:text-red-800 text-[11px] underline"
                                  >
                                    Cancel
                                  </button>
                                ) : (
                                  <span className="text-stone-400 text-[11px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: PAYMENT HISTORY & AUDIT TRAIL */}
        {activeSubTab === 'contributions' && (
          <div className="space-y-3">
            {/* Filter Chips & KPI Summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-stone-500 mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> Filter:
                </span>
                {[
                  { key: 'all', label: `All (${supportTxns.length})` },
                  { key: 'completed', label: `Completed (${completedCount})` },
                  { key: 'failed', label: `Failed (${failedCount})` },
                  { key: 'cancelled', label: `Cancelled (${cancelledCount})` }
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setTxFilter(f.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      txFilter === f.key
                        ? 'bg-stone-900 text-white'
                        : 'bg-surface-muted text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] text-stone-500 font-mono">
                Total spent: <strong className="text-stone-900">₹{totalSpent}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              {filteredTxns.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No {txFilter !== 'all' ? txFilter : ''} payment transactions found.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 text-[11px] font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Plan / Purpose</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Coverage Window</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTxns.map((tx) => {
                      const dateStr = tx.timestampMs
                        ? new Date(tx.timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—';

                      const methodLabel = tx.paymentMethod === 'card'
                        ? `Card (•••• ${tx.paymentMethodDetails?.last4 || '8892'})`
                        : tx.paymentMethod === 'upi'
                        ? `UPI (${tx.paymentMethodDetails?.upiId || 'vpa'})`
                        : tx.paymentMethod === 'net_banking'
                        ? `Net Banking (${tx.paymentMethodDetails?.bankName || 'Bank'})`
                        : 'Demo Checkout';

                      const status = tx.paymentStatus || 'completed';

                      const coverageWindow = tx.membershipStartDate && tx.membershipExpiryDate
                        ? `${new Date(tx.membershipStartDate).toLocaleDateString()} → ${new Date(tx.membershipExpiryDate).toLocaleDateString()}`
                        : tx.activatesMembership
                        ? '30 Days Pass'
                        : 'Voluntary Coffee (No Membership)';

                      return (
                        <tr key={tx.id || tx.transactionId} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                            {tx.transactionId || tx.id}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-500 whitespace-nowrap">{dateStr}</td>
                          <td className="py-2.5 px-3 font-medium text-stone-900">
                            {tx.planName}
                            {tx.planId === 'coffee' && (
                              <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Coffee
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                            {methodLabel}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 whitespace-nowrap">
                            ₹{tx.amount}
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px]">
                            {coverageWindow}
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
                              className="text-[10px]"
                            >
                              {status.toUpperCase()}
                            </Badge>
                            {tx.failureReason && (
                              <span className="block text-[10px] text-red-600 mt-0.5 max-w-[140px] truncate" title={tx.failureReason}>
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

        {/* SUBTAB 3: REWARD LEDGER BATCHES */}
        {activeSubTab === 'batches' && (
          <div className="overflow-x-auto">
            {batches.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                No reward tokens recorded yet. Complete verified food donation handovers to earn tokens.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-muted text-stone-600 text-[11px] font-semibold border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Donation / Event</th>
                    <th className="py-2.5 px-3">Plan at Earning</th>
                    <th className="py-2.5 px-3">Rate</th>
                    <th className="py-2.5 px-3 text-right">Earned</th>
                    <th className="py-2.5 px-3 text-right">Remaining</th>
                    <th className="py-2.5 px-3 text-right">Est. Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((b) => {
                    const dateStr = b.timestampMs
                      ? new Date(b.timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '—';
                    const value = Math.round((b.remainingTokens || 0) * (b.redemptionRate || 0) * 100) / 100;
                    return (
                      <tr key={b.id || b.batchId} className="hover:bg-surface-muted/50">
                        <td className="py-2.5 px-3 font-mono text-stone-500 whitespace-nowrap">{dateStr}</td>
                        <td className="py-2.5 px-3 font-medium text-stone-900 max-w-[180px] truncate">
                          {b.donationTitle || b.donationId || 'Food Handover'}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" size="sm" className="text-[10px]">
                            {b.planNameAtEarning || b.planAtEarning}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-stone-600 font-mono">
                          ₹{b.redemptionRatePer100 || (b.redemptionRate * 100)}/100
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-800">
                          {b.tokensEarned}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                          {b.remainingTokens}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-brand-900">
                          ₹{value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* SUBTAB 4: REDEMPTION REQUESTS */}
        {activeSubTab === 'redemptions' && (
          <div className="overflow-x-auto">
            {redemptions.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                No token redemptions requested yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-muted text-stone-600 text-[11px] font-semibold border-b border-border">
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
                      <tr key={r.id || r.requestId} className="hover:bg-surface-muted/50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-stone-800">{r.requestId || r.id}</td>
                        <td className="py-2.5 px-3 font-mono text-stone-500">{dateStr}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-stone-900">{r.requestedTokens}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">₹{r.calculatedAmount}</td>
                        <td className="py-2.5 px-3 font-mono text-stone-600">{r.upiId}</td>
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
                            className="text-[10px]"
                          >
                            {(r.status || 'PENDING').toUpperCase()}
                          </Badge>
                          {r.rejectionReason && (
                            <span className="block text-[10px] text-red-600 mt-0.5 max-w-[150px] truncate">
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
        )}
      </Card>

      {/* Cancellation Confirmation Modal */}
      {cancellingPeriod && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-2.5 text-red-700">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-700" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  Cancel {cancellingPeriod.planName} Pass
                </h4>
                <p className="text-[11px] text-stone-500">Simulation cancellation control</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700 space-y-2">
              {cancellingPeriod.id === activePeriod?.id ? (
                <p>
                  <strong>Active Pass Policy:</strong> Cancelling your active membership marks it as non-renewing.
                  Your benefits (token earning and redemptions) remain <strong>100% active</strong> until the scheduled expiry on{' '}
                  <strong>{activePeriod.expiryDate ? new Date(activePeriod.expiryDate).toLocaleDateString() : 'scheduled date'}</strong>.
                </p>
              ) : (
                <p>
                  <strong>Upcoming Pass Policy:</strong> Cancelling this queued pass removes it from your future schedule.
                  Any subsequent queued passes will automatically <strong>shift forward by 30 days</strong> to maintain uninterrupted coverage.
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                Cancellation Reason (Optional)
              </label>
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason for cancellation"
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancellingPeriod(null)}
                disabled={actionLoading}
              >
                Keep Pass
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-red-700 hover:bg-red-800 text-white border-none"
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
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(res) => {
            setNotice(`Payment simulated successfully! Pass created for plan "${res.plan?.name}".`);
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
    </div>
  );
}

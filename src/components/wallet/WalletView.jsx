import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { PaymentModal } from '../support/PaymentModal';
import { RedemptionModal } from './RedemptionModal';
import { getUserWallet } from '../../services/walletService';
import { getRedemptionRequests } from '../../services/walletService';
import { getSupportTransactions } from '../../services/membershipService';
import {
  Coins,
  Sparkles,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  History,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Coffee,
  HelpCircle
} from 'lucide-react';

export function WalletView({ role = 'donor' }) {
  const { user } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [supportTxns, setSupportTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('batches'); // 'batches' | 'redemptions' | 'contributions'
  const [notice, setNotice] = useState('');

  const fetchWalletData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [wData, rData, sData] = await Promise.all([
        getUserWallet(undefined, user.uid),
        getRedemptionRequests(undefined, { userId: user.uid, limitCount: 30 }),
        getSupportTransactions(undefined, { userId: user.uid, limitCount: 30 })
      ]);
      setWallet(wData);
      setRedemptions(rData);
      setSupportTxns(sData);
    } catch (err) {
      console.warn('Error fetching wallet view data:', err.message);
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

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between">
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

      {/* 1. Membership Status Card */}
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-white border-stone-800 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                Support Membership
              </span>
              {isMemberActive ? (
                <Badge variant="active" size="sm" className="bg-emerald-500 text-white border-emerald-400">
                  ACTIVE
                </Badge>
              ) : membership?.status === 'expired' ? (
                <Badge variant="warning" size="sm" className="bg-amber-500 text-white border-amber-400">
                  EXPIRED
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm" className="bg-stone-700 text-stone-300 border-stone-600">
                  NO MEMBERSHIP
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                {membership?.planDetails?.name || 'Community Member'}
              </h2>
              {isMemberActive && (
                <span className="text-xs text-emerald-400 font-medium">
                  ({membership.daysRemaining} days remaining)
                </span>
              )}
            </div>

            <p className="text-xs text-stone-300 leading-relaxed max-w-xl">
              {isMemberActive ? (
                <>
                  Earn <strong>{role === 'donor' ? '10' : '5'} tokens</strong> on every successfully completed donation handover. Current redemption rate: <strong>₹{membership.redemptionRatePer100} / 100 tokens</strong>.
                </>
              ) : membership?.status === 'expired' ? (
                <>
                  Your membership has expired. Existing reward tokens remain safely in your wallet. Activate or renew a 30-day membership to earn new tokens and unlock redemptions.
                </>
              ) : (
                <>
                  Voluntary support memberships enable token rewards for food rescue handovers. Couriers are excluded (compensated via delivery fares).
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
              <span>{isMemberActive ? 'Extend / Upgrade Plan' : 'Activate Membership'}</span>
            </Button>

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
          <span className="text-[11px] text-stone-500 block mt-1">Plan-based valuation</span>
        </Card>

        {/* Reserved Tokens */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Reserved Tokens</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {wallet?.reservedTokens || 0}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">Pending review / payout</span>
        </Card>

        {/* Total Redeemed */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Total Redeemed</span>
            <CheckCircle2 className="w-4 h-4 text-stone-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            ₹{wallet?.totalRedeemedValue || 0}
          </div>
          <span className="text-[11px] text-stone-500 block mt-1">({wallet?.redeemedTokens || 0} tokens paid out)</span>
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

      {/* 4. Plan-Based Reward Ledger Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fuel Support Batch Breakdown */}
        <Card className="p-5 border-emerald-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                F
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Fuel Support Batches</h4>
                <p className="text-[11px] text-stone-500">Rate: ₹2 per 100 tokens</p>
              </div>
            </div>
            <span className="font-mono font-bold text-emerald-900 text-lg">
              ₹{wallet?.batchesByPlan?.fuel_support?.valueINR || 0}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/80 text-center text-xs">
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Earned</span>
              <span className="font-mono font-bold text-stone-800">
                {wallet?.batchesByPlan?.fuel_support?.tokensEarned || 0}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Remaining</span>
              <span className="font-mono font-bold text-emerald-800">
                {wallet?.batchesByPlan?.fuel_support?.remainingTokens || 0}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Redeemed</span>
              <span className="font-mono font-bold text-stone-800">
                {wallet?.batchesByPlan?.fuel_support?.redeemedTokens || 0}
              </span>
            </div>
          </div>
        </Card>

        {/* Corridor Help Batch Breakdown */}
        <Card className="p-5 border-brand-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-100 text-brand-900 flex items-center justify-center font-bold text-xs">
                C
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Corridor Help Batches</h4>
                <p className="text-[11px] text-stone-500">Rate: ₹6 per 100 tokens</p>
              </div>
            </div>
            <span className="font-mono font-bold text-brand-900 text-lg">
              ₹{wallet?.batchesByPlan?.corridor_help?.valueINR || 0}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/80 text-center text-xs">
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Earned</span>
              <span className="font-mono font-bold text-stone-800">
                {wallet?.batchesByPlan?.corridor_help?.tokensEarned || 0}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Remaining</span>
              <span className="font-mono font-bold text-brand-800">
                {wallet?.batchesByPlan?.corridor_help?.remainingTokens || 0}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-surface-muted">
              <span className="text-[10px] text-stone-500 block">Redeemed</span>
              <span className="font-mono font-bold text-stone-800">
                {wallet?.batchesByPlan?.corridor_help?.redeemedTokens || 0}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. Detailed Tables Subtabs */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('batches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'batches'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              Reward Ledger ({batches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('redemptions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'redemptions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              Redemption Requests ({redemptions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('contributions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeSubTab === 'contributions'
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'text-stone-600 hover:bg-surface-muted'
              }`}
            >
              Contributions ({supportTxns.length})
            </button>
          </div>
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            Immutable Firestore Ledger
          </span>
        </div>

        {/* Subtab 1: Reward Ledger Batches */}
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

        {/* Subtab 2: Redemption Requests */}
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

        {/* Subtab 3: Support Contributions */}
        {activeSubTab === 'contributions' && (
          <div className="overflow-x-auto">
            {supportTxns.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500">
                No contribution transactions found.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-muted text-stone-600 text-[11px] font-semibold border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Transaction ID</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Plan</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supportTxns.map((tx) => {
                    const dateStr = tx.timestampMs
                      ? new Date(tx.timestampMs).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '—';
                    return (
                      <tr key={tx.id || tx.transactionId} className="hover:bg-surface-muted/50">
                        <td className="py-2.5 px-3 font-mono text-stone-700">{tx.transactionId || tx.id}</td>
                        <td className="py-2.5 px-3 font-mono text-stone-500">{dateStr}</td>
                        <td className="py-2.5 px-3 font-medium text-stone-900">{tx.planName}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">₹{tx.amount}</td>
                        <td className="py-2.5 px-3 text-right">
                          <Badge variant="active" size="sm" className="text-[10px]">
                            COMPLETED
                          </Badge>
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

      {/* Payment Checkout Modal */}
      {showPaymentModal && (
        <PaymentModal
          planId={membership?.activePlan === 'fuel_support' ? 'corridor_help' : 'fuel_support'}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(res) => {
            setNotice(`Payment simulated successfully! Membership updated for plan "${res.plan?.name}".`);
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

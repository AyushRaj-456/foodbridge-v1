import React, { useState, useEffect } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { db, collection, query, getDocs, limit, doc, getDoc } from '../../services/firebase';
import { getISTDateString, SUPPORT_PLANS } from '../../config/membershipConfig';
import {
  getSupportTransactions,
  getAllMembershipPeriods,
  parseDate
} from '../../services/membershipService';
import {
  getRedemptionRequests,
  approveRedemptionRequest,
  markRedemptionAsPaid,
  rejectRedemptionRequest
} from '../../services/walletService';
import {
  Coins,
  Sparkles,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Check,
  ExternalLink,
  Layers,
  Calendar
} from 'lucide-react';

export function AdminMembershipAndRewards({ adminUid, subSection = 'memberships' }) {
  const { t, formatCurrency, formatDate } = useLocale();
  const [activeTab, setActiveTab] = useState(subSection); // 'memberships' | 'rewards' | 'redemptions'
  const [redemptionFilter, setRedemptionFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'paid' | 'rejected'

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Data states
  const [transactions, setTransactions] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [membershipPeriods, setMembershipPeriods] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [ledgerBatches, setLedgerBatches] = useState([]);
  const [globalCounter, setGlobalCounter] = useState(null);
  const [pairCounters, setPairCounters] = useState([]);

  // Filter states
  const [txFilter, setTxFilter] = useState('all'); // 'all' | 'completed' | 'failed' | 'cancelled'
  const [periodFilter, setPeriodFilter] = useState('all'); // 'all' | 'active' | 'upcoming' | 'cancelled' | 'expired'
  const [rewardSearchQuery, setRewardSearchQuery] = useState('');

  // Reject Modal
  const [rejectModalReq, setRejectModalReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const todayIST = getISTDateString(new Date());

  const loadAllAdminData = async () => {
    try {
      setLoading(true);
      setErrorNotice('');

      // 1. Fetch support transactions (Donors only)
      const txns = await getSupportTransactions(db, { limitCount: 100 });
      const donorTxns = txns.filter((t) => !t.userRole || t.userRole === 'donor');
      setTransactions(donorTxns);

      // 2. Fetch all individual membership periods (active, upcoming, cancelled, expired)
      const periods = await getAllMembershipPeriods(db, { limitCount: 150 });
      const donorPeriods = periods.filter((p) => !p.userRole || p.userRole === 'donor');
      setMembershipPeriods(donorPeriods);

      // 3. Fetch summary memberships (Donors only)
      const memSnap = await getDocs(query(collection(db, 'memberships'), limit(100)));
      const donorMems = memSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => !m.userRole || m.userRole === 'donor');
      setMemberships(donorMems);

      // 3. Fetch redemptions (Donors only)
      const redList = await getRedemptionRequests(db, { limitCount: 100 });
      const donorReds = redList.filter((r) => !r.userRole || r.userRole === 'donor');
      setRedemptions(donorReds);

      // 4. Fetch reward ledger (Donors only)
      const ledSnap = await getDocs(query(collection(db, 'rewardLedger'), limit(200)));
      const donorLedgers = ledSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((b) => b.role === 'donor');
      setLedgerBatches(donorLedgers);

      // 5. Fetch daily global counter for today
      try {
        const globSnap = await getDoc(doc(db, 'dailyRewardCounters', todayIST));
        setGlobalCounter(globSnap.exists() ? globSnap.data() : { totalRewardedDonations: 0 });
      } catch (e) {
        setGlobalCounter({ totalRewardedDonations: 0 });
      }

      // 6. Fetch pair counters for today
      try {
        const pairSnap = await getDocs(query(collection(db, 'dailyPairRewardCounters'), limit(50)));
        const pairsToday = pairSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.dateIST === todayIST);
        setPairCounters(pairsToday);
      } catch (e) {
        setPairCounters([]);
      }
    } catch (err) {
      console.warn('Error loading admin membership/rewards data:', err.message);
      setErrorNotice('Error loading membership records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, []);

  // Sync subSection prop
  useEffect(() => {
    if (subSection) setActiveTab(subSection);
  }, [subSection]);

  // Handle Approve
  const handleApprove = async (requestId) => {
    try {
      setActionLoading(true);
      await approveRedemptionRequest(db, requestId, adminUid);
      setNotice(`Request ${requestId} approved.`);
      await loadAllAdminData();
    } catch (err) {
      setErrorNotice('Failed to approve request: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Mark Paid (Simulated)
  const handleMarkPaid = async (requestId) => {
    try {
      setActionLoading(true);
      await markRedemptionAsPaid(db, requestId, adminUid);
      setNotice(`Request ${requestId} marked as PAID. Wallet & ledger updated.`);
      await loadAllAdminData();
    } catch (err) {
      setErrorNotice('Failed to mark paid: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectModalReq) return;
    try {
      setActionLoading(true);
      await rejectRedemptionRequest(db, rejectModalReq.requestId, adminUid, rejectReason.trim());
      setNotice(`Request ${rejectModalReq.requestId} rejected. Reserved tokens returned to original batches.`);
      setRejectModalReq(null);
      setRejectReason('');
      await loadAllAdminData();
    } catch (err) {
      setErrorNotice('Failed to reject: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Aggregated calculations
  const totalRevenue = transactions
    .filter((tx) => (tx.paymentStatus || 'completed') === 'completed')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const activeMembershipsCount = memberships.filter((m) => {
    const exp = m.expiresAt?.toDate ? m.expiresAt.toDate().getTime() : (m.expiresAt ? new Date(m.expiresAt).getTime() : 0);
    return exp > Date.now();
  }).length;
  const expiredMembershipsCount = memberships.length - activeMembershipsCount;
  const queuedPeriodsCount = membershipPeriods.filter((p) => p.status === 'upcoming').length;

  const filteredTxns = transactions.filter((tx) => {
    if (txFilter === 'all') return true;
    return (tx.paymentStatus || 'completed') === txFilter;
  });

  const filteredPeriods = membershipPeriods.filter((p) => {
    if (periodFilter === 'all') return true;
    const nowTime = Date.now();
    const s = parseDate(p.startDate)?.getTime() || 0;
    const e = parseDate(p.expiryDate)?.getTime() || 0;
    if (periodFilter === 'active') return nowTime >= s && nowTime < e && p.status !== 'cancelled';
    if (periodFilter === 'upcoming') return s > nowTime && p.status !== 'cancelled';
    if (periodFilter === 'cancelled') return p.status === 'cancelled' || p.isCancelled;
    if (periodFilter === 'expired') return e <= nowTime;
    return true;
  });

  const totalTokensAwarded = ledgerBatches.reduce((sum, b) => sum + (Number(b.tokensEarned) || 0), 0);
  const fuelTokens = ledgerBatches.filter((b) => b.planAtEarning === 'fuel_support').reduce((s, b) => s + (b.tokensEarned || 0), 0);
  const corridorTokens = ledgerBatches.filter((b) => b.planAtEarning === 'corridor_help').reduce((s, b) => s + (b.tokensEarned || 0), 0);

  const pendingRedemptions = redemptions.filter((r) => r.status === 'pending');
  const filteredRedemptions = redemptions.filter((r) => {
    if (redemptionFilter === 'all') return true;
    return r.status === redemptionFilter;
  });

  const filteredLedgerBatches = ledgerBatches.filter((b) => {
    if (!rewardSearchQuery.trim()) return true;
    const q = rewardSearchQuery.toLowerCase().trim();
    return (
      (b.userId && b.userId.toLowerCase().includes(q)) ||
      (b.donorName && b.donorName.toLowerCase().includes(q)) ||
      (b.listingId && b.listingId.toLowerCase().includes(q)) ||
      (b.donationId && b.donationId.toLowerCase().includes(q)) ||
      (b.donationTitle && b.donationTitle.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner Notice */}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-700 font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button type="button" onClick={() => setErrorNotice('')} className="text-red-700 font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('memberships')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'memberships'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('admin.tabMemberships', 'Donor Memberships & Contributions')}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {transactions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rewards')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'rewards'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('admin.tabRewards', 'Reward & Daily Limits')}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {ledgerBatches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('redemptions')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'redemptions'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>{t('admin.tabRedemptions', 'Donor Redemptions')}</span>
          {pendingRedemptions.length > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
              {pendingRedemptions.length} pending
            </span>
          )}
        </button>
      </div>

      {/* SECTION 1: MEMBERSHIPS & CONTRIBUTIONS */}
      {activeTab === 'memberships' && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                {activeMembershipsCount}
              </span>
              <span className="block text-xs font-semibold text-emerald-800 mt-0.5">
                {t('admin.activeMemberships', 'Active Donor Memberships')}
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                {queuedPeriodsCount}
              </span>
              <span className="block text-xs font-semibold text-blue-700 mt-0.5">
                {t('admin.queuedPassesCount', 'Queued Upcoming Passes')}
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                ₹{totalRevenue}
              </span>
              <span className="block text-xs font-semibold text-brand-900 mt-0.5">
                {t('admin.totalSupportRevenue', 'Total Donor Contributions')}
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                {transactions.length}
              </span>
              <span className="block text-xs font-semibold text-stone-600 mt-0.5">
                All Transactions Logged
              </span>
            </Card>
          </div>

          {/* Table 1: Support Transactions Audit Log */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Donor Support Transactions Audit Trail</h3>
                <p className="text-[11px] text-stone-500">Audits completed, failed, and cancelled simulated transactions</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg">
                  {['all', 'completed', 'failed', 'cancelled'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTxFilter(st)}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                        txFilter === st
                          ? 'bg-white text-stone-900 font-bold shadow-xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <Button variant="outline" size="sm" onClick={loadAllAdminData} disabled={loading}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredTxns.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No {txFilter !== 'all' ? txFilter : ''} support transactions recorded.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">User / Donor</th>
                      <th className="py-2.5 px-3">Plan</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTxns.map((tx) => {
                      const methodLabel = tx.paymentMethod === 'card'
                        ? `Card (•••• ${tx.paymentMethodDetails?.last4 || '4242'})`
                        : tx.paymentMethod === 'upi'
                        ? `UPI (${tx.paymentMethodDetails?.upiId || 'vpa'})`
                        : tx.paymentMethod === 'net_banking'
                        ? `Net Banking (${tx.paymentMethodDetails?.bankName || 'Bank'})`
                        : 'Simulated';
                      const st = tx.paymentStatus || 'completed';

                      return (
                        <tr key={tx.id || tx.transactionId} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                            {tx.transactionId || tx.id}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-stone-900">
                            {tx.userName || tx.userEmail || tx.userId}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="outline" size="sm" className="text-[10px]">
                              {tx.planName || tx.planId}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                            {methodLabel}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                            ₹{tx.amount}
                          </td>
                          <td className="py-2.5 px-3 text-stone-500 font-mono whitespace-nowrap">
                            {tx.timestampMs ? new Date(tx.timestampMs).toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant={
                                st === 'completed' ? 'active' : st === 'failed' ? 'danger' : 'neutral'
                              }
                              size="sm"
                              className="text-[10px]"
                            >
                              {st.toUpperCase()}
                            </Badge>
                            {tx.failureReason && (
                              <span className="block text-[10px] text-red-600 mt-0.5 max-w-[150px] truncate" title={tx.failureReason}>
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
          </Card>

          {/* Table 2: All Membership Periods Schedule */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">All Membership Periods Schedule</h3>
                <p className="text-[11px] text-stone-500">Consecutive stacking and scheduled passes for all donors</p>
              </div>

              <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg">
                {['all', 'active', 'upcoming', 'cancelled', 'expired'].map((pf) => (
                  <button
                    key={pf}
                    type="button"
                    onClick={() => setPeriodFilter(pf)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                      periodFilter === pf
                        ? 'bg-white text-stone-900 font-bold shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {pf}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredPeriods.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No {periodFilter !== 'all' ? periodFilter : ''} membership periods found.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Period ID</th>
                      <th className="py-2.5 px-3">Donor ID</th>
                      <th className="py-2.5 px-3">Plan</th>
                      <th className="py-2.5 px-3">Start Date</th>
                      <th className="py-2.5 px-3">Expiry Date</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Linked Txn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPeriods.map((p) => {
                      const sDate = parseDate(p.startDate);
                      const eDate = parseDate(p.expiryDate);
                      const nowTime = Date.now();
                      const isNowActive = nowTime >= (sDate?.getTime() || 0) && nowTime < (eDate?.getTime() || 0) && p.status !== 'cancelled';
                      const isNowUpcoming = (sDate?.getTime() || 0) > nowTime && p.status !== 'cancelled';

                      return (
                        <tr key={p.id || p.periodId} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-mono font-semibold text-stone-800 whitespace-nowrap">
                            {p.periodId || p.id}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-600 max-w-[120px] truncate">
                            {p.userId}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-stone-900 whitespace-nowrap">
                            {p.planName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-600 whitespace-nowrap">
                            {sDate ? sDate.toLocaleDateString('en-IN') : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-600 whitespace-nowrap">
                            {eDate ? eDate.toLocaleDateString('en-IN') : '—'}
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
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                            {p.transactionId ? p.transactionId.slice(-8) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 2: REWARD MONITORING & DAILY LIMITS */}
      {activeTab === 'rewards' && (
        <div className="space-y-6">
          {/* Today's Daily Limits Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 border-brand-200 bg-brand-50/20 space-y-2">
              <span className="text-xs font-semibold text-brand-900 uppercase tracking-wide">
                Today's Global Limit (IST)
              </span>
              <div className="text-3xl font-extrabold text-stone-900 font-mono">
                {globalCounter?.totalRewardedDonations || 0} / 5
              </div>
              <p className="text-[11px] text-stone-600">
                Only the first 5 reward-eligible completed donations generate tokens per IST day ({todayIST}).
              </p>
              <div className="pt-2">
                {(globalCounter?.totalRewardedDonations || 0) >= 5 ? (
                  <Badge variant="warning" size="sm">GLOBAL LIMIT REACHED</Badge>
                ) : (
                  <Badge variant="active" size="sm">
                    {5 - (globalCounter?.totalRewardedDonations || 0)} SLOTS AVAILABLE TODAY
                  </Badge>
                )}
              </div>
            </Card>

            <Card className="p-5 space-y-2">
              <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
                Total Tokens Awarded
              </span>
              <div className="text-3xl font-extrabold text-emerald-900 font-mono">
                {totalTokensAwarded}
              </div>
              <p className="text-[11px] text-stone-500">
                Fuel Support: <strong>{fuelTokens}</strong> • Corridor Help: <strong>{corridorTokens}</strong>
              </p>
            </Card>

            <Card className="p-5 space-y-2">
              <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
                Active Donor-NGO Pairs Today
              </span>
              <div className="text-3xl font-extrabold text-stone-900 font-mono">
                {pairCounters.length}
              </div>
              <p className="text-[11px] text-stone-500">
                Max 2 rewarded donations per pair per IST day.
              </p>
            </Card>
          </div>

          {/* Today's Active Pairs Log */}
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-stone-900 text-sm">Today's Donor-NGO Pair Limits ({todayIST})</h3>
            <div className="overflow-x-auto">
              {pairCounters.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-500">
                  No donor-NGO pairs have consumed reward slots today yet.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border">
                    <tr>
                      <th className="py-2 px-3">Pair ID</th>
                      <th className="py-2 px-3">Donor UID</th>
                      <th className="py-2 px-3">NGO UID</th>
                      <th className="py-2 px-3 text-right">Rewarded Donations</th>
                      <th className="py-2 px-3">Limit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pairCounters.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-mono text-stone-700">{p.id}</td>
                        <td className="py-2 px-3 font-mono text-stone-500">{p.donorId}</td>
                        <td className="py-2 px-3 font-mono text-stone-500">{p.ngoId}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                          {p.rewardedDonationCount} / 2
                        </td>
                        <td className="py-2 px-3">
                          {p.rewardedDonationCount >= 2 ? (
                            <Badge variant="warning" size="sm">PAIR LIMIT REACHED</Badge>
                          ) : (
                            <Badge variant="active" size="sm">1 MORE ALLOWED</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>

          {/* Section 2.2: Reward Ledger Audit & Quantity Verifications (Requirement 10) */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Reward Ledger Audit & Quantity Verifications</h3>
                <p className="text-xs text-stone-600">
                  Inspect donor accounts, original listings, food quantity (kg), calculated tokens, and active plan for each completed donation.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search donor or listing ID..."
                  value={rewardSearchQuery}
                  onChange={(e) => setRewardSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-surface text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredLedgerBatches.length === 0 ? (
                <div className="py-10 text-center text-xs text-stone-500 space-y-1">
                  <Coins className="w-8 h-8 text-stone-400 mx-auto" />
                  <p className="font-semibold text-stone-800">No reward ledger records match search criteria</p>
                  <p className="text-stone-500 text-[11px]">Completed verified food handovers earn 10 tokens per 2 kg donated.</p>
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-700 font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Donor Account</th>
                      <th className="py-2.5 px-3">Original Listing</th>
                      <th className="py-2.5 px-3 text-right">Donation Qty</th>
                      <th className="py-2.5 px-3 text-right">Tokens Calculated</th>
                      <th className="py-2.5 px-3">Membership Plan</th>
                      <th className="py-2.5 px-3">Reward Status</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLedgerBatches.map((b) => {
                      const dateStr = b.timestampMs
                        ? new Date(b.timestampMs).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '—';
                      return (
                        <tr key={b.id || b.batchId} className="hover:bg-surface-muted/50">
                          <td className="py-2.5 px-3 font-medium text-stone-900">
                            <div>{b.donorName || 'Donor'}</div>
                            <div className="font-mono text-[11px] text-stone-500">{b.userId}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-brand-900">{b.donationTitle || 'Food Donation'}</div>
                            <div className="font-mono text-[11px] text-stone-500">{b.listingId || b.donationId || '—'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-stone-900 whitespace-nowrap">
                            {b.foodQuantityKg != null ? `${b.foodQuantityKg} kg` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-mono font-bold text-emerald-900 text-xs">
                              +{b.tokensEarned}
                            </span>
                            <div className="text-[10px] text-stone-500 font-mono">
                              {b.calculationDetails || b.calculationFormula || (b.foodQuantityKg != null ? `(${b.foodQuantityKg}/2)*10` : '—')}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <Badge variant="outline" size="sm" className="text-[10px]">
                              {b.planNameAtEarning || b.planAtEarning || 'Fuel Support'}
                            </Badge>
                            <span className="ml-1 text-[10px] text-stone-500 font-mono">
                              (₹{b.redemptionRatePer100 || (b.redemptionRate * 100)}/100)
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge variant="active" size="sm" className="text-[10px] font-bold">
                              {(b.status || 'credited').toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-stone-600 text-[11px] whitespace-nowrap">
                            {dateStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 3: TOKEN REDEMPTIONS */}
      {activeTab === 'redemptions' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              {['all', 'pending', 'approved', 'paid', 'rejected'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setRedemptionFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    redemptionFilter === st
                      ? 'bg-brand-800 text-white shadow-sm'
                      : 'text-stone-600 hover:bg-surface-muted'
                  }`}
                >
                  {st} ({redemptions.filter((r) => st === 'all' || r.status === st).length})
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={loadAllAdminData} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Redemptions Table */}
          <Card className="p-5 space-y-4">
            <div className="overflow-x-auto">
              {filteredRedemptions.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-500">
                  No redemption requests matching "{redemptionFilter}".
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Request ID</th>
                      <th className="py-2.5 px-3">Donor UID</th>
                      <th className="py-2.5 px-3">Tokens</th>
                      <th className="py-2.5 px-3">Payout ₹</th>
                      <th className="py-2.5 px-3">UPI Destination</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRedemptions.map((r) => (
                      <tr key={r.id || r.requestId} className="hover:bg-surface-muted/50">
                        <td className="py-3 px-3 font-mono font-semibold text-stone-800">
                          {r.requestId || r.id}
                        </td>
                        <td className="py-3 px-3 font-mono text-stone-500 max-w-[120px] truncate">
                          {r.userId}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">
                          {r.requestedTokens}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-800 text-sm">
                          ₹{r.calculatedAmount}
                        </td>
                        <td className="py-3 px-3 font-mono text-stone-700">
                          {r.upiId}
                        </td>
                        <td className="py-3 px-3">
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
                          >
                            {(r.status || 'PENDING').toUpperCase()}
                          </Badge>
                          {r.rejectionReason && (
                            <span className="block text-[10px] text-red-600 mt-0.5">
                              {r.rejectionReason}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleApprove(r.requestId || r.id)}
                                  disabled={actionLoading}
                                  className="text-xs px-2.5 py-1"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRejectModalReq(r)}
                                  disabled={actionLoading}
                                  className="text-xs text-red-700 hover:text-red-900 px-2.5 py-1"
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {r.status === 'approved' && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleMarkPaid(r.requestId || r.id)}
                                disabled={actionLoading}
                                className="text-xs bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1"
                              >
                                Mark Paid (Demo)
                              </Button>
                            )}

                            {r.status === 'paid' && (
                              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 justify-end">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Payout Complete
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalReq && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-stone-900">
              Reject Redemption Request ({rejectModalReq.requestId})
            </h3>
            <p className="text-xs text-stone-600">
              Rejecting this request will immediately return the <strong>{rejectModalReq.requestedTokens} reserved tokens</strong> back to the user's original reward batches at their original valuation.
            </p>
            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700 block">
                  Rejection Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Invalid UPI handle, verification discrepancy, etc."
                  className="w-full p-2.5 text-xs rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-brand-700/20"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRejectModalReq(null)} disabled={actionLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="danger" size="sm" loading={actionLoading}>
                  Confirm Rejection & Return Tokens
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

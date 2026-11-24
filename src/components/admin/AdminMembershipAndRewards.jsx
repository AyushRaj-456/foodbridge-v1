import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { db, collection, query, getDocs, limit, doc, getDoc } from '../../services/firebase';
import { getISTDateString, SUPPORT_PLANS } from '../../config/membershipConfig';
import { getSupportTransactions } from '../../services/membershipService';
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
  ExternalLink
} from 'lucide-react';

export function AdminMembershipAndRewards({ adminUid, subSection = 'memberships' }) {
  const [activeTab, setActiveTab] = useState(subSection); // 'memberships' | 'rewards' | 'redemptions'
  const [redemptionFilter, setRedemptionFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'paid' | 'rejected'

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Data states
  const [transactions, setTransactions] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [ledgerBatches, setLedgerBatches] = useState([]);
  const [globalCounter, setGlobalCounter] = useState(null);
  const [pairCounters, setPairCounters] = useState([]);

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

      // 2. Fetch memberships (Donors only)
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
  const totalRevenue = transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const activeMembershipsCount = memberships.filter((m) => {
    const exp = m.expiresAt?.toDate ? m.expiresAt.toDate().getTime() : (m.expiresAt ? new Date(m.expiresAt).getTime() : 0);
    return exp > Date.now();
  }).length;
  const expiredMembershipsCount = memberships.length - activeMembershipsCount;

  const totalTokensAwarded = ledgerBatches.reduce((sum, b) => sum + (Number(b.tokensEarned) || 0), 0);
  const fuelTokens = ledgerBatches.filter((b) => b.planAtEarning === 'fuel_support').reduce((s, b) => s + (b.tokensEarned || 0), 0);
  const corridorTokens = ledgerBatches.filter((b) => b.planAtEarning === 'corridor_help').reduce((s, b) => s + (b.tokensEarned || 0), 0);

  const pendingRedemptions = redemptions.filter((r) => r.status === 'pending');
  const filteredRedemptions = redemptions.filter((r) => {
    if (redemptionFilter === 'all') return true;
    return r.status === redemptionFilter;
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
          <span>Donor Memberships & Contributions</span>
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
          <span>Reward & Daily Limits</span>
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
          <span>Donor Redemptions</span>
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
                Active Donor Memberships
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                {expiredMembershipsCount}
              </span>
              <span className="block text-xs font-semibold text-stone-500 mt-0.5">
                Expired Donor Memberships
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                ₹{totalRevenue}
              </span>
              <span className="block text-xs font-semibold text-brand-900 mt-0.5">
                Total Donor Contributions
              </span>
            </Card>

            <Card className="p-4 text-center">
              <span className="block text-2xl font-extrabold text-stone-900 font-mono">
                {transactions.length}
              </span>
              <span className="block text-xs font-semibold text-stone-600 mt-0.5">
                Donor Transactions Logged
              </span>
            </Card>
          </div>

          {/* Support Transactions Table */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="font-bold text-stone-900 text-sm">Donor Support Contributions Log</h3>
              <Button variant="outline" size="sm" onClick={loadAllAdminData} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              {transactions.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No support transactions recorded yet.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-muted text-stone-600 font-semibold border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Plan</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((tx) => (
                      <tr key={tx.id || tx.transactionId} className="hover:bg-surface-muted/50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-stone-800">{tx.transactionId || tx.id}</td>
                        <td className="py-2.5 px-3 font-medium text-stone-900">
                          {tx.userName || tx.userEmail || tx.userId}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" size="sm">
                            {tx.planName || tx.planId}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">₹{tx.amount}</td>
                        <td className="py-2.5 px-3 text-stone-500 font-mono">
                          {tx.timestampMs ? new Date(tx.timestampMs).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="active" size="sm" className="text-[10px]">
                            {tx.paymentStatus?.toUpperCase() || 'COMPLETED'}
                          </Badge>
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

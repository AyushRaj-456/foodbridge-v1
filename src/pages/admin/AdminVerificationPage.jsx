import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  db,
  collection,
  query,
  limit,
  where,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp
} from '../../services/firebase';
import { releaseRecipientCapacity } from '../../services/capacityService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { EmptyState } from '../../components/common/EmptyState';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ExternalLink,
  History,
  Building2,
  Truck,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  UserX,
  UserCheck,
  FileWarning,
  Utensils,
  Scale,
  Phone,
  Calendar,
  AlertCircle
} from 'lucide-react';

export function AdminVerificationPage() {
  const { t } = useLocale();
  const { user, isAdmin } = useAuth();

  // Primary Workspace Tabs: 'verification' | 'listings' | 'disputes' | 'suspensions' | 'audit'
  const [activeTab, setActiveTab] = useState('verification');
  const [verificationSubTab, setVerificationSubTab] = useState('pending'); // 'pending' | 'verified' | 'rejected'

  // Data Collections
  const [recipients, setRecipients] = useState([]);
  const [deliveryPartners, setDeliveryPartners] = useState([]);
  const [listings, setListings] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [listingFilter, setListingFilter] = useState('all'); // 'all' | 'active' | 'completed' | 'cancelled_expired'
  const [auditFilter, setAuditFilter] = useState('all');

  // Modals
  const [actionModal, setActionModal] = useState(null); // { item, entityType, decision }
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState('');

  // Listing Detail Modal
  const [inspectListing, setInspectListing] = useState(null);

  // Dispute Resolution Modal
  const [disputeModal, setDisputeModal] = useState(null); // delivery item
  const [disputeResolution, setDisputeResolution] = useState('complete'); // 'complete' | 'cancel'
  const [disputeNotes, setDisputeNotes] = useState('');

  // Suspension Modal
  const [suspendModal, setSuspendModal] = useState(null); // entity item
  const [suspendReason, setSuspendReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch recipient records from 'recipients' and 'users' (fallback scan)
      const recDocs = [];
      try {
        const recSnap = await getDocs(collection(db, 'recipients'));
        recSnap.docs.forEach((d) => recDocs.push({ id: d.id, ...d.data(), entityType: 'recipient' }));
      } catch (err) {
        console.warn('recipients collection query fallback:', err.message);
      }

      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('activeRole', '==', 'recipient')));
        usersSnap.docs.forEach((d) => {
          const u = d.data();
          if (!recDocs.some((r) => r.id === d.id || r.userId === d.id)) {
            recDocs.push({
              id: d.id,
              userId: d.id,
              email: u.email,
              organizationName: u.organizationName || u.profileData?.organizationName || u.email,
              contactPerson: u.contactPerson || u.profileData?.contactPerson || '',
              phone: u.contactPhone || u.phone || u.profileData?.phone || '',
              district: u.district || u.profileData?.district || 'Bengaluru Urban',
              address: u.address || u.profileData?.address || '',
              recipientCategory: u.recipientCategory || u.profileData?.recipientCategory || 'human',
              verificationStatus: u.verificationStatus || 'pending',
              entityType: 'recipient',
              createdAt: u.createdAt
            });
          }
        });
      } catch (err) {
        console.warn('users recipient fallback query:', err.message);
      }
      setRecipients(recDocs);

      // 2. Fetch delivery partners from 'deliveryPartners' and 'users'
      const delDocs = [];
      try {
        const delSnap = await getDocs(collection(db, 'deliveryPartners'));
        delSnap.docs.forEach((d) => delDocs.push({ id: d.id, ...d.data(), entityType: 'delivery' }));
      } catch (err) {
        console.warn('deliveryPartners collection query fallback:', err.message);
      }

      try {
        const delUsersSnap = await getDocs(query(collection(db, 'users'), where('activeRole', '==', 'delivery')));
        delUsersSnap.docs.forEach((d) => {
          const u = d.data();
          if (!delDocs.some((del) => del.id === d.id || del.userId === d.id)) {
            delDocs.push({
              id: d.id,
              userId: d.id,
              email: u.email,
              fullName: u.fullName || u.profileData?.fullName || u.email,
              phone: u.contactPhone || u.phone || u.profileData?.phone || '',
              vehicleType: u.vehicleType || u.profileData?.vehicleType || 'two_wheeler',
              serviceDistrict: u.district || u.profileData?.district || 'Bengaluru Urban',
              verificationStatus: u.verificationStatus || 'pending',
              entityType: 'delivery',
              createdAt: u.createdAt
            });
          }
        });
      } catch (err) {
        console.warn('users delivery fallback query:', err.message);
      }
      setDeliveryPartners(delDocs);

      // 3. Fetch listings
      try {
        const listSnap = await getDocs(query(collection(db, 'listings'), limit(100)));
        const listData = listSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        listData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setListings(listData);
      } catch (err) {
        console.warn('listings query fallback:', err.message);
      }

      // 4. Fetch deliveries
      try {
        const devSnap = await getDocs(query(collection(db, 'deliveries'), limit(100)));
        const devData = devSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        devData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDeliveries(devData);
      } catch (err) {
        console.warn('deliveries query fallback:', err.message);
      }

      // 5. Fetch audit logs
      try {
        const auditSnap = await getDocs(query(collection(db, 'auditLogs'), limit(100)));
        const logs = auditSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setAuditLogs(logs);
      } catch (err) {
        console.warn('auditLogs query fallback:', err.message);
      }
    } catch (err) {
      console.error('Error loading admin operations data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Verification Decision Handler
  const handleDecisionSubmit = async () => {
    if (!actionModal) return;
    const { item, entityType, decision } = actionModal;

    if ((decision === 'reject' || decision === 'info') && !reason.trim()) {
      alert('Please provide a reason or clarification message for this decision.');
      return;
    }

    try {
      setActionLoading(true);
      const newStatus = decision === 'approve'
        ? 'verified'
        : decision === 'reject'
        ? 'rejected'
        : 'info_requested';

      const collectionName = entityType === 'recipient' ? 'recipients' : 'deliveryPartners';
      const targetRef = doc(db, collectionName, item.userId || item.id);

      // Primary collection update
      try {
        await updateDoc(targetRef, {
          verificationStatus: newStatus,
          verifiedAt: newStatus === 'verified' ? serverTimestamp() : null,
          verifiedBy: user.uid,
          rejectionReason: (decision === 'reject' || decision === 'info') ? reason : null,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('Primary role document update notice:', err.message);
      }

      // Sync user document
      try {
        const userRef = doc(db, 'users', item.userId || item.id);
        await updateDoc(userRef, {
          verificationStatus: newStatus,
          verifiedAt: newStatus === 'verified' ? serverTimestamp() : null,
          verifiedBy: user.uid,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn('User document sync notice:', err.message);
      }

      // Immutable Audit Log Record (non-blocking)
      try {
        await addDoc(collection(db, 'auditLogs'), {
          actorUid: user.uid,
          actorEmail: user.email,
          targetUid: item.userId || item.id,
          targetName: item.organizationName || item.fullName || 'Unknown',
          targetType: entityType,
          action: `verification_${decision}`,
          previousStatus: item.verificationStatus || 'pending',
          newStatus,
          reason: reason.trim() || null,
          timestamp: serverTimestamp()
        });
      } catch (auditErr) {
        console.warn('Audit log write notice:', auditErr.message);
      }

      setNotice(`Marked ${item.organizationName || item.fullName} as ${newStatus.toUpperCase()}.`);
      setActionModal(null);
      setReason('');
      await loadData();
    } catch (err) {
      console.error('Failed to submit decision:', err);
      alert('Error recording verification decision: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Suspension / Unsuspension Handler
  const handleToggleSuspension = async () => {
    if (!suspendModal) return;
    const { entity, isCurrentlySuspended } = suspendModal;
    const newSuspendedState = !isCurrentlySuspended;

    if (newSuspendedState && !suspendReason.trim()) {
      alert('Please provide a valid administrative reason for account suspension.');
      return;
    }

    try {
      setActionLoading(true);
      const collectionName = entity.entityType === 'recipient'
        ? 'recipients'
        : entity.entityType === 'delivery'
        ? 'deliveryPartners'
        : 'users';

      const targetRef = doc(db, collectionName, entity.userId || entity.id);
      await updateDoc(targetRef, {
        suspended: newSuspendedState,
        suspendedAt: newSuspendedState ? serverTimestamp() : null,
        suspendedBy: user.uid,
        suspendedReason: newSuspendedState ? suspendReason.trim() : null,
        updatedAt: serverTimestamp()
      });

      // Immutable Audit Log
      await addDoc(collection(db, 'auditLogs'), {
        actorUid: user.uid,
        actorEmail: user.email,
        targetUid: entity.userId || entity.id,
        targetName: entity.organizationName || entity.fullName || entity.email || 'User',
        targetType: entity.entityType || 'user',
        action: newSuspendedState ? 'account_suspended' : 'account_unsuspended',
        reason: newSuspendedState ? suspendReason.trim() : 'Reinstated by administrator',
        timestamp: serverTimestamp()
      });

      setNotice(`Account for ${entity.organizationName || entity.fullName || 'user'} has been ${newSuspendedState ? 'SUSPENDED' : 'REINSTATED'}.`);
      setSuspendModal(null);
      setSuspendReason('');
      await loadData();
    } catch (err) {
      console.error('Suspension error:', err);
      alert('Error updating suspension status: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Dispute Resolution Handler
  const handleResolveDispute = async (e) => {
    e.preventDefault();
    if (!disputeModal) return;

    if (!disputeNotes.trim()) {
      alert('Please provide resolution notes for the audit trail.');
      return;
    }

    try {
      setActionLoading(true);
      const deliveryRef = doc(db, 'deliveries', disputeModal.id);

      if (disputeResolution === 'complete') {
        // Mark delivery and listing as completed
        await updateDoc(deliveryRef, {
          status: 'completed',
          adminResolution: disputeNotes.trim(),
          resolvedAt: serverTimestamp(),
          resolvedBy: user.uid,
          updatedAt: serverTimestamp()
        });

        if (disputeModal.listingId) {
          const listRef = doc(db, 'listings', disputeModal.listingId);
          await updateDoc(listRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // Cancel delivery and release recipient capacity
        await updateDoc(deliveryRef, {
          status: 'cancelled',
          adminResolution: disputeNotes.trim(),
          resolvedAt: serverTimestamp(),
          resolvedBy: user.uid,
          updatedAt: serverTimestamp()
        });

        if (disputeModal.listingId) {
          const listRef = doc(db, 'listings', disputeModal.listingId);
          await updateDoc(listRef, {
            status: 'cancelled',
            cancellationReason: `Admin dispute resolution: ${disputeNotes.trim()}`,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }

        if (disputeModal.recipientId && disputeModal.quantity) {
          try {
            await releaseRecipientCapacity(db, disputeModal.recipientId, disputeModal.quantity);
          } catch (capErr) {
            console.warn('Capacity release notice:', capErr.message);
          }
        }
      }

      // Write Audit Log
      await addDoc(collection(db, 'auditLogs'), {
        actorUid: user.uid,
        actorEmail: user.email,
        targetUid: disputeModal.id,
        targetName: disputeModal.listingTitle || 'Delivery Dispute',
        targetType: 'delivery',
        action: `dispute_resolved_${disputeResolution}`,
        reason: disputeNotes.trim(),
        timestamp: serverTimestamp()
      });

      setNotice(`Dispute on delivery #${disputeModal.id.substring(0, 7)} resolved as ${disputeResolution.toUpperCase()}.`);
      setDisputeModal(null);
      setDisputeNotes('');
      await loadData();
    } catch (err) {
      console.error('Error resolving dispute:', err);
      alert('Failed to resolve dispute: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Operational Metric Calculations
  const allPartnersAndOrgs = [...recipients, ...deliveryPartners];
  const pendingVerificationsCount = allPartnersAndOrgs.filter((i) => (i.verificationStatus || 'pending') === 'pending').length;
  const verifiedOrgsCount = allPartnersAndOrgs.filter((i) => i.verificationStatus === 'verified').length;
  const activeListingsCount = listings.filter((l) => ['matching', 'accepted', 'in_transit'].includes(l.status)).length;
  const completedListingsCount = listings.filter((l) => l.status === 'completed').length;
  const activeDisputes = deliveries.filter((d) => d.status === 'disputed' || d.status === 'failed');

  // Filtered Verification Items
  const filteredVerifications = allPartnersAndOrgs.filter((item) => {
    const status = item.verificationStatus || 'pending';
    const matchesSubTab =
      verificationSubTab === 'pending'
        ? status === 'pending'
        : verificationSubTab === 'verified'
        ? status === 'verified'
        : ['rejected', 'info_requested'].includes(status);

    if (!matchesSubTab) return false;
    if (!searchQuery) return true;
    const name = (item.organizationName || item.fullName || '').toLowerCase();
    const dist = (item.district || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase()) || dist.includes(searchQuery.toLowerCase());
  });

  // Filtered Listings
  const filteredListings = listings.filter((l) => {
    if (listingFilter === 'active' && !['matching', 'accepted', 'in_transit'].includes(l.status)) return false;
    if (listingFilter === 'completed' && l.status !== 'completed') return false;
    if (listingFilter === 'cancelled_expired' && !['cancelled', 'expired'].includes(l.status)) return false;

    if (!searchQuery) return true;
    const title = (l.title || '').toLowerCase();
    const donor = (l.donorName || '').toLowerCase();
    const dist = (l.district || '').toLowerCase();
    return (
      title.includes(searchQuery.toLowerCase()) ||
      donor.includes(searchQuery.toLowerCase()) ||
      dist.includes(searchQuery.toLowerCase())
    );
  });

  // Filtered Disputes
  const filteredDisputes = activeDisputes.filter((d) => {
    if (!searchQuery) return true;
    const title = (d.listingTitle || '').toLowerCase();
    const donor = (d.donorName || '').toLowerCase();
    const rec = (d.recipientName || '').toLowerCase();
    return title.includes(searchQuery.toLowerCase()) || donor.includes(searchQuery.toLowerCase()) || rec.includes(searchQuery.toLowerCase());
  });

  // Filtered Audit Logs
  const filteredAudit = auditLogs.filter((log) => {
    if (auditFilter === 'verification' && !log.action?.includes('verification')) return false;
    if (auditFilter === 'suspension' && !log.action?.includes('suspended')) return false;
    if (auditFilter === 'dispute' && !log.action?.includes('dispute')) return false;

    if (!searchQuery) return true;
    const target = (log.targetName || '').toLowerCase();
    const action = (log.action || '').toLowerCase();
    const email = (log.actorEmail || '').toLowerCase();
    return target.includes(searchQuery.toLowerCase()) || action.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrator Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            Admin Operations & Audit Console
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Operational oversight, partner verification, listing monitoring, dispute resolution, and immutable logs.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={loadData} loading={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="font-semibold text-green-950">Dismiss</button>
        </div>
      )}

      {/* Operational Metrics Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {verifiedOrgsCount}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Verified Partners
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {activeListingsCount}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Active Listings
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {completedListingsCount}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Completed Donations
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-amber-700 font-mono">
            {pendingVerificationsCount}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Pending Reviews
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className={`block text-2xl sm:text-3xl font-extrabold font-mono ${activeDisputes.length > 0 ? 'text-red-700' : 'text-stone-900'}`}>
            {activeDisputes.length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Active Disputes
          </span>
        </Card>
      </div>

      {/* Main Workspace Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px overflow-x-auto">
        {[
          { id: 'verification', label: 'Organization Verification', count: pendingVerificationsCount },
          { id: 'listings', label: 'Listings Oversight', count: listings.length },
          { id: 'disputes', label: 'Disputes & Issues', count: activeDisputes.length },
          { id: 'suspensions', label: 'Users & Suspension', count: allPartnersAndOrgs.length },
          { id: 'audit', label: 'Audit Trail', count: auditLogs.length }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
            className={`px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-brand-800 text-brand-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                tab.id === 'disputes' && tab.count > 0 ? 'bg-red-100 text-red-800' : 'bg-surface-muted text-stone-600'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Sub-Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-muted/60 p-3 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search by name, district, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
          />
        </div>

        {/* Tab-Specific Filters */}
        {activeTab === 'verification' && (
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {['pending', 'verified', 'rejected'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setVerificationSubTab(st)}
                className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                  verificationSubTab === st
                    ? 'bg-brand-800 text-white'
                    : 'bg-white border border-border text-stone-700 hover:bg-stone-50'
                }`}
              >
                {st === 'pending' ? 'Pending Review' : st === 'verified' ? 'Approved' : 'Rejected / Need Info'}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={listingFilter}
              onChange={(e) => setListingFilter(e.target.value)}
              className="px-2.5 py-1 rounded-md border border-border bg-white text-stone-800 text-xs focus:ring-2 focus:ring-brand-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active (Matching/In Transit)</option>
              <option value="completed">Completed Handovers</option>
              <option value="cancelled_expired">Cancelled & Expired</option>
            </select>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              className="px-2.5 py-1 rounded-md border border-border bg-white text-stone-800 text-xs focus:ring-2 focus:ring-brand-700"
            >
              <option value="all">All Actions</option>
              <option value="verification">Verification Actions</option>
              <option value="suspension">Suspension Actions</option>
              <option value="dispute">Dispute Resolutions</option>
            </select>
          </div>
        )}
      </div>

      {/* CONTENT PANELS */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-stone-500 text-sm">
            Loading operational workspace data...
          </div>
        ) : activeTab === 'verification' ? (
          /* 1. VERIFICATION VIEW */
          filteredVerifications.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No organization submissions match this status or search filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredVerifications.map((item) => {
                const isRec = item.entityType === 'recipient';
                return (
                  <Card key={item.id} className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isRec ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>
                          {isRec ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-stone-900 text-base">
                              {item.organizationName || item.fullName}
                            </h3>
                            <Badge variant={isRec ? 'recipient' : 'delivery'} size="sm">
                              {isRec ? item.category?.toUpperCase() || 'RECIPIENT' : 'DELIVERY PARTNER'}
                            </Badge>
                            {item.suspended && (
                              <Badge variant="danger" size="sm">SUSPENDED</Badge>
                            )}
                          </div>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {item.district} • Contact: {item.contactPerson || item.fullName} ({item.phone})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.proofUrl ? (
                          <a
                            href={item.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-800 hover:underline font-semibold bg-brand-50 px-2.5 py-1 rounded border border-brand-200"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View Document</span>
                          </a>
                        ) : (
                          <span className="text-xs text-stone-400 italic">No proof uploaded</span>
                        )}
                      </div>
                    </div>

                    {/* Operational Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">Address</span>
                        <span className="font-medium text-stone-900 truncate block">{item.address || 'Karnataka'}</span>
                      </div>
                      <div className="p-2.5 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">Service Radius</span>
                        <span className="font-medium text-stone-900">{item.serviceRadiusKm || 5} km</span>
                      </div>
                      <div className="p-2.5 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">{isRec ? 'Capacity' : 'Transport Mode'}</span>
                        <span className="font-medium text-stone-900">
                          {isRec ? `${item.availableAdditionalCapacity || 0} ${item.capacityUnit || 'meals'}` : item.transportMode || 'Two Wheeler'}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-surface-muted/60">
                        <span className="text-stone-500 block">Current Status</span>
                        <span className="font-bold capitalize text-stone-900">{item.verificationStatus || 'pending'}</span>
                      </div>
                    </div>

                    {/* Admin Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/60">
                      <span className="text-xs text-stone-500 font-mono">UID: {item.userId || item.id}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setActionModal({ item, entityType: item.entityType, decision: 'approve' })}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setActionModal({ item, entityType: item.entityType, decision: 'info' })}
                        >
                          <HelpCircle className="w-3.5 h-3.5 mr-1" />
                          Request Info
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setActionModal({ item, entityType: item.entityType, decision: 'reject' })}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>

                    {item.rejectionReason && (
                      <div className="p-3 bg-red-50 rounded-lg text-xs text-red-800 border border-red-200">
                        <strong>Review Note:</strong> {item.rejectionReason}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        ) : activeTab === 'listings' ? (
          /* 2. LISTINGS OVERSIGHT TABLE */
          filteredListings.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No food listings match the selected status or query.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-stone-700 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Listing Title</th>
                    <th className="px-4 py-3">Donor</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">District</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredListings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-stone-900">{listing.title}</td>
                      <td className="px-4 py-3 text-stone-600">{listing.donorName || 'Donor'}</td>
                      <td className="px-4 py-3 font-mono text-stone-900">{listing.quantity} {listing.unit}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          listing.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : listing.status === 'matching'
                            ? 'bg-amber-100 text-amber-800'
                            : listing.status === 'in_transit' || listing.status === 'accepted'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}>
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{listing.district || 'Karnataka'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-stone-500">
                        {listing.createdAt?.toDate ? listing.createdAt.toDate().toLocaleDateString() : 'Recent'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setInspectListing(listing)}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : activeTab === 'disputes' ? (
          /* 3. DISPUTES & ISSUES VIEW */
          filteredDisputes.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No active delivery disputes or reported transport failures logged.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredDisputes.map((delivery) => (
                <Card key={delivery.id} className="p-5 border-red-200 bg-red-50/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/80">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <h4 className="font-bold text-stone-900 text-base">
                          {delivery.listingTitle || 'Delivery Dispute'}
                        </h4>
                        <Badge variant="danger" size="sm">{delivery.status?.toUpperCase()}</Badge>
                      </div>
                      <p className="text-xs text-stone-600 mt-1">
                        Delivery ID: <span className="font-mono">{delivery.id}</span> • Listing ID: <span className="font-mono">{delivery.listingId}</span>
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => { setDisputeModal(delivery); setDisputeNotes(''); setDisputeResolution('complete'); }}
                    >
                      Resolve Dispute
                    </Button>
                  </div>

                  <div className="p-3 rounded-lg bg-white border border-red-200 text-xs space-y-1">
                    <span className="font-bold text-red-950 block">Issue Details:</span>
                    <p className="text-stone-700">
                      {delivery.disputeReason || delivery.failureReason || 'Discrepancy reported during handover.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2.5 rounded bg-white border border-border">
                      <span className="text-stone-500 block">Donor</span>
                      <span className="font-semibold text-stone-900">{delivery.donorName}</span>
                      <span className="text-[11px] text-stone-500 block">{delivery.donorPhone}</span>
                    </div>
                    <div className="p-2.5 rounded bg-white border border-border">
                      <span className="text-stone-500 block">Recipient</span>
                      <span className="font-semibold text-stone-900">{delivery.recipientName}</span>
                      <span className="text-[11px] text-stone-500 block">{delivery.recipientPhone}</span>
                    </div>
                    <div className="p-2.5 rounded bg-white border border-border">
                      <span className="text-stone-500 block">Courier</span>
                      <span className="font-semibold text-stone-900">{delivery.assignedPartnerName || 'Unassigned'}</span>
                      <span className="text-[11px] text-stone-500 block">{delivery.assignedPartnerPhone}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : activeTab === 'suspensions' ? (
          /* 4. USER & ORGANIZATION SUSPENSIONS VIEW */
          allPartnersAndOrgs.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No registered organizations or partners found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-muted border-b border-border text-stone-700 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Name / Entity</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">District</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Operational Status</th>
                    <th className="px-4 py-3 text-right">Suspension Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allPartnersAndOrgs.map((entity) => (
                    <tr key={entity.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {entity.organizationName || entity.fullName}
                      </td>
                      <td className="px-4 py-3 capitalize text-stone-600">
                        {entity.entityType === 'recipient' ? entity.category || 'Recipient' : 'Delivery Partner'}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{entity.district || 'Karnataka'}</td>
                      <td className="px-4 py-3 font-mono text-stone-600">{entity.phone || 'N/A'}</td>
                      <td className="px-4 py-3">
                        {entity.suspended ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            SUSPENDED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant={entity.suspended ? 'secondary' : 'danger'}
                          onClick={() => {
                            setSuspendModal({ entity, isCurrentlySuspended: Boolean(entity.suspended) });
                            setSuspendReason('');
                          }}
                        >
                          {entity.suspended ? (
                            <>
                              <UserCheck className="w-3.5 h-3.5 mr-1" />
                              Unsuspend
                            </>
                          ) : (
                            <>
                              <UserX className="w-3.5 h-3.5 mr-1" />
                              Suspend
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* 5. AUDIT HISTORY VIEW */
          filteredAudit.length === 0 ? (
            <p className="text-sm text-stone-500 py-16 text-center">No audit trail records match this query.</p>
          ) : (
            <div className="space-y-3">
              {filteredAudit.map((log) => (
                <Card key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">{log.action}</span>
                      <span className="text-stone-400">•</span>
                      <span className="font-semibold text-stone-800">{log.targetName}</span>
                      <Badge variant="neutral" size="sm">{log.targetType}</Badge>
                    </div>
                    {log.reason && (
                      <p className="text-stone-600 bg-surface-muted/60 p-2 rounded border border-border/60">
                        <strong>Reason / Notes:</strong> {log.reason}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-stone-500 flex-shrink-0">
                    <div>Audited by {log.actorEmail}</div>
                    <div className="font-mono text-[11px]">
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Verification Decision Modal */}
      {actionModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">
              {actionModal.decision === 'approve' && 'Approve Organization'}
              {actionModal.decision === 'reject' && 'Reject Organization'}
              {actionModal.decision === 'info' && 'Request More Information'}
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Target: <strong>{actionModal.item.organizationName || actionModal.item.fullName}</strong>
            </p>

            {(actionModal.decision === 'reject' || actionModal.decision === 'info') && (
              <Input
                id="decision-reason"
                label="Reason / Instructions (Required)"
                as="textarea"
                required
                rows={3}
                placeholder="Explain the safety, documentation, or operational issue..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}

            {actionModal.decision === 'approve' && (
              <p className="text-xs text-stone-600 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                Approving this organization will allow it to accept surplus food listings matching its category and capacity.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setActionModal(null); setReason(''); }} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant={actionModal.decision === 'reject' ? 'danger' : 'primary'}
                onClick={handleDecisionSubmit}
                loading={actionLoading}
              >
                Confirm Decision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Listing Detail Modal */}
      {inspectListing && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{inspectListing.title}</h3>
                <p className="text-xs text-stone-500">ID: {inspectListing.id} • Status: {inspectListing.status.toUpperCase()}</p>
              </div>
              <button onClick={() => setInspectListing(null)} className="text-stone-400 hover:text-stone-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-surface-muted">
                <span className="text-stone-500 block">Quantity & Unit</span>
                <span className="font-semibold text-stone-900 font-mono">{inspectListing.quantity} {inspectListing.unit}</span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted">
                <span className="text-stone-500 block">Food State</span>
                <span className="font-semibold text-stone-900 capitalize">{inspectListing.foodState?.replace('_', ' ')}</span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted">
                <span className="text-stone-500 block">Donor</span>
                <span className="font-semibold text-stone-900">{inspectListing.donorName}</span>
              </div>
              <div className="p-2.5 rounded bg-surface-muted">
                <span className="text-stone-500 block">Pickup Address</span>
                <span className="font-semibold text-stone-900 truncate block">{inspectListing.address}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-stone-800 block">Safety Engine Audit Trail:</span>
              {inspectListing.safetyAuditTrail?.map((check, idx) => (
                <div key={idx} className="p-2 rounded bg-surface-muted/60 text-stone-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{check.message}</span>
                </div>
              ))}
            </div>

            {inspectListing.cancellationReason && (
              <div className="p-2.5 rounded bg-red-50 text-red-800 text-xs border border-red-200">
                <strong>Cancellation Note:</strong> {inspectListing.cancellationReason}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setInspectListing(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Resolution Modal */}
      {disputeModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">Resolve Delivery Dispute</h3>
            <p className="text-xs text-stone-600">
              Delivery: <strong>{disputeModal.listingTitle}</strong> (#{disputeModal.id.substring(0, 7)})
            </p>

            <form onSubmit={handleResolveDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Administrative Action</label>
                <select
                  value={disputeResolution}
                  onChange={(e) => setDisputeResolution(e.target.value)}
                  className="w-full text-xs rounded-lg border border-border px-3 py-2 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
                >
                  <option value="complete">Mark Handover Completed (Override dispute)</option>
                  <option value="cancel">Cancel Handover & Release Reserved Capacity</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Resolution Audit Notes (Required)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain resolution findings and communication with donor/recipient..."
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  className="w-full text-xs rounded-lg border border-border px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setDisputeModal(null)} disabled={actionLoading}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={actionLoading}>
                  Confirm Resolution
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suspension Confirmation Modal */}
      {suspendModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">
              {suspendModal.isCurrentlySuspended ? 'Unsuspend Account' : 'Suspend Account'}
            </h3>
            <p className="text-xs text-stone-600">
              Target: <strong>{suspendModal.entity.organizationName || suspendModal.entity.fullName}</strong>
            </p>

            {!suspendModal.isCurrentlySuspended && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Reason for Suspension (Required)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail the non-compliance, expired registration, safety breach, or policy violation..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full text-xs rounded-lg border border-border px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700"
                />
              </div>
            )}

            {suspendModal.isCurrentlySuspended && (
              <p className="text-xs text-stone-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                Reinstating this account will allow the organization or courier to resume active participation.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSuspendModal(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button
                variant={suspendModal.isCurrentlySuspended ? 'primary' : 'danger'}
                onClick={handleToggleSuspension}
                loading={actionLoading}
              >
                {suspendModal.isCurrentlySuspended ? 'Confirm Reinstatement' : 'Confirm Suspension'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

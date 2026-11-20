import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  db,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
  limit
} from '../../services/firebase';
import { releaseRecipientCapacity } from '../../services/capacityService';
import {
  DELIVERY_STATUSES,
  confirmDeliveryAgreement,
  transitionDeliveryStatus
} from '../../services/deliveryService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Input } from '../../components/common/Input';
import { DonationChatModal } from '../../components/chat/DonationChatModal';
import {
  Utensils,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Calendar,
  XCircle,
  Eye,
  Edit,
  Truck,
  Building2,
  RefreshCw,
  Scale,
  Phone,
  PackageCheck,
  MessageSquare
} from 'lucide-react';

export function DonorDashboardPage() {
  const { t } = useLocale();
  const { user, profileData } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'history'

  // Fast session cache hydration for instant 0ms listing rendering
  const getCachedListings = () => {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage || !user) return [];
      const raw = window.sessionStorage.getItem(`foodbridge_donor_listings_${user.uid}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const initialListings = getCachedListings();
  const [listings, setListings] = useState(initialListings);
  const [deliveriesMap, setDeliveriesMap] = useState({});
  const [loading, setLoading] = useState(() => initialListings.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [chatModalListing, setChatModalListing] = useState(null);
  const [detailsModal, setDetailsModal] = useState(null); // listing object
  const [cancelModal, setCancelModal] = useState(null); // listing object
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchListings = async (isManualRefresh = false) => {
    if (!user) return;
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else if (listings.length === 0) {
        setLoading(true);
      }
      setError('');
      const q = query(collection(db, 'listings'), where('donorId', '==', user.uid), limit(50));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Sort in-memory to avoid needing composite Firestore index
      items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      setListings(items);

      // Persist to session storage for instant reload on next visit
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(`foodbridge_donor_listings_${user.uid}`, JSON.stringify(items));
        }
      } catch (e) {}

      // Fetch linked delivery documents in parallel with deduplication
      const uniqueDeliveryIds = [...new Set(items.map((i) => i.deliveryId).filter(Boolean))];
      if (uniqueDeliveryIds.length > 0) {
        const dSnaps = await Promise.all(
          uniqueDeliveryIds.map(async (id) => {
            try {
              const dSnap = await getDoc(doc(db, 'deliveries', id));
              return dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
            } catch (dErr) {
              console.warn('Error fetching delivery details for', id, dErr);
              return null;
            }
          })
        );
        const dMap = {};
        dSnaps.forEach((d) => {
          if (d) dMap[d.id] = d;
        });
        setDeliveriesMap(dMap);
      } else {
        setDeliveriesMap({});
      }
    } catch (err) {
      console.error('Error fetching donor listings:', err);
      setError('Unable to load listings. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [user]);

  const activeListings = listings.filter((l) => ['matching', 'accepted', 'in_transit'].includes(l.status));
  const historyListings = listings.filter((l) => ['completed', 'cancelled', 'expired'].includes(l.status));

  // Handle Mutual Handover Confirmations
  const handleConfirmDirectHandover = async (listing) => {
    try {
      setActionLoading(true);
      const listingRef = doc(db, 'listings', listing.id);
      await updateDoc(listingRef, {
        status: 'completed',
        handoverConfirmedByDonor: true,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSuccessMsg(`Direct handover for "${listing.title}" confirmed! Redistribution completed.`);
      await fetchListings();
    } catch (err) {
      console.error('Handover confirmation error:', err);
      setError('Failed to confirm handover: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAgreeDeliverySplit = async (deliveryId) => {
    try {
      setActionLoading(true);
      await confirmDeliveryAgreement(db, deliveryId, 'donor');
      setSuccessMsg('Agreed to delivery contribution. Delivery request is now visible to verified couriers.');
      await fetchListings();
    } catch (err) {
      console.error('Delivery agreement error:', err);
      setError('Failed to confirm delivery split: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCourierHandover = async (deliveryId) => {
    try {
      setActionLoading(true);
      await transitionDeliveryStatus(db, deliveryId, DELIVERY_STATUSES.PICKED_UP, { uid: user.uid, role: 'donor' });
      setSuccessMsg('Handover to courier confirmed! Food is now in transit.');
      await fetchListings();
    } catch (err) {
      console.error('Courier handover error:', err);
      setError('Failed to confirm courier handover: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Controlled Cancellation
  const handleConfirmCancel = async () => {
    if (!cancelModal) return;
    try {
      setActionLoading(true);
      const listingRef = doc(db, 'listings', cancelModal.id);

      // If listing was already accepted by a recipient, release their reserved capacity!
      if (cancelModal.acceptedRecipientId && cancelModal.status === 'accepted') {
        try {
          await releaseRecipientCapacity(db, cancelModal.acceptedRecipientId, cancelModal.quantity);
        } catch (capErr) {
          console.warn('Capacity release notice:', capErr.message);
        }
      }

      await updateDoc(listingRef, {
        status: 'cancelled',
        cancellationReason: cancelReason.trim() || 'Cancelled by donor',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccessMsg(`Listing "${cancelModal.title}" was cancelled.`);
      setCancelModal(null);
      setCancelReason('');
      await fetchListings();
    } catch (err) {
      console.error('Cancellation error:', err);
      setError('Failed to cancel listing: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Metrics summary
  const totalCompletedKg = historyListings
    .filter((l) => l.status === 'completed')
    .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-900 border border-brand-200 text-xs font-semibold mb-1">
            <Utensils className="w-3.5 h-3.5 text-brand-700" />
            <span>Donor Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            Surplus Food Listings
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            {profileData?.organizationName || 'Manage your active food donations and past redistribution history'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => fetchListings(true)} loading={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Link to="/listings/create">
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Create Food Listing</span>
            </Button>
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="font-semibold text-green-900">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-semibold text-red-900">Dismiss</button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {activeListings.length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Active Listings
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {activeListings.filter((l) => l.status === 'matching').length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Matching in Progress
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {activeListings.filter((l) => l.status === 'accepted' || l.status === 'in_transit').length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Accepted / In Transit
          </span>
        </Card>

        <Card className="p-4 text-center">
          <span className="block text-2xl sm:text-3xl font-extrabold text-stone-900 font-mono">
            {historyListings.filter((l) => l.status === 'completed').length}
          </span>
          <span className="block text-xs font-semibold text-stone-600 mt-0.5">
            Completed Handovers
          </span>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Active Listings</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {activeListings.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>Donation History</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-surface-muted text-stone-600">
            {historyListings.length}
          </span>
        </button>
      </div>

      {/* CONTENT AREA */}
      <div>
        {loading ? (
          <div className="py-20 text-center text-stone-500 text-sm">
            Loading your listings...
          </div>
        ) : activeTab === 'active' ? (
          /* Active Listings List */
          activeListings.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title="No Active Surplus Listings"
              description="Have extra cooked meals, fresh produce, or raw kitchen trims? Create a listing to redistribute food to verified organizations."
              action={
                <Link to="/listings/create">
                  <Button variant="primary">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Food Listing
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeListings.map((listing) => (
                <Card key={listing.id} className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-border/70">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-stone-900 text-lg">
                          {listing.title}
                        </h3>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          listing.status === 'matching'
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : listing.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : 'bg-sky-100 text-sky-900 border border-sky-200'
                        }`}>
                          {listing.status === 'matching' ? 'Matching Candidates' : listing.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {listing.district} • Pickup: {listing.address}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xl font-bold font-mono text-stone-900">
                        {listing.quantity} {listing.unit}
                      </span>
                      <span className="block text-[11px] text-stone-500">
                        {(listing.foodState || 'freshly_prepared').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Fact Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded bg-surface-muted/60">
                      <span className="text-stone-500 block">Safe-Use Deadline</span>
                      <span className="font-mono text-stone-900">
                        {listing.safeUseDeadline ? new Date(listing.safeUseDeadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'N/A'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-surface-muted/60">
                      <span className="text-stone-500 block">Holding Condition</span>
                      <span className="font-medium text-stone-900 capitalize">
                        {(listing.storageCondition || 'ambient').replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-surface-muted/60">
                      <span className="text-stone-500 block">Pickup Window</span>
                      <span className="font-mono text-stone-900">
                        {listing.availableUntil ? new Date(listing.availableUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Until deadline'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-surface-muted/60">
                      <span className="text-stone-500 block">Dietary & Allergens</span>
                      <span className="font-medium text-stone-900">
                        {listing.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                      </span>
                    </div>
                  </div>

                  {/* Eligible Destination Categories */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs font-semibold text-stone-600 mr-1">Eligible Categories:</span>
                    {listing.eligibleCategories?.map((cat) => (
                      <Badge key={cat} variant={cat} size="sm">
                        {cat.toUpperCase()}
                      </Badge>
                    ))}
                  </div>

                  {/* Accepted Recipient & Handover Coordination Area */}
                  {listing.acceptedRecipientId && (
                    <div className="space-y-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-950">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                          <div>
                            <span>
                              Claimed by <strong>{listing.acceptedRecipientName || 'Verified Organization'}</strong>
                            </span>
                            {listing.acceptedRecipientPhone && (
                              <a href={`tel:${listing.acceptedRecipientPhone}`} className="ml-2 font-mono text-emerald-800 hover:underline">
                                ({listing.acceptedRecipientPhone})
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => setChatModalListing(listing)}
                          >
                            <MessageSquare className="w-3.5 h-3.5 mr-1" />
                            <span>Chat</span>
                          </Button>
                          <span className="font-semibold text-emerald-800 text-[11px] px-2 py-0.5 rounded bg-emerald-100">
                            {listing.deliveryMode === 'delivery_partner' ? 'Delivery Partner Transport' : 'Direct Recipient Pickup'}
                          </span>
                        </div>
                      </div>

                      {/* Direct Pickup Mode Handover Action */}
                      {listing.deliveryMode !== 'delivery_partner' && listing.status !== 'completed' && (
                        <div className="p-3.5 rounded-xl bg-surface-muted border border-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="font-semibold text-stone-900 block">Direct Recipient Handover</span>
                            <span className="text-stone-500 text-[11px]">
                              Confirm once the recipient organization arrives and receives the food.
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleConfirmDirectHandover(listing)}
                            disabled={actionLoading}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Confirm Direct Handover
                          </Button>
                        </div>
                      )}

                      {/* Delivery Partner Mode Details */}
                      {listing.deliveryMode === 'delivery_partner' && listing.deliveryId && deliveriesMap[listing.deliveryId] && (() => {
                        const del = deliveriesMap[listing.deliveryId];
                        return (
                          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Truck className="w-4 h-4 text-stone-700" />
                                <span className="font-semibold text-stone-900">Delivery Partner Request</span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  del.status === DELIVERY_STATUSES.ASSIGNED || del.status === DELIVERY_STATUSES.PICKED_UP
                                    ? 'bg-blue-100 text-blue-800'
                                    : del.status === DELIVERY_STATUSES.REQUESTED
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-stone-200 text-stone-700'
                                }`}>
                                  {del.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="text-stone-600 font-mono text-[11px]">
                                Total: ₹{del.totalAmount} (Donor Share: ₹{del.donorContribution})
                              </div>
                            </div>

                            {/* Pending Cost Split Agreement */}
                            {del.status === DELIVERY_STATUSES.PENDING_AGREEMENT && !del.donorAgreed && (
                              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-amber-900 text-[11px]">
                                  Recipient proposed delivery cost of ₹{del.totalAmount} (Your contribution: ₹{del.donorContribution}, direct settlement).
                                </span>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleAgreeDeliverySplit(del.id)}
                                  disabled={actionLoading}
                                >
                                  Agree to Contribution (₹{del.donorContribution})
                                </Button>
                              </div>
                            )}

                            {/* Assigned Courier Details */}
                            {del.assignedPartnerName && (
                              <div className="p-2.5 rounded-lg bg-white border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <span className="text-stone-500 block text-[10px]">Assigned Delivery Courier</span>
                                  <span className="font-semibold text-stone-900">{del.assignedPartnerName}</span>
                                  {del.assignedPartnerPhone && (
                                    <span className="text-stone-600 text-[11px] block">{del.assignedPartnerPhone}</span>
                                  )}
                                </div>
                                {del.status === DELIVERY_STATUSES.ASSIGNED && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleConfirmCourierHandover(del.id)}
                                    disabled={actionLoading}
                                  >
                                    <PackageCheck className="w-3.5 h-3.5 mr-1" />
                                    Confirm Handover to Courier
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setDetailsModal(listing)}
                      className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-brand-800 font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Safety Audit</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {listing.status === 'matching' && (
                        <Link to={`/listings/edit/${listing.id}`}>
                          <Button size="sm" variant="secondary">
                            <Edit className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                        </Link>
                      )}

                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setCancelModal(listing)}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* Donation History Tab */
          historyListings.length === 0 ? (
            <div className="py-16 text-center text-stone-500 text-sm">
              No historical donation records logged yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {historyListings.map((item) => (
                <Card key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-sm">{item.title}</h4>
                      <Badge variant={item.status === 'completed' ? 'active' : 'neutral'} size="sm">
                        {item.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-stone-500 mt-0.5">
                      {item.quantity} {item.unit} • {item.district}
                      {item.cancellationReason && ` • Note: ${item.cancellationReason}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {item.acceptedRecipientId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setChatModalListing(item)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1" />
                        Chat & Log
                      </Button>
                    )}
                    <div className="text-right text-stone-500 font-mono text-[11px]">
                      {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Previous'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {/* Safety Audit & Details Modal */}
      {detailsModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{detailsModal.title}</h3>
                <p className="text-xs text-stone-500">{detailsModal.quantity} {detailsModal.unit}</p>
              </div>
              <button onClick={() => setDetailsModal(null)} className="text-stone-400 hover:text-stone-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <span className="font-bold text-stone-800 block">Automated Safety Rule Checks:</span>
              {detailsModal.safetyAuditTrail?.map((check, idx) => (
                <div key={idx} className="p-2 rounded bg-surface-muted text-stone-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{check.message}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
              <strong>Notice:</strong> {detailsModal.inspectionNotice}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setDetailsModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Cancellation Modal */}
      {cancelModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-xl border border-border max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-stone-900">Cancel Surplus Listing</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to cancel <strong>"{cancelModal.title}"</strong>?
              {cancelModal.status === 'accepted' && (
                <span className="block mt-1 text-amber-800 font-semibold">
                  Warning: This listing was already accepted by a recipient. Cancelling will notify them and release their reserved capacity.
                </span>
              )}
            </p>

            <Input
              id="cancel-reason"
              label="Cancellation Reason (Optional)"
              as="textarea"
              rows={2}
              placeholder="e.g. Consumed internally by mess, food damaged in storage..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setCancelModal(null); setCancelReason(''); }} disabled={actionLoading}>
                Keep Listing
              </Button>
              <Button variant="danger" onClick={handleConfirmCancel} loading={actionLoading}>
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time In-App Donation & Delivery Chat */}
      {chatModalListing && (
        <DonationChatModal
          donation={chatModalListing}
          onClose={() => setChatModalListing(null)}
          onDeliveryUpdated={() => fetchListings(true)}
        />
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import {
  db,
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from '../../services/firebase';
import {
  evaluateFoodSafety,
  FOOD_STATES,
  STORAGE_CONDITIONS,
  ALLERGEN_OPTIONS,
  RECIPIENT_CATEGORIES
} from '../../services/safetyEngine';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge } from '../../components/common/Badge';
import {
  Utensils,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Camera,
  CheckCircle2,
  ArrowLeft,
  Scale,
  Calendar,
  MapPin,
  Info
} from 'lucide-react';

const KARNATAKA_DISTRICTS = [
  'Bengaluru Urban',
  'Bengaluru Rural',
  'Tumakuru',
  'Mysuru',
  'Hubballi-Dharwad',
  'Belagavi',
  'Dakshina Kannada (Mangaluru)',
  'Kalaburagi',
  'Ballari',
  'Shivamogga',
  'Hassan',
  'Mandya',
  'Udupi',
  'Davangere'
];

export function CreateListingPage() {
  const { t } = useLocale();
  const { user, profileData } = useAuth();
  const navigate = useNavigate();
  const { id: editListingId } = useParams();

  const isEditing = Boolean(editListingId);

  const formatDateTime = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const now = new Date();

  // Form State initialized with sensible defaults
  const [formData, setFormData] = useState(() => ({
    title: '',
    description: '',
    quantity: 25,
    unit: 'meals', // meals, kg, liters, crates
    donorCategory: profileData?.donorType || 'mess',
    contactPerson: profileData?.contactPerson || '',
    contactPhone: profileData?.phone || '',
    address: profileData?.address || '',
    district: profileData?.district || 'Bengaluru Urban',
    latitude: 12.9716,
    longitude: 77.5946,
    pickupInstructions: profileData?.pickupInstructions || '',
    availableFrom: formatDateTime(new Date(now.getTime() + 15 * 60 * 1000)),
    availableUntil: formatDateTime(new Date(now.getTime() + 4 * 60 * 60 * 1000)),
    preparedAt: formatDateTime(new Date(now.getTime() - 30 * 60 * 1000)),
    safeUseDeadline: formatDateTime(new Date(now.getTime() + 6 * 60 * 60 * 1000)),
    storageCondition: STORAGE_CONDITIONS.HOT_HELD,
    foodState: FOOD_STATES.FRESHLY_PREPARED,
    isVegetarian: true,
    allergens: ['none'],
    intendedSuitability: ['human'],
    donorDeclaration: false,
    photoUrl: '',
    photoName: ''
  }));

  const [loading, setLoading] = useState(false);
  const [fetchingExisting, setFetchingExisting] = useState(isEditing);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const isSubmittingRef = React.useRef(false);

  // Sync profile data if loaded asynchronously on new listing
  useEffect(() => {
    if (!isEditing && profileData) {
      setFormData((prev) => ({
        ...prev,
        contactPerson: prev.contactPerson || profileData.contactPerson || '',
        contactPhone: prev.contactPhone || profileData.phone || '',
        address: prev.address || profileData.address || '',
        district: prev.district || profileData.district || 'Bengaluru Urban'
      }));
    }
  }, [isEditing, profileData]);

  // If editing, load existing listing data
  useEffect(() => {
    if (isEditing) {
      const loadExisting = async () => {
        try {
          const docRef = doc(db, 'listings', editListingId);
          const snap = await getDoc(docRef);
          if (!snap.exists()) {
            setError('Listing not found');
            return;
          }
          const data = snap.data();
          if (data.donorId !== user.uid) {
            setError('Unauthorized: you can only edit your own listings.');
            return;
          }
          if (data.status !== 'matching') {
            setError('Cannot edit listing once accepted or in transit. Use cancellation instead.');
            return;
          }
          setFormData(data);
          if (data.photoUrl) setPhotoPreview(data.photoUrl);
        } catch (err) {
          setError('Error loading listing: ' + err.message);
        } finally {
          setFetchingExisting(false);
        }
      };
      loadExisting();
    }
  }, [isEditing, editListingId, user.uid]);

  // Real-time automated safety evaluation preview
  const safetyEvaluation = evaluateFoodSafety({
    foodState: formData.foodState,
    preparedAt: formData.preparedAt,
    safeUseDeadline: formData.safeUseDeadline,
    storageCondition: formData.storageCondition,
    isVegetarian: formData.isVegetarian,
    donorDeclaration: formData.donorDeclaration,
    intendedSuitability: formData.intendedSuitability
  });

  // Strict form validity evaluation: all required fields must be present and safety verified
  const isFormValid = Boolean(
    formData.title?.trim() &&
    formData.address?.trim() &&
    formData.contactPhone?.trim() &&
    Number(formData.quantity) > 0 &&
    formData.safeUseDeadline &&
    formData.donorDeclaration &&
    safetyEvaluation.isEligible
  );

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    try {
      setLoading(true);
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);

      const photoRef = ref(storage, `listings/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(photoRef, file);
      const downloadUrl = await getDownloadURL(photoRef);
      setFormData((prev) => ({
        ...prev,
        photoUrl: downloadUrl,
        photoName: file.name
      }));
    } catch (err) {
      console.warn('Listing photo upload fallback:', err.message);
      // Local fallback
      setFormData((prev) => ({
        ...prev,
        photoUrl: 'local://listing-photo.jpg',
        photoName: file.name
      }));
    } finally {
      setLoading(false);
    }
  };

  const toggleAllergen = (allergenId) => {
    if (allergenId === 'none') {
      setFormData((prev) => ({ ...prev, allergens: ['none'] }));
      return;
    }
    const current = formData.allergens.filter((a) => a !== 'none');
    if (current.includes(allergenId)) {
      const updated = current.filter((a) => a !== allergenId);
      setFormData((prev) => ({ ...prev, allergens: updated.length === 0 ? ['none'] : updated }));
    } else {
      setFormData((prev) => ({ ...prev, allergens: [...current, allergenId] }));
    }
  };

  const toggleIntendedSuitability = (catId) => {
    if (formData.intendedSuitability.includes(catId)) {
      if (formData.intendedSuitability.length === 1) return; // Keep at least one
      setFormData((prev) => ({
        ...prev,
        intendedSuitability: prev.intendedSuitability.filter((c) => c !== catId)
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        intendedSuitability: [...prev.intendedSuitability, catId]
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || isSubmittingRef.current) return;
    setError('');
    setSuccessMsg('');

    if (!formData.title || !formData.address || !formData.contactPhone) {
      setError('Please fill out all required fields.');
      return;
    }

    if (Number(formData.quantity) <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    if (!formData.safeUseDeadline) {
      setError('A safe-use deadline is required.');
      return;
    }

    if (!formData.donorDeclaration) {
      setError('You must confirm the safety and hygiene declaration before publishing.');
      return;
    }

    // Server-side safety verification
    const verifiedSafety = evaluateFoodSafety(formData);
    if (!verifiedSafety.isEligible) {
      setError('This item cannot be matched to any destination under FoodBridge safety rules. Please verify the food state and deadline.');
      return;
    }

    try {
      isSubmittingRef.current = true;
      setLoading(true);

      const listingPayload = {
        donorId: user.uid,
        donorEmail: user.email,
        donorName: profileData?.organizationName || user.email,
        title: formData.title.trim(),
        description: formData.description.trim(),
        quantity: Number(formData.quantity),
        unit: formData.unit,
        donorCategory: formData.donorCategory,
        contactPerson: formData.contactPerson.trim(),
        contactPhone: formData.contactPhone.trim(),
        address: formData.address.trim(),
        district: formData.district,
        latitude: formData.latitude,
        longitude: formData.longitude,
        pickupInstructions: formData.pickupInstructions.trim(),
        availableFrom: formData.availableFrom,
        availableUntil: formData.availableUntil,
        preparedAt: formData.preparedAt || null,
        safeUseDeadline: formData.safeUseDeadline,
        storageCondition: formData.storageCondition,
        foodState: formData.foodState,
        isVegetarian: formData.isVegetarian,
        allergens: formData.allergens,
        intendedSuitability: formData.intendedSuitability,
        donorDeclaration: formData.donorDeclaration,
        photoUrl: formData.photoUrl || null,
        photoName: formData.photoName || null,

        // Server-evaluated safety attributes
        eligibleCategories: verifiedSafety.eligibleCategories,
        safetyAuditTrail: verifiedSafety.safetyChecks,
        inspectionNotice: verifiedSafety.inspectionNotice,

        // Matching & lifecycle state
        status: 'matching', // matching | accepted | in_transit | completed | cancelled | expired
        matchingRadiusKm: 1.5, // Initial configurable radius
        radiusExpansionCount: 0,
        acceptedRecipientId: null,
        acceptedRecipientName: null,
        acceptedAt: null,
        deliveryMode: 'pickup', // direct_pickup | delivery_partner
        deliveryPartnerId: null,
        handoverConfirmedByDonor: false,
        handoverConfirmedByRecipient: false,
        createdAt: isEditing ? formData.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (isEditing) {
        const docRef = doc(db, 'listings', editListingId);
        await updateDoc(docRef, listingPayload);
      } else {
        await addDoc(collection(db, 'listings'), listingPayload);
      }

      // Invalidate client-side listings cache so fresh listings load immediately
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem('foodbridge_donor_listings_' + user.uid);
        }
      } catch (e) {}

      setSuccessMsg(isEditing ? 'Listing updated successfully!' : 'Surplus food listing published successfully!');
      setTimeout(() => {
        navigate('/donor/dashboard', { replace: true });
      }, 500);
    } catch (err) {
      console.error('Error saving listing:', err);
      setError(err.message || 'Error publishing surplus listing.');
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  if (fetchingExisting) {
    return (
      <div className="py-20 text-center text-stone-500 text-sm">
        Loading existing listing details...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* Top Breadcrumb */}
      <div className="mb-6">
        <Link
          to="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>
      </div>

      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold mb-2">
          <Utensils className="w-3.5 h-3.5 text-emerald-700" />
          <span>Surplus Food Redistribution</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
          {isEditing ? 'Edit Surplus Food Listing' : 'Create Surplus Food Listing'}
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          Provide structured facts about your surplus food. Automatic safety rules verify suitability for verified human, animal, or green processing destinations.
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 flex items-start gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          // Prevent accidental form submission when pressing Enter inside standard text inputs
          if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit') {
            e.preventDefault();
          }
        }}
        className="space-y-8"
      >
        {/* SECTION 1: FOOD DETAILS */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-base sm:text-lg font-bold text-stone-900 pb-3 border-b border-border">
            1. Food / Material Facts
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                id="listing-title"
                label={t('donor.title', 'Food / Material Title')}
                required
                placeholder="e.g. Steamed Rice and Mixed Vegetable Sambar, or Surplus Bakery Breads"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                id="listing-desc"
                label={t('donor.description', 'Description & Details')}
                as="textarea"
                rows={2}
                placeholder="Describe preparation details, packaging, portioning, or specific handling advice..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <Input
              id="listing-quantity"
              label={t('donor.quantity', 'Quantity')}
              type="number"
              min="1"
              required
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            />

            <Input
              id="listing-unit"
              label={t('donor.unit', 'Measurement Unit')}
              as="select"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            >
              <option value="meals">{t('donor.mealsUnit', 'Meals / Portions')}</option>
              <option value="kg">{t('donor.kgUnit', 'Kilograms (kg)')}</option>
              <option value="liters">{t('donor.litersUnit', 'Liters (L)')}</option>
              <option value="crates">{t('donor.cratesUnit', 'Crates / Boxes')}</option>
            </Input>

            <Input
              id="listing-state"
              label={t('donor.foodState', 'Food State / Condition')}
              as="select"
              value={formData.foodState}
              onChange={(e) => setFormData({ ...formData, foodState: e.target.value })}
            >
              <option value={FOOD_STATES.FRESHLY_PREPARED}>{t('donor.freshPrepared', 'Freshly Prepared / Cooked Meal')}</option>
              <option value={FOOD_STATES.PACKAGED_SEALED}>{t('donor.packagedSealed', 'Packaged & Sealed Edibles')}</option>
              <option value={FOOD_STATES.RAW_PRODUCE}>{t('donor.rawProduce', 'Raw Fresh Produce (Vegetables/Fruits)')}</option>
              <option value={FOOD_STATES.TRIMMED_SCRAPS}>{t('donor.trimmedScraps', 'Kitchen Prep Trims & Scraps')}</option>
              <option value={FOOD_STATES.SPOILED_EXPIRED}>{t('donor.spoiledExpired', 'Spoiled / Expired Organic Residues')}</option>
            </Input>

            <Input
              id="listing-storage"
              label={t('donor.storageCondition', 'Current Storage & Holding Condition')}
              as="select"
              value={formData.storageCondition}
              onChange={(e) => setFormData({ ...formData, storageCondition: e.target.value })}
            >
              <option value={STORAGE_CONDITIONS.HOT_HELD}>{t('donor.hotHeld', 'Hot Held (above 60°C)')}</option>
              <option value={STORAGE_CONDITIONS.COLD_HELD}>{t('donor.coldHeld', 'Refrigerated / Cold Held (below 5°C)')}</option>
              <option value={STORAGE_CONDITIONS.ROOM_TEMP}>{t('donor.roomTemp', 'Ambient Room Temperature')}</option>
              <option value={STORAGE_CONDITIONS.DRY_STORAGE}>{t('donor.dryStorage', 'Dry Pantry Storage')}</option>
            </Input>

            {/* Vegetarian vs Non-Vegetarian (Conditional) */}
            <div className="sm:col-span-2 pt-2">
              <label className="text-xs sm:text-sm font-semibold text-stone-800 block mb-2">
                Dietary Classification
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="isVegetarian"
                    checked={formData.isVegetarian === true}
                    onChange={() => setFormData({ ...formData, isVegetarian: true })}
                    className="text-brand-800 focus:ring-brand-700"
                  />
                  <span className="font-semibold text-emerald-800">Pure Vegetarian</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="isVegetarian"
                    checked={formData.isVegetarian === false}
                    onChange={() => setFormData({ ...formData, isVegetarian: false })}
                    className="text-brand-800 focus:ring-brand-700"
                  />
                  <span className="font-semibold text-stone-800">Contains Meat / Poultry / Fish</span>
                </label>
              </div>
            </div>

            {/* Allergens Checklist */}
            <div className="sm:col-span-2 pt-2">
              <label className="text-xs sm:text-sm font-semibold text-stone-800 block mb-2">
                Allergens (Known or Handled in Kitchen)
              </label>
              <div className="flex flex-wrap gap-2">
                {ALLERGEN_OPTIONS.map((alg) => {
                  const isChecked = formData.allergens.includes(alg.id);
                  return (
                    <button
                      type="button"
                      key={alg.id}
                      onClick={() => toggleAllergen(alg.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        isChecked
                          ? 'bg-brand-50 border-brand-700 text-brand-900 font-semibold'
                          : 'bg-white border-border text-stone-600 hover:bg-surface-muted'
                      }`}
                    >
                      {alg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* SECTION 2: TIMESTAMPS & DEADLINES */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-base sm:text-lg font-bold text-stone-900 pb-3 border-b border-border">
            2. Times & Safe-Use Window
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formData.foodState === FOOD_STATES.FRESHLY_PREPARED && (
              <Input
                id="listing-prep-time"
                label={t('donor.prepTime', 'Preparation / Cooking Time')}
                type="datetime-local"
                required
                value={formData.preparedAt}
                onChange={(e) => setFormData({ ...formData, preparedAt: e.target.value })}
              />
            )}

            <Input
              id="listing-deadline"
              label={t('donor.safeUseDeadline', 'Safe-Use / Consumption Deadline')}
              type="datetime-local"
              required
              hint="After this timestamp, food is deemed unfit for consumption"
              value={formData.safeUseDeadline}
              onChange={(e) => setFormData({ ...formData, safeUseDeadline: e.target.value })}
            />

            <Input
              id="listing-avail-from"
              label="Pickup Available From"
              type="datetime-local"
              required
              value={formData.availableFrom}
              onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
            />

            <Input
              id="listing-avail-until"
              label="Pickup Available Until"
              type="datetime-local"
              required
              value={formData.availableUntil}
              onChange={(e) => setFormData({ ...formData, availableUntil: e.target.value })}
            />
          </div>
        </Card>

        {/* SECTION 3: PICKUP LOCATION & COORDINATION */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-base sm:text-lg font-bold text-stone-900 pb-3 border-b border-border">
            3. Pickup Location & Logistics
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="listing-contact-person"
              label="Pickup Contact Person"
              required
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />

            <Input
              id="listing-phone"
              label="Pickup Contact Phone"
              type="tel"
              required
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
            />

            <Input
              id="listing-district"
              label="District"
              as="select"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
            >
              {KARNATAKA_DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Input>

            <div className="sm:col-span-2">
              <Input
                id="listing-address"
                label={t('donor.pickupAddress', 'Full Pickup Address')}
                required
                placeholder="Building name, kitchen backdoor, street, landmark"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <Input
                id="listing-pickup-instructions"
                label={t('donor.pickupInstructions', 'Access & Gate Instructions')}
                as="textarea"
                rows={2}
                placeholder="Inform security that you are picking up for FoodBridge. Park at loading bay 3."
                value={formData.pickupInstructions}
                onChange={(e) => setFormData({ ...formData, pickupInstructions: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* SECTION 4: TIMESTAMPED PHOTO & DECLARATION */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="text-base sm:text-lg font-bold text-stone-900 pb-3 border-b border-border">
            4. Verification Photo & Declaration
          </h2>

          <div className="space-y-4">
            <label className="text-xs sm:text-sm font-semibold text-stone-800 block">
              Timestamped Food Photo
            </label>
            <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-surface-muted/30">
              <input
                type="file"
                id="listing-photo"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhotoUpload(e.target.files[0])}
              />
              <label htmlFor="listing-photo" className="cursor-pointer flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 text-stone-400" />
                <span className="text-xs sm:text-sm font-semibold text-brand-800 hover:underline">
                  Upload current photo of the food/containers
                </span>
                <span className="text-[11px] text-stone-500">JPG, PNG, or WebP</span>
              </label>
              {photoPreview && (
                <div className="mt-4 flex flex-col items-center">
                  <img
                    src={photoPreview}
                    alt="Food upload preview"
                    className="max-h-48 rounded-lg border border-border shadow-sm object-cover"
                  />
                  <span className="text-[11px] text-stone-500 mt-1">Photo attached</span>
                </div>
              )}
            </div>

            {/* Intended Suitability (Multi-select) */}
            <div className="pt-4 border-t border-border">
              <label className="text-xs sm:text-sm font-semibold text-stone-800 block mb-1">
                Intended Destination Categories
              </label>
              <p className="text-xs text-stone-500 mb-3">
                Select your intended targets. Final matching is strictly controlled by platform safety rules.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'human', label: 'Human Food', badge: 'human' },
                  { id: 'animal', label: 'Animal Feed', badge: 'animal' },
                  { id: 'compost', label: 'Composting', badge: 'compost' },
                  { id: 'biogas', label: 'Biogas Plant', badge: 'biogas' }
                ].map((dest) => {
                  const isChecked = formData.intendedSuitability.includes(dest.id);
                  return (
                    <button
                      type="button"
                      key={dest.id}
                      onClick={() => toggleIntendedSuitability(dest.id)}
                      className={`p-2.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                        isChecked
                          ? 'bg-brand-50 border-brand-700 ring-1 ring-brand-700'
                          : 'bg-white border-border hover:bg-stone-50'
                      }`}
                    >
                      <span className="text-xs font-bold text-stone-900">{dest.label}</span>
                      <span className="text-[10px] text-stone-500 mt-1 capitalize">
                        {isChecked ? 'Selected' : 'Omitted'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mandatory Safety Declaration */}
            <div className="pt-4 border-t border-border">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.donorDeclaration}
                  onChange={(e) => setFormData({ ...formData, donorDeclaration: e.target.checked })}
                  className="mt-1 h-4 w-4 text-brand-800 rounded focus:ring-brand-700"
                />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold block text-stone-900 mb-0.5">Donor Safety Declaration</span>
                  I confirm that the food details, preparation time, and storage conditions provided are truthful. I understand this does not replace physical inspection by the recipient upon handover.
                </div>
              </label>
            </div>
          </div>
        </Card>

        {/* SECTION 5: REAL-TIME AUTOMATED SAFETY EVALUATION PREVIEW */}
        <Card className="p-6 bg-surface-muted/60 border-border">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-brand-700" />
            <h3 className="text-sm font-bold text-stone-900">
              Platform Safety & Eligibility Evaluation (Automated)
            </h3>
          </div>

          <p className="text-xs text-stone-600 mb-4 leading-relaxed">
            The platform rules engine continuously checks your listing facts against food dignity and safety standards:
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold text-stone-700 self-center mr-1">Eligible Destinations:</span>
            {safetyEvaluation.eligibleCategories.length === 0 ? (
              <span className="text-xs font-bold text-red-600">None (Check safety warnings below)</span>
            ) : (
              safetyEvaluation.eligibleCategories.map((cat) => (
                <Badge key={cat} variant={cat} size="md">
                  {cat.toUpperCase()} RECIPIENTS
                </Badge>
              ))
            )}
          </div>

          {/* Audit Rule Details */}
          <div className="space-y-1.5 text-xs">
            {safetyEvaluation.safetyChecks.map((check, idx) => (
              <div
                key={idx}
                className={`p-2 rounded flex items-start gap-2 ${
                  check.passed ? 'bg-emerald-50/70 text-emerald-900' : 'bg-red-50 text-red-900'
                }`}
              >
                {check.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <span>{check.message}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-border/80 flex items-center gap-1.5 text-[11px] text-stone-500">
            <Info className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <span>{safetyEvaluation.inspectionNotice}</span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4">
          <Button type="button" variant="secondary" onClick={() => navigate('/donor/dashboard')} disabled={loading}>
            {t('common.cancel', 'Cancel')}
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!isFormValid || loading}
          >
            {isEditing ? t('common.save', 'Save Changes') : t('donor.submitListing', 'Publish Food Listing')}
          </Button>
        </div>
      </form>
    </div>
  );
}

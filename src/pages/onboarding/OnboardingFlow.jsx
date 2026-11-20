import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getUserDashboardRoute } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { storage, ref, uploadBytes, getDownloadURL } from '../../services/firebase';
import {
  Utensils,
  Building2,
  Truck,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileCheck,
  Scale,
  ArrowLeft
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

const PARTICIPATION_ROLES = [
  {
    id: 'donor',
    title: 'Donor',
    description: 'For colleges, hostel messes, marriage halls, caterers, restaurants, and other establishments that want to share surplus food.',
    icon: Utensils,
    iconColor: 'text-emerald-800 bg-emerald-50 border-emerald-200/80'
  },
  {
    id: 'recipient',
    title: 'Recipient Organization',
    description: "For verified NGOs, children's and eldercare shelters, gaushalas, compost yards, and biogas facilities.",
    icon: Building2,
    iconColor: 'text-amber-800 bg-amber-50 border-amber-200/80'
  },
  {
    id: 'delivery',
    title: 'Delivery Partner',
    description: 'For individuals and community delivery partners who assist with food pickup and delivery.',
    icon: Truck,
    iconColor: 'text-sky-800 bg-sky-50 border-sky-200/80'
  },
  {
    id: 'visitor',
    title: 'Visitor',
    description: 'For people who simply want to explore FoodBridge and support its mission without becoming a food donor, recipient, or delivery partner.',
    icon: Compass,
    iconColor: 'text-indigo-800 bg-indigo-50 border-indigo-200/80'
  }
];

export function OnboardingFlow() {
  const { t } = useLocale();
  const { user, userDoc, completeOnboarding } = useAuth();
  const navigate = useNavigate();

  // If already onboarded, immediately route to the role's primary operational dashboard
  useEffect(() => {
    if (userDoc?.onboardingComplete) {
      navigate(getUserDashboardRoute(userDoc), { replace: true });
    } else if (userDoc?.activeRole || (userDoc?.roles && userDoc.roles.length > 0)) {
      const r = userDoc.activeRole || userDoc.roles[0];
      setSelectedRole(r);
    }
  }, [userDoc, navigate]);

  const hasPreselectedRole = Boolean(userDoc?.activeRole || (userDoc?.roles && userDoc.roles.length > 0));
  const initialRole = userDoc?.activeRole || (userDoc?.roles && userDoc.roles[0]) || 'donor';

  const [step, setStep] = useState(hasPreselectedRole ? 2 : 1); // 1 = select role, 2 = profile details
  const [selectedRole, setSelectedRole] = useState(initialRole); // Exactly one role
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Donor Form State
  const [donorData, setDonorData] = useState({
    organizationName: userDoc?.organizationName || userDoc?.profileData?.organizationName || '',
    donorType: userDoc?.donorType || userDoc?.profileData?.donorType || 'mess',
    contactPerson: userDoc?.contactPerson || userDoc?.profileData?.contactPerson || '',
    phone: userDoc?.contactPhone || userDoc?.phone || userDoc?.profileData?.phone || '',
    address: userDoc?.address || userDoc?.profileData?.address || '',
    district: userDoc?.district || userDoc?.profileData?.district || 'Bengaluru Urban',
    pickupInstructions: userDoc?.pickupInstructions || userDoc?.profileData?.pickupInstructions || ''
  });

  // 2. Recipient Form State
  const [recipientData, setRecipientData] = useState({
    organizationName: userDoc?.organizationName || userDoc?.profileData?.organizationName || '',
    registrationNumber: userDoc?.profileData?.registrationNumber || '',
    category: userDoc?.profileData?.category || 'human',
    contactPerson: userDoc?.contactPerson || userDoc?.profileData?.contactPerson || '',
    phone: userDoc?.contactPhone || userDoc?.phone || userDoc?.profileData?.phone || '',
    verifiedEmail: user?.email || '',
    address: userDoc?.address || userDoc?.profileData?.address || '',
    district: userDoc?.district || userDoc?.profileData?.district || 'Bengaluru Urban',
    latitude: userDoc?.profileData?.latitude || 12.9716,
    longitude: userDoc?.profileData?.longitude || 77.5946,
    serviceRadiusKm: userDoc?.profileData?.serviceRadiusKm || 5,
    acceptedMaterialTypes: userDoc?.profileData?.acceptedMaterialTypes || ['cooked_meals', 'packaged_foods'],
    operatingHours: userDoc?.profileData?.operatingHours || '08:00 - 20:00',
    operatingDays: userDoc?.profileData?.operatingDays || 'Daily',
    totalCapacity: userDoc?.profileData?.totalCapacity || 100,
    availableAdditionalCapacity: userDoc?.profileData?.availableAdditionalCapacity || 50,
    capacityUnit: userDoc?.profileData?.capacityUnit || 'meals',
    documentUrl: userDoc?.profileData?.documentUrl || '',
    documentName: userDoc?.profileData?.documentName || ''
  });

  // 3. Delivery Partner Form State
  const [deliveryData, setDeliveryData] = useState({
    fullName: userDoc?.organizationName || userDoc?.profileData?.fullName || '',
    phone: userDoc?.contactPhone || userDoc?.phone || userDoc?.profileData?.phone || '',
    emergencyContact: userDoc?.profileData?.emergencyContact || '',
    serviceDistrict: userDoc?.district || userDoc?.profileData?.serviceDistrict || 'Bengaluru Urban',
    transportMode: userDoc?.profileData?.transportMode || 'two_wheeler',
    maxCapacityKg: userDoc?.profileData?.maxCapacityKg || 20,
    availability: userDoc?.profileData?.availability || 'flexible',
    licenseNumber: userDoc?.profileData?.licenseNumber || '',
    documentUrl: userDoc?.profileData?.documentUrl || '',
    documentName: userDoc?.profileData?.documentName || ''
  });

  const handleFileUpload = async (file, roleType) => {
    if (!file || !user) return;
    try {
      setLoading(true);
      const fileRef = ref(storage, `verification/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      if (roleType === 'recipient') {
        setRecipientData((prev) => ({ ...prev, documentUrl: url, documentName: file.name }));
      } else if (roleType === 'delivery') {
        setDeliveryData((prev) => ({ ...prev, documentUrl: url, documentName: file.name }));
      }
    } catch (err) {
      console.warn('Document upload fallback:', err.message);
      if (roleType === 'recipient') {
        setRecipientData((prev) => ({ ...prev, documentUrl: `local://verification/${file.name}`, documentName: file.name }));
      } else if (roleType === 'delivery') {
        setDeliveryData((prev) => ({ ...prev, documentUrl: `local://verification/${file.name}`, documentName: file.name }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Continue = async () => {
    setError('');
    if (selectedRole === 'visitor') {
      try {
        setLoading(true);
        await completeOnboarding({ selectedRole: 'visitor' });
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'Error completing visitor setup.');
      } finally {
        setLoading(false);
      }
    } else {
      setStep(2);
      try {
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (e) {
        // Safe fallback in test or constrained environments
      }
    }
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Strict single-role validation
    if (selectedRole === 'donor') {
      if (!donorData.organizationName || !donorData.phone || !donorData.address) {
        setError('Please complete all required donor organization details.');
        return;
      }
    } else if (selectedRole === 'recipient') {
      if (!recipientData.organizationName || !recipientData.phone || !recipientData.address) {
        setError('Please complete all required recipient organization details.');
        return;
      }
      if (Number(recipientData.availableAdditionalCapacity) <= 0) {
        setError('Available additional capacity must be greater than zero.');
        return;
      }
    } else if (selectedRole === 'delivery') {
      if (!deliveryData.fullName || !deliveryData.phone) {
        setError('Please complete all required delivery partner details.');
        return;
      }
    }

    try {
      setLoading(true);
      await completeOnboarding({
        selectedRole,
        donorData: selectedRole === 'donor' ? donorData : null,
        recipientData: selectedRole === 'recipient' ? recipientData : null,
        deliveryData: selectedRole === 'delivery' ? deliveryData : null
      });

      // Route directly to the appropriate operational dashboard
      const targetDashboard =
        selectedRole === 'donor' ? '/donor/dashboard' :
        selectedRole === 'recipient' ? '/recipient/dashboard' :
        selectedRole === 'delivery' ? '/delivery/dashboard' : '/';
      navigate(targetDashboard, { replace: true });
    } catch (err) {
      setError(err.message || 'Error saving onboarding profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      {/* Onboarding Header */}
      <div className="text-center max-w-xl mx-auto mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
          {step === 1 ? 'How would you like to participate?' : 'Complete Your Profile'}
        </h1>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          {step === 1
            ? 'Choose how you would like to be part of FoodBridge.'
            : `Provide accurate details for your ${selectedRole === 'donor' ? 'donor' : selectedRole === 'recipient' ? 'recipient organization' : 'delivery partner'} profile.`}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: SINGLE ROLE SELECTION (2x2 Grid Desktop, 1 Column Mobile) */}
      {step === 1 && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PARTICIPATION_ROLES.map((role) => {
              const Icon = role.icon;
              const isSelected = selectedRole === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-brand-700 bg-brand-50/50 shadow-sm ring-2 ring-brand-700'
                      : 'border-border bg-white hover:border-stone-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3.5">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${role.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-brand-800 border-brand-800 text-white' : 'border-stone-300 bg-white'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                    </div>
                    <h3 className="font-bold text-stone-900 text-base">{role.title}</h3>
                    <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              size="lg"
              loading={loading}
              onClick={handleStep1Continue}
            >
              {selectedRole === 'visitor' ? 'Explore FoodBridge' : 'Continue'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: PROFILE DETAILS FORM */}
      {step === 2 && (
        <form onSubmit={handleFinalSubmit} className="space-y-8">
          <div>
            <button
              type="button"
              onClick={() => { setStep(1); setError(''); }}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 hover:text-brand-800 transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Participation Selection</span>
            </button>
          </div>

          {/* 1. DONOR PROFILE FORM */}
          {selectedRole === 'donor' && (
            <Card className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">Donor Profile</h2>
                  <p className="text-xs text-stone-500">Details for your surplus food listings and pickup location</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="donor-org-name"
                  label="Establishment / Donor Name"
                  required
                  placeholder="e.g. BMS Mess, Grand Palace Hall"
                  value={donorData.organizationName}
                  onChange={(e) => setDonorData({ ...donorData, organizationName: e.target.value })}
                />

                <Input
                  id="donor-type"
                  label="Establishment Type"
                  as="select"
                  value={donorData.donorType}
                  onChange={(e) => setDonorData({ ...donorData, donorType: e.target.value })}
                >
                  <option value="mess">College / Hostel Mess</option>
                  <option value="restaurant">Restaurant / Eatery</option>
                  <option value="marriage_hall">Marriage / Convention Hall</option>
                  <option value="caterer">Catering Service</option>
                  <option value="supermarket">Supermarket / Retail</option>
                  <option value="individual">Community Individual</option>
                </Input>

                <Input
                  id="donor-contact"
                  label="Contact Person"
                  required
                  placeholder="Manager / In-charge name"
                  value={donorData.contactPerson}
                  onChange={(e) => setDonorData({ ...donorData, contactPerson: e.target.value })}
                />

                <Input
                  id="donor-phone"
                  label="Verified Phone Number"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={donorData.phone}
                  onChange={(e) => setDonorData({ ...donorData, phone: e.target.value })}
                />

                <div className="sm:col-span-2">
                  <Input
                    id="donor-district"
                    label="District"
                    as="select"
                    value={donorData.district}
                    onChange={(e) => setDonorData({ ...donorData, district: e.target.value })}
                  >
                    {KARNATAKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Input>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    id="donor-address"
                    label="Default Pickup Address"
                    required
                    placeholder="Full street address and landmark"
                    value={donorData.address}
                    onChange={(e) => setDonorData({ ...donorData, address: e.target.value })}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Input
                    id="donor-instructions"
                    label="Pickup Instructions & Access"
                    as="textarea"
                    placeholder="Kitchen entry via Gate 2, ask for Kitchen Supervisor."
                    value={donorData.pickupInstructions}
                    onChange={(e) => setDonorData({ ...donorData, pickupInstructions: e.target.value })}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* 2. RECIPIENT ORGANIZATION PROFILE FORM */}
          {selectedRole === 'recipient' && (
            <Card className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">Recipient Organization Profile</h2>
                  <p className="text-xs text-stone-500">Requires administrative verification prior to receiving donations</p>
                </div>
              </div>

              {/* Recipient Category Selector */}
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-semibold text-stone-800 block">
                  Recipient Category <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { id: 'human', label: 'Human-Food Recipient', desc: 'NGOs, shelters, orphanages, community kitchens' },
                    { id: 'animal', label: 'Animal-Food Recipient', desc: 'Gaushalas, cattle shelters, animal rescues' },
                    { id: 'compost', label: 'Composting Facility', desc: 'Organic waste conversion to soil compost' },
                    { id: 'biogas', label: 'Biogas Plant', desc: 'Biomethanation anaerobic digestion facility' }
                  ].map((cat) => (
                    <label
                      key={cat.id}
                      className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition-colors ${
                        recipientData.category === cat.id
                          ? 'border-brand-700 bg-brand-50/60 ring-1 ring-brand-700'
                          : 'border-border bg-white hover:bg-surface-muted'
                      }`}
                    >
                      <input
                        type="radio"
                        name="recipient-category"
                        value={cat.id}
                        checked={recipientData.category === cat.id}
                        onChange={() => setRecipientData({ ...recipientData, category: cat.id })}
                        className="mt-1 text-brand-800 focus:ring-brand-700"
                      />
                      <div>
                        <span className="text-xs sm:text-sm font-bold text-stone-900 block">{cat.label}</span>
                        <span className="text-[11px] text-stone-600 leading-snug">{cat.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="rec-org-name"
                  label="Organization / Facility Name"
                  required
                  placeholder="e.g. Ashraya Foundation, Bengaluru Gaushala"
                  value={recipientData.organizationName}
                  onChange={(e) => setRecipientData({ ...recipientData, organizationName: e.target.value })}
                />

                <Input
                  id="rec-reg-no"
                  label="Registration / License ID"
                  placeholder="NGO Darpan, Society Reg, or Municipal Trade ID"
                  value={recipientData.registrationNumber}
                  onChange={(e) => setRecipientData({ ...recipientData, registrationNumber: e.target.value })}
                />

                <Input
                  id="rec-contact-person"
                  label="Contact Person"
                  required
                  placeholder="Director / Coordinator name"
                  value={recipientData.contactPerson}
                  onChange={(e) => setRecipientData({ ...recipientData, contactPerson: e.target.value })}
                />

                <Input
                  id="rec-phone"
                  label="Contact Phone"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={recipientData.phone}
                  onChange={(e) => setRecipientData({ ...recipientData, phone: e.target.value })}
                />

                <div className="sm:col-span-2">
                  <Input
                    id="rec-district"
                    label="District"
                    as="select"
                    value={recipientData.district}
                    onChange={(e) => setRecipientData({ ...recipientData, district: e.target.value })}
                  >
                    {KARNATAKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Input>
                </div>

                <div className="sm:col-span-2">
                  <Input
                    id="rec-address"
                    label="Facility Physical Address"
                    required
                    placeholder="Street, area, pin code"
                    value={recipientData.address}
                    onChange={(e) => setRecipientData({ ...recipientData, address: e.target.value })}
                  />
                </div>

                <Input
                  id="rec-service-radius"
                  label="Service Radius (km)"
                  type="number"
                  min="1"
                  max="50"
                  value={recipientData.serviceRadiusKm}
                  onChange={(e) => setRecipientData({ ...recipientData, serviceRadiusKm: Number(e.target.value) })}
                />

                <Input
                  id="rec-operating-hours"
                  label="Operating Hours"
                  placeholder="e.g. 08:00 - 20:00"
                  value={recipientData.operatingHours}
                  onChange={(e) => setRecipientData({ ...recipientData, operatingHours: e.target.value })}
                />

                {/* Available Additional Capacity */}
                <div className="sm:col-span-2 p-4 rounded-xl bg-brand-50/50 border border-brand-200 space-y-3">
                  <div className="flex items-start gap-2 text-brand-900">
                    <Scale className="w-5 h-5 flex-shrink-0 mt-0.5 text-brand-700" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold">Capacity & Available Additional Capacity</h4>
                      <p className="text-xs text-brand-800/90 leading-relaxed">
                        Specify how much more food/material you can accept right now. This is dynamically matched against donor listings.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <Input
                      id="rec-total-cap"
                      label="Total Capacity"
                      type="number"
                      min="1"
                      value={recipientData.totalCapacity}
                      onChange={(e) => setRecipientData({ ...recipientData, totalCapacity: Number(e.target.value) })}
                    />
                    <Input
                      id="rec-avail-cap"
                      label="Available Additional Capacity"
                      type="number"
                      min="1"
                      required
                      value={recipientData.availableAdditionalCapacity}
                      onChange={(e) => setRecipientData({ ...recipientData, availableAdditionalCapacity: Number(e.target.value) })}
                    />
                    <Input
                      id="rec-cap-unit"
                      label="Unit"
                      as="select"
                      value={recipientData.capacityUnit}
                      onChange={(e) => setRecipientData({ ...recipientData, capacityUnit: e.target.value })}
                    >
                      <option value="meals">Meals / Portions</option>
                      <option value="kg">Kilograms (kg)</option>
                    </Input>
                  </div>
                </div>

                {/* Document Upload for Verification */}
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-stone-800 block">
                    Verification Proof Document (Registration / Certificate / Clearance)
                  </label>
                  <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-surface-muted/30">
                    <input
                      type="file"
                      id="rec-doc"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files[0], 'recipient')}
                    />
                    <label htmlFor="rec-doc" className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-stone-400" />
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 hover:underline">
                        Upload registration proof or license
                      </span>
                      <span className="text-[11px] text-stone-500">PDF, PNG, or JPG (Max 5MB)</span>
                    </label>
                    {recipientData.documentName && (
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Attached: {recipientData.documentName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 3. DELIVERY PARTNER PROFILE FORM */}
          {selectedRole === 'delivery' && (
            <Card className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-800 flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">Delivery Partner Profile</h2>
                  <p className="text-xs text-stone-500">Details required for dispatch and handover assignments</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="del-full-name"
                  label="Full Legal Name"
                  required
                  placeholder="Driver / Volunteer name"
                  value={deliveryData.fullName}
                  onChange={(e) => setDeliveryData({ ...deliveryData, fullName: e.target.value })}
                />

                <Input
                  id="del-phone"
                  label="Primary Contact Phone"
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={deliveryData.phone}
                  onChange={(e) => setDeliveryData({ ...deliveryData, phone: e.target.value })}
                />

                <Input
                  id="del-emergency"
                  label="Emergency Contact Phone"
                  type="tel"
                  placeholder="+91 98765 00000"
                  value={deliveryData.emergencyContact}
                  onChange={(e) => setDeliveryData({ ...deliveryData, emergencyContact: e.target.value })}
                />

                <Input
                  id="del-district"
                  label="Service Operating District"
                  as="select"
                  value={deliveryData.serviceDistrict}
                  onChange={(e) => setDeliveryData({ ...deliveryData, serviceDistrict: e.target.value })}
                >
                  {KARNATAKA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Input>

                <Input
                  id="del-transport"
                  label="Transport Mode"
                  as="select"
                  value={deliveryData.transportMode}
                  onChange={(e) => setDeliveryData({ ...deliveryData, transportMode: e.target.value })}
                >
                  <option value="two_wheeler">Two-Wheeler (Motorcycle / Scooter)</option>
                  <option value="three_wheeler">Auto / Three-Wheeler</option>
                  <option value="van">Small Commercial Van</option>
                  <option value="four_wheeler">Four-Wheeler / Car</option>
                  <option value="bicycle">Bicycle</option>
                </Input>

                <Input
                  id="del-capacity"
                  label="Max Carrying Capacity (kg)"
                  type="number"
                  min="5"
                  max="1000"
                  value={deliveryData.maxCapacityKg}
                  onChange={(e) => setDeliveryData({ ...deliveryData, maxCapacityKg: Number(e.target.value) })}
                />

                <div className="sm:col-span-2">
                  <Input
                    id="del-availability"
                    label="Availability Window"
                    as="select"
                    value={deliveryData.availability}
                    onChange={(e) => setDeliveryData({ ...deliveryData, availability: e.target.value })}
                  >
                    <option value="flexible">Flexible / On-Call</option>
                    <option value="morning">Morning (06:00 - 12:00)</option>
                    <option value="afternoon">Afternoon (12:00 - 18:00)</option>
                    <option value="evening">Evening (18:00 - 23:00)</option>
                  </Input>
                </div>

                {/* ID Proof Document Upload */}
                <div className="sm:col-span-2 space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-stone-800 block">
                    ID / Driving License Document
                  </label>
                  <div className="border-2 border-dashed border-border rounded-xl p-5 text-center bg-surface-muted/30">
                    <input
                      type="file"
                      id="del-doc"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files[0], 'delivery')}
                    />
                    <label htmlFor="del-doc" className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="w-6 h-6 text-stone-400" />
                      <span className="text-xs sm:text-sm font-semibold text-brand-800 hover:underline">
                        Upload ID proof / driving license
                      </span>
                      <span className="text-[11px] text-stone-500">PDF, PNG, or JPG (Max 5MB)</span>
                    </label>
                    {deliveryData.documentName && (
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Attached: {deliveryData.documentName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={loading}>
              Back to Roles
            </Button>
            <Button variant="primary" type="submit" loading={loading} size="lg">
              Save Profile & Submit
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

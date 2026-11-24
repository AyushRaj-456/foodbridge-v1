import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { LanguageSelector } from '../../components/language/LanguageSelector';
import {
  db,
  doc,
  updateDoc,
  serverTimestamp
} from '../../services/firebase';
import {
  User,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  Building2,
  Utensils,
  Truck,
  LogOut,
  ChevronRight,
  ShieldAlert,
  Compass,
  Coffee
} from 'lucide-react';

export function ProfileSettingsPage() {
  const { t } = useLocale();
  const { user, userDoc, profileData, isAdmin, isVerified, switchActiveRole, logout, refreshUserProfile } = useAuth();

  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  // Editable fields for Recipient
  const [additionalCapacity, setAdditionalCapacity] = useState(profileData?.availableAdditionalCapacity || 0);
  const [operatingHours, setOperatingHours] = useState(profileData?.operatingHours || '');
  const [recipientPhone, setRecipientPhone] = useState(profileData?.phone || '');

  // Editable fields for Donor
  const [donorAddress, setDonorAddress] = useState(profileData?.address || '');
  const [pickupInstructions, setPickupInstructions] = useState(profileData?.pickupInstructions || '');
  const [donorPhone, setDonorPhone] = useState(profileData?.phone || '');

  // Editable fields for Delivery
  const [deliveryAvailability, setDeliveryAvailability] = useState(profileData?.availability || 'flexible');
  const [deliveryPhone, setDeliveryPhone] = useState(profileData?.phone || '');

  const activeRole = userDoc?.activeRole || userDoc?.roles?.[0] || 'donor';

  const handleRoleSwitch = async (newRole) => {
    try {
      await switchActiveRole(newRole);
      setSuccessNotice(`Switched active view to ${newRole.toUpperCase()}.`);
    } catch (err) {
      setErrorNotice(err.message);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSuccessNotice('');
    setErrorNotice('');

    try {
      setSaving(true);
      if (activeRole === 'recipient') {
        const ref = doc(db, 'recipients', user.uid);
        await updateDoc(ref, {
          availableAdditionalCapacity: Number(additionalCapacity),
          operatingHours,
          phone: recipientPhone,
          updatedAt: serverTimestamp()
        });
      } else if (activeRole === 'donor') {
        const ref = doc(db, 'donors', user.uid);
        await updateDoc(ref, {
          address: donorAddress,
          pickupInstructions,
          phone: donorPhone,
          updatedAt: serverTimestamp()
        });
      } else if (activeRole === 'delivery') {
        const ref = doc(db, 'deliveryPartners', user.uid);
        await updateDoc(ref, {
          availability: deliveryAvailability,
          phone: deliveryPhone,
          updatedAt: serverTimestamp()
        });
      }

      await refreshUserProfile();
      setSuccessNotice('Profile changes saved successfully.');
    } catch (err) {
      setErrorNotice(err.message || 'Error updating profile.');
    } finally {
      setSaving(false);
    }
  };

  const getRoleIcon = (role) => {
    if (role === 'recipient') return Building2;
    if (role === 'delivery') return Truck;
    if (role === 'visitor') return Compass;
    return Utensils;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-8">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-border gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              {t('profile.title', 'Account & Profile Settings')}
            </h1>
            {isAdmin && (
              <Badge variant="accent" size="sm">{t('profile.adminBadge', 'Admin')}</Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {t('profile.subtitle', 'Signed in as')} <span className="font-semibold text-stone-800">{user?.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link to="/admin/verification">
              <Button variant="secondary" size="sm">
                <ShieldAlert className="w-4 h-4 mr-1 text-red-700" />
                {t('profile.adminVerification', 'Admin Verification')}
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-1" />
            {t('profile.signOut', 'Sign Out')}
          </Button>
        </div>
      </div>

      {/* Language Preference Card */}
      <Card className="p-5 bg-white border border-border shadow-sm rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-stone-900">
            {t('profile.languageSetting', 'Preferred Display Language')}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Select your preferred language. Translations update immediately and synchronize with your account.
          </p>
        </div>
        <LanguageSelector />
      </Card>

      {successNotice && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center justify-between">
          <span>{successNotice}</span>
          <button onClick={() => setSuccessNotice('')} className="font-semibold text-green-900">Dismiss</button>
        </div>
      )}

      {errorNotice && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice('')} className="font-semibold text-red-900">Dismiss</button>
        </div>
      )}

      {/* 1. ROLE SWITCHER (If multi-role registered) */}
      {userDoc?.roles && userDoc.roles.length > 1 && (
        <Card className="p-5 bg-surface-muted/50 border-border">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-500 block mb-3">
            Active Operational Role
          </span>
          <div className="flex flex-wrap gap-2">
            {userDoc.roles.map((r) => {
              const RoleIcon = getRoleIcon(r);
              const isActive = activeRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRoleSwitch(r)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-brand-800 text-white shadow-sm'
                      : 'bg-white text-stone-700 border border-border hover:bg-stone-50'
                  }`}
                >
                  <RoleIcon className="w-4 h-4" />
                  <span className="capitalize">{r === 'recipient' ? 'Recipient Organization' : r}</span>
                  {isActive && <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-brand-200" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* 2. VERIFICATION STATUS ALERT BANNER (For Recipient & Delivery) */}
      {(activeRole === 'recipient' || activeRole === 'delivery') && (
        <div>
          {profileData?.verificationStatus === 'verified' && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">{t('profile.verifiedActive', 'Verified & Active')}</h4>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  Your organization documentation has been verified by community administrators. You are eligible to receive and accept surplus food allocations.
                </p>
              </div>
            </div>
          )}

          {(!profileData?.verificationStatus || profileData?.verificationStatus === 'pending') && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">{t('profile.pendingReview', 'Verification Pending')}</h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Your submitted credentials are under review by platform administrators. To protect food dignity and community safety, donations cannot be accepted until review completes.
                </p>
              </div>
            </div>
          )}

          {profileData?.verificationStatus === 'rejected' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">{t('profile.rejectedNotice', 'Verification Not Approved')}</h4>
                <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                  Reason provided: {profileData?.rejectionReason || 'Documentation did not meet verification criteria.'}
                </p>
              </div>
            </div>
          )}

          {profileData?.verificationStatus === 'info_requested' && (
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 flex items-start gap-3">
              <Clock className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Clarification Requested by Administrator</h4>
                <p className="text-xs text-sky-800 mt-0.5 leading-relaxed">
                  Note: {profileData?.rejectionReason || 'Please verify your contact and operational details.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Visitor Mode Card */}
      {activeRole === 'visitor' && (
        <Card className="p-6 sm:p-8 space-y-5 bg-gradient-to-br from-indigo-50/30 to-white border-indigo-200">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-800 flex items-center justify-center border border-indigo-200">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Visitor Mode</h2>
              <p className="text-xs text-stone-500">Exploring and supporting the FoodBridge community mission</p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            As a Visitor, you can explore the public map corridors, review verified rescue metrics, and contribute voluntarily through our &quot;Buy Us a Coffee&quot; initiative. No document verification or facility registration is needed.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to="/support">
              <Button variant="primary" size="sm">
                <Coffee className="w-4 h-4 mr-1.5" />
                Support FoodBridge
              </Button>
            </Link>
            <Link to="/onboarding">
              <Button variant="outline" size="sm">
                Change Participation Role
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* 3. EDITABLE ROLE PROFILE DETAILS */}
      {activeRole !== 'visitor' && (
        <Card className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-muted text-stone-800 flex items-center justify-center">
              {React.createElement(getRoleIcon(activeRole), { className: 'w-5 h-5' })}
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 capitalize">
                {profileData?.organizationName || profileData?.fullName || `${activeRole} Profile`}
              </h2>
              <p className="text-xs text-stone-500">
                {profileData?.district || 'Karnataka'} • Operational Profile
              </p>
            </div>
          </div>

          <Badge variant={profileData?.category || 'neutral'}>
            {profileData?.category ? `${profileData.category.toUpperCase()} RECIPIENT` : activeRole.toUpperCase()}
          </Badge>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {/* Recipient Form Fields */}
          {activeRole === 'recipient' && (
            <>
              <div className="p-4 rounded-xl bg-brand-50/50 border border-brand-200 space-y-2">
                <div className="flex items-center gap-2 text-brand-900">
                  <Scale className="w-4 h-4 text-brand-700" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Available Additional Capacity
                  </span>
                </div>
                <p className="text-xs text-brand-800/90 leading-relaxed">
                  How much additional food/material can your facility intake right now? (Total capacity is {profileData?.totalCapacity} {profileData?.capacityUnit}).
                </p>
                <div className="max-w-xs pt-1">
                  <Input
                    id="edit-avail-cap"
                    type="number"
                    min="0"
                    value={additionalCapacity}
                    onChange={(e) => setAdditionalCapacity(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="edit-rec-phone"
                  label="Contact Phone"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                />
                <Input
                  id="edit-rec-hours"
                  label="Operating Hours"
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Donor Form Fields */}
          {activeRole === 'donor' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="edit-donor-phone"
                label="Contact Phone"
                value={donorPhone}
                onChange={(e) => setDonorPhone(e.target.value)}
              />
              <div className="sm:col-span-2">
                <Input
                  id="edit-donor-address"
                  label="Pickup Address"
                  value={donorAddress}
                  onChange={(e) => setDonorAddress(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  id="edit-donor-instructions"
                  label="Pickup Access Instructions"
                  as="textarea"
                  value={pickupInstructions}
                  onChange={(e) => setPickupInstructions(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Delivery Form Fields */}
          {activeRole === 'delivery' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="edit-del-phone"
                label="Phone Number"
                value={deliveryPhone}
                onChange={(e) => setDeliveryPhone(e.target.value)}
              />
              <Input
                id="edit-del-avail"
                label="Availability Window"
                as="select"
                value={deliveryAvailability}
                onChange={(e) => setDeliveryAvailability(e.target.value)}
              >
                <option value="flexible">Flexible / On-Call</option>
                <option value="morning">Morning (06:00 - 12:00)</option>
                <option value="afternoon">Afternoon (12:00 - 18:00)</option>
                <option value="evening">Evening (18:00 - 23:00)</option>
              </Input>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-border">
            <Button type="submit" variant="primary" loading={saving}>
              {t('profile.saveChanges', 'Save Profile Updates')}
            </Button>
          </div>
        </form>
      </Card>
      )}
    </div>
  );
}

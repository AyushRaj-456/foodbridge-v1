import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { PaymentModal } from '../../components/support/PaymentModal';
import { SUPPORT_PLANS } from '../../config/membershipConfig';
import {
  Coffee,
  Heart,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  QrCode,
  CreditCard,
  Coins,
  Building2
} from 'lucide-react';

export function SupportPage() {
  const { t } = useLocale();
  const { user, userDoc, profileData } = useAuth();
  const configuredUpiId = import.meta.env.VITE_CONTRIBUTION_UPI_ID || '';

  const isRecipient = userDoc?.activeRole === 'recipient' || profileData?.role === 'recipient' || (userDoc?.roles?.includes('recipient') && !userDoc?.roles?.includes('donor'));

  const [copied, setCopied] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('fuel_support');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toastNotice, setToastNotice] = useState('');

  const handleCopyUpi = () => {
    if (!configuredUpiId) return;
    navigator.clipboard.writeText(configuredUpiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const contributionTiers = [
    {
      id: 'coffee',
      amount: 50,
      label: t('support.coffeeTitle', 'Buy Us a Coffee'),
      desc: t('support.coffeeDesc', 'One-time voluntary support. No membership or token benefits.'),
      badge: 'Voluntary',
      badgeClass: 'bg-stone-100 text-stone-800'
    },
    {
      id: 'fuel_support',
      amount: 100,
      label: t('support.fuelTitle', 'Fuel Support'),
      desc: t('support.fuelDesc', '30-day membership for Donors. Earn tokens on handovers. Redeem at ₹2 / 100 tokens.'),
      badge: '30-Day Pass',
      badgeClass: 'bg-emerald-100 text-emerald-800'
    },
    {
      id: 'corridor_help',
      amount: 250,
      label: t('support.corridorTitle', 'Corridor Help'),
      desc: t('support.corridorDesc', '30-day membership for Donors. Earn tokens on handovers. Redeem at ₹6 / 100 tokens.'),
      badge: 'Premium Pass',
      badgeClass: 'bg-brand-100 text-brand-900'
    }
  ];

  const currentSelectedTier = contributionTiers.find((t) => t.id === selectedPlanId) || contributionTiers[1];
  const selectedAmount = currentSelectedTier.amount;

  const upiDeepLink = configuredUpiId
    ? `upi://pay?pa=${encodeURIComponent(configuredUpiId)}&pn=FoodBridge%20Community&am=${selectedAmount}&cu=INR`
    : '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16 space-y-12">
      {/* Back button */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('auth.backHome', 'Back to Home')}</span>
        </Link>
      </div>

      {/* Hero Header */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 text-xs font-semibold">
          <Coffee className="w-3.5 h-3.5 text-amber-700" />
          <span>Voluntary Community Contributions</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
          {t('support.title', 'Support FoodBridge')}
        </h1>
        <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
          {t('support.subtitle', 'FoodBridge operates as an open community platform connecting surplus food with verified organizations across Karnataka. Your voluntary contributions directly support our grassroots redistribution initiative.')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Left Column: Why We Need Support */}
        <div className="space-y-6">
          <Card className="p-6 sm:p-8 space-y-5">
            <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-700" />
              <span>How Your Contribution Helps</span>
            </h2>

            <div className="space-y-4 text-xs sm:text-sm text-stone-600 leading-relaxed">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <strong className="text-stone-900 block font-semibold mb-0.5">Zero-Cost Architecture</strong>
                  <span>The platform is built on open tools with zero software licensing costs. 100% of community contributions go toward real-world operations.</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-sky-50 text-sky-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-sky-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <strong className="text-stone-900 block font-semibold mb-0.5">Volunteer Driver Stipends</strong>
                  <span>Assists community delivery partners with small fuel reimbursements for critical surplus food pickups from messes and halls.</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5 border border-amber-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <strong className="text-stone-900 block font-semibold mb-0.5">Community Awareness</strong>
                  <span>Helps onboard new gaushalas, orphanages, composting yards, and college messes in rural and semi-urban Karnataka corridors.</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center gap-2 text-xs text-stone-500">
              <ShieldCheck className="w-4 h-4 text-brand-700 flex-shrink-0" />
              <span>Non-commercial initiative. No payment gateway cut or platform fees.</span>
            </div>
          </Card>

          {/* Public Impact Link */}
          <div className="p-4 rounded-xl bg-surface-muted border border-border text-xs text-stone-600 flex items-center justify-between">
            <span>Curious about our verified redistribution data?</span>
            <Link to="/#impact" className="font-semibold text-brand-800 hover:underline inline-flex items-center gap-1">
              <span>View Impact</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Right Column: Support Plans & Simulated Checkout (Donors/Visitors Only) */}
        <div>
          {isRecipient ? (
            <Card className="p-6 sm:p-8 space-y-5 border-emerald-300 bg-emerald-50/40 shadow-sm text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-200">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-stone-900 text-lg">100% Free for Recipient Organizations</h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                As a verified NGO or beneficiary shelter, you are never asked to purchase a membership or make financial contributions. All food redistribution, listing access, and direct intake are completely free of charge.
              </p>
              <div className="pt-3">
                <Link to="/recipient">
                  <Button variant="primary" size="md" className="w-full justify-center">
                    Return to Recipient Dashboard
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="p-6 sm:p-8 space-y-6 border-brand-200 bg-white shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center border border-emerald-200">
                  <Sparkles className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Support Options</h3>
                  <p className="text-xs text-stone-500">Voluntary Plans & 30-Day Memberships</p>
                </div>
              </div>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900 text-[11px]">
                {currentSelectedTier.badge}
              </Badge>
            </div>

            {toastNotice && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                <span>{toastNotice}</span>
              </div>
            )}

            {/* Contribution Amount Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 block">
                Select your voluntary support tier
              </label>
              <div className="grid grid-cols-3 gap-2">
                {contributionTiers.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setSelectedPlanId(tier.id)}
                    className={`py-2.5 px-2 rounded-lg border text-center transition-all ${
                      selectedPlanId === tier.id
                        ? 'border-brand-700 bg-brand-50/60 ring-1 ring-brand-700 text-brand-900 font-bold'
                        : 'border-border bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    <div className="text-sm font-mono font-bold">₹{tier.amount}</div>
                    <div className="text-[10px] text-stone-600 truncate mt-0.5">{tier.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Plan Details Card */}
            <div className="p-4 rounded-xl bg-surface-muted/70 border border-border space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900 text-sm">{currentSelectedTier.label}</span>
                <span className="font-mono font-bold text-brand-900 text-base">Amount: ₹{currentSelectedTier.amount}</span>
              </div>
              <p className="text-stone-600 leading-relaxed text-[11px]">
                {currentSelectedTier.desc}
              </p>
              {currentSelectedTier.id !== 'coffee' && (
                <div className="pt-2 border-t border-border/80 flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px]">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Tokens rewarded on completed handovers (10 tokens for every 2 kg donated)</span>
                </div>
              )}
            </div>

            {/* Demo Checkout Button */}
            <div className="space-y-3 pt-1">
              <Button
                variant="primary"
                className="w-full py-2.5 text-sm font-semibold justify-center shadow-sm"
                onClick={() => setShowPaymentModal(true)}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                <span>Contribute ₹{selectedAmount} (Demo Payment)</span>
              </Button>

              <p className="text-[11px] text-center text-stone-500">
                Instantly activates 30-day membership with zero real banking charges.
              </p>
            </div>

            {/* Optional Direct UPI Channel or Honest Setup Notice */}
            {!configuredUpiId ? (
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1.5 text-xs text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>UPI channel setup in progress</span>
                </div>
                <p className="text-amber-800 leading-relaxed text-[11px]">
                  Official platform UPI ID is currently being configured for automated direct transfers. You can test membership activation instantly using the demo payment button below.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500 font-medium">Or pay directly via UPI App:</span>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="text-brand-800 hover:text-brand-900 font-semibold inline-flex items-center gap-1"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy UPI ID</span>
                      </>
                    )}
                  </button>
                </div>
                <a
                  href={upiDeepLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-muted hover:bg-stone-200 text-stone-800 font-medium text-xs border border-border transition-colors"
                >
                  <Coffee className="w-3.5 h-3.5 text-amber-700" />
                  <span>Pay ₹{selectedAmount} via UPI App Link</span>
                </a>
              </div>
            )}

            {/* Disclaimer & Transparency Note */}
            <div className="pt-2 border-t border-border space-y-1.5 text-[11px] text-stone-500 leading-relaxed">
              <p>
                <strong>Transparency Note:</strong> All contributions are voluntary and support grassroots food redistribution in Karnataka.
              </p>
            </div>
          </Card>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          planId={selectedPlanId}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(res) => {
            setToastNotice(`Thank you! Successfully contributed ₹${res.amount} (${currentSelectedTier.label}).`);
            setTimeout(() => setToastNotice(''), 5000);
          }}
        />
      )}
    </div>
  );
}

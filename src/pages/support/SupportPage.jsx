import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../../context/LocaleContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
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
  QrCode
} from 'lucide-react';

export function SupportPage() {
  const { t } = useLocale();
  const configuredUpiId = import.meta.env.VITE_CONTRIBUTION_UPI_ID || '';

  const [copied, setCopied] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(50); // ₹50 default

  const handleCopyUpi = () => {
    if (!configuredUpiId) return;
    navigator.clipboard.writeText(configuredUpiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const contributionTiers = [
    { amount: 50, label: 'Cup of Coffee', desc: 'A warm gesture supporting community volunteers' },
    { amount: 100, label: 'Fuel Support', desc: 'Offsets fuel costs for volunteer food dispatch' },
    { amount: 250, label: 'Corridor Help', desc: 'Assists regional redistribution logistics in Karnataka' }
  ];

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
          Support FoodBridge
        </h1>
        <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
          FoodBridge operates as an open community platform connecting surplus food with verified organizations across Karnataka.
          Your voluntary contributions directly support our grassroots redistribution initiative.
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

        {/* Right Column: Buy Us a Coffee / UPI Section */}
        <div>
          <Card className="p-6 sm:p-8 space-y-6 border-brand-200 bg-white shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center border border-amber-200">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Buy Us a Coffee</h3>
                  <p className="text-xs text-stone-500">Voluntary UPI Contribution</p>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900 text-[11px]">
                Voluntary
              </Badge>
            </div>

            {/* Contribution Amount Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 block">
                Choose a voluntary support amount
              </label>
              <div className="grid grid-cols-3 gap-2">
                {contributionTiers.map((tier) => (
                  <button
                    key={tier.amount}
                    type="button"
                    onClick={() => setSelectedAmount(tier.amount)}
                    className={`py-2.5 px-2 rounded-lg border text-center transition-all ${
                      selectedAmount === tier.amount
                        ? 'border-brand-700 bg-brand-50/60 ring-1 ring-brand-700 text-brand-900 font-bold'
                        : 'border-border bg-white text-stone-700 hover:border-stone-400'
                    }`}
                  >
                    <div className="text-sm">₹{tier.amount}</div>
                    <div className="text-[10px] text-stone-500 truncate">{tier.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* UPI Payment Channel */}
            {configuredUpiId ? (
              <div className="space-y-4 pt-2">
                <div className="p-4 rounded-xl bg-surface-muted/60 border border-border space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500 font-medium">Official Community UPI ID:</span>
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
                  <div className="p-2.5 bg-white rounded-lg border border-border font-mono text-sm font-bold text-stone-900 text-center tracking-wide select-all">
                    {configuredUpiId}
                  </div>
                </div>

                {/* Mobile Pay Link */}
                <a
                  href={upiDeepLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-800 text-white font-semibold text-sm hover:bg-brand-700 transition-colors shadow-sm"
                >
                  <Coffee className="w-4 h-4 text-amber-200" />
                  <span>Pay ₹{selectedAmount} via Any UPI App</span>
                </a>
                <p className="text-[11px] text-center text-stone-500">
                  Works with Google Pay, PhonePe, Paytm, BHIM, and bank UPI apps.
                </p>
              </div>
            ) : (
              /* Honest fallback when UPI ID is not yet configured by admin */
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/90 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>UPI Channel Setup in Progress</span>
                </div>
                <p className="leading-relaxed text-amber-800">
                  The official platform UPI ID is currently being configured by the community administrative team.
                  We do not use fabricated or unverified payment handles.
                </p>
                <p className="text-[11px] text-amber-700 pt-1">
                  You can support FoodBridge in the meantime by introducing surplus food donors or shelters in your locality!
                </p>
              </div>
            )}

            {/* Disclaimer & Transparency Note */}
            <div className="pt-4 border-t border-border space-y-2 text-[11px] text-stone-500 leading-relaxed">
              <p>
                <strong>Transparency Note:</strong> All contributions are strictly voluntary and non-refundable. FoodBridge does not charge platform commissions.
              </p>
              <p>
                No automatic transaction verification is claimed; transactions settle directly through your bank's UPI network.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

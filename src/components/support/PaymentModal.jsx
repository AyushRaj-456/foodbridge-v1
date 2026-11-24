import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { getPlanById } from '../../config/membershipConfig';
import { processSimulatedSupportPayment } from '../../services/membershipService';
import {
  XCircle,
  Coffee,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Coins,
  CreditCard,
  ArrowRight
} from 'lucide-react';

export function PaymentModal({
  planId,
  onClose,
  onSuccess
}) {
  const { user, userDoc, profileData } = useAuth();
  const plan = getPlanById(planId);

  const [processing, setProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!plan) return null;

  const handleSimulatePayment = async () => {
    if (!user) {
      setErrorMsg('Please sign in to complete contribution and activate your membership.');
      return;
    }

    if (processing) return; // Prevent duplicate rapid clicks

    // Recipients are 100% free and strictly excluded from purchasing memberships
    if (userDoc?.activeRole === 'recipient' || (userDoc?.roles?.includes('recipient') && !userDoc?.roles?.includes('donor'))) {
      setErrorMsg('Support memberships are exclusively for Donors. FoodBridge is 100% free for Recipient organizations.');
      return;
    }

    try {
      setProcessing(true);
      setErrorMsg('');

      const result = await processSimulatedSupportPayment(undefined, {
        userId: user.uid,
        userEmail: user.email || '',
        userName: profileData?.organizationName || profileData?.fullName || user.displayName || 'Supporter',
        userRole: userDoc?.activeRole || 'donor',
        planId: plan.id,
        customAmount: plan.amount
      });

      setSuccessResult(result);
      if (onSuccess) onSuccess(result);
    } catch (err) {
      console.error('Demo payment error:', err);
      setErrorMsg(err.message || 'Payment simulation failed.');
    } finally {
      setProcessing(false);
    }
  };

  const formattedExpiry = successResult?.expiresAt
    ? new Date(successResult.expiresAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-border overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 bg-stone-50 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base leading-tight">
                {successResult ? 'Payment Successful' : 'Support Contribution'}
              </h3>
              <p className="text-[11px] text-stone-500">
                {successResult ? 'Contribution processed' : 'Simulated demonstration checkout'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1"
            aria-label="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {successResult ? (
            /* Success State */
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center border border-emerald-300">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-stone-900">Thank You For Your Support!</h4>
                <p className="text-xs text-stone-600 mt-1">
                  Your voluntary contribution of <strong>₹{successResult.amount}</strong> has been simulated successfully.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-muted border border-border text-xs text-left space-y-2">
                <div className="flex justify-between items-center text-stone-600">
                  <span>Transaction ID:</span>
                  <span className="font-mono font-semibold text-stone-900">{successResult.transactionId}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Plan:</span>
                  <span className="font-semibold text-stone-900">{plan.name}</span>
                </div>
                {successResult.membershipActivated && (
                  <>
                    <div className="flex justify-between items-center text-stone-600">
                      <span>Membership Status:</span>
                      <Badge variant="active" size="sm">ACTIVE (30 DAYS)</Badge>
                    </div>
                    {formattedExpiry && (
                      <div className="flex justify-between items-center text-stone-600">
                        <span>Valid Until:</span>
                        <span className="font-semibold text-emerald-800">{formattedExpiry}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-stone-600">
                      <span>Redemption Rate:</span>
                      <span className="font-semibold text-emerald-800">₹{plan.redemptionRatePer100} / 100 Tokens</span>
                    </div>
                  </>
                )}
              </div>

              <Button
                variant="primary"
                className="w-full mt-4"
                onClick={onClose}
              >
                Continue to Dashboard
              </Button>
            </div>
          ) : (
            /* Pre-payment confirmation */
            <div className="space-y-4">
              {/* Plan Summary Card */}
              <div className="p-4 rounded-xl border border-brand-200 bg-brand-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-brand-900 block">{plan.name}</span>
                    <span className="text-2xl font-black text-stone-900 font-mono">₹{plan.amount}</span>
                  </div>
                  <Badge variant="outline" className="border-brand-300 bg-brand-100/60 text-brand-900 text-xs">
                    {plan.badge}
                  </Badge>
                </div>

                <p className="text-xs text-stone-600 leading-relaxed">
                  {plan.description}
                </p>

                {plan.activatesMembership && (
                  <div className="pt-2 border-t border-brand-200/60 space-y-1.5 text-xs text-brand-950 font-medium">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-700" />
                      <span>30-Day Active Membership status</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-brand-700" />
                      <span>Earn 10 tokens (Donor) / 5 tokens (NGO) on completed handovers</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-brand-700" />
                      <span>Fixed redemption rate: <strong>₹{plan.redemptionRatePer100} per 100 tokens</strong></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Demo Mode Notice */}
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>Demonstration Payment Notice</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This checkout is fully simulated. No real money will be charged or deducted from your account. It records a verified demo transaction in Firestore and activates your membership immediately.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs">
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button
                  variant="primary"
                  className="w-full py-2.5 text-sm font-semibold justify-center shadow-sm"
                  onClick={handleSimulatePayment}
                  loading={processing}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  <span>Complete Demo Payment (₹{plan.amount})</span>
                </Button>

                <Button
                  variant="outline"
                  className="w-full text-xs text-stone-600 justify-center"
                  onClick={onClose}
                  disabled={processing}
                >
                  Cancel
                </Button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Zero real financial liability • Voluntary community simulation</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

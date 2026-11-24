import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { getPlanById } from '../../config/membershipConfig';
import {
  processSimulatedSupportPayment,
  getUserMembership,
  parseDate
} from '../../services/membershipService';
import {
  XCircle,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Coins,
  CreditCard,
  Smartphone,
  Building2,
  Lock,
  Loader2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

const INDIAN_BANKS = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Punjab National Bank (PNB)',
  'Canara Bank',
  'Bank of Baroda',
  'Kotak Mahindra Bank'
];

export function PaymentModal({
  planId,
  isDemoMode = false,
  onClose,
  onSuccess
}) {
  const { user, userDoc, profileData } = useAuth();
  const plan = getPlanById(planId);

  // Existing membership status for stacking preview
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loadingMembership, setLoadingMembership] = useState(true);

  // Payment method selection: 'card' | 'upi' | 'net_banking'
  const [selectedMethod, setSelectedMethod] = useState('card');

  // Form states for dummy payment details
  const [cardholderName, setCardholderName] = useState('Priya Sharma');
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8892');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('•••');
  const [upiId, setUpiId] = useState('donor@okhdfcbank');
  const [selectedBank, setSelectedBank] = useState(INDIAN_BANKS[0]);
  const [bankCustomerId, setBankCustomerId] = useState('CUST_982341');

  // Flow states: 'idle' | 'processing' | 'success' | 'failed' | 'cancelled'
  const [paymentState, setPaymentState] = useState('idle');
  const [processingStep, setProcessingStep] = useState('');
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch existing membership to calculate stacking preview
  useEffect(() => {
    let isMounted = true;
    async function loadStatus() {
      if (!user?.uid) {
        setLoadingMembership(false);
        return;
      }
      try {
        const mem = await getUserMembership(undefined, user.uid);
        if (isMounted) setCurrentMembership(mem);
      } catch (err) {
        console.warn('Notice loading current membership:', err.message);
      } finally {
        if (isMounted) setLoadingMembership(false);
      }
    }
    loadStatus();
    return () => { isMounted = false; };
  }, [user?.uid]);

  if (!plan) return null;

  // Calculate stacking projection
  const hasActiveOrStacked = currentMembership && (currentMembership.isActive || currentMembership.totalStackDaysRemaining > 0);
  const anchorDate = hasActiveOrStacked && currentMembership.totalStackExpiry
    ? parseDate(currentMembership.totalStackExpiry)
    : new Date();

  const projectedStartDate = hasActiveOrStacked ? anchorDate : new Date();
  const projectedExpiryDate = plan.activatesMembership
    ? new Date(projectedStartDate.getTime() + (30 * 24 * 60 * 60 * 1000))
    : null;

  // Prepare safe masked payment details (Strictly NEVER store raw card numbers, CVVs, or pins)
  const getSafePaymentDetails = () => {
    if (selectedMethod === 'card') {
      const cleanNum = cardNumber.replace(/\D/g, '');
      const last4 = cleanNum.length >= 4 ? cleanNum.slice(-4) : '8892';
      return {
        cardBrand: cardNumber.startsWith('4') ? 'Visa' : cardNumber.startsWith('5') ? 'Mastercard' : 'RuPay',
        last4,
        cardholderName: cardholderName.trim() || 'FoodBridge Donor'
      };
    }
    if (selectedMethod === 'upi') {
      return {
        upiId: upiId.trim() || 'donor@upi'
      };
    }
    if (selectedMethod === 'net_banking') {
      return {
        bankName: selectedBank,
        maskedAccount: '••••' + (bankCustomerId.replace(/\D/g, '').slice(-4) || '9241')
      };
    }
    return {};
  };

  const executePaymentSimulation = async (desiredStatus = 'completed', customFailureReason = null) => {
    if (!user) {
      setErrorMessage('Please sign in to complete your support contribution.');
      return;
    }

    // Role safety check: Donors only
    if (userDoc?.activeRole === 'recipient' || (userDoc?.roles?.includes('recipient') && !userDoc?.roles?.includes('donor'))) {
      setErrorMessage('Support memberships are exclusively for Donors. FoodBridge is 100% free for Recipient organizations.');
      return;
    }

    try {
      setPaymentState('processing');
      setErrorMessage('');

      // Realistic 2-stage processing animation
      setProcessingStep('Authorizing simulated payment gateway...');
      await new Promise((r) => setTimeout(r, 700));

      if (desiredStatus === 'completed') {
        setProcessingStep('Validating demo bank confirmation & stacking schedule...');
        await new Promise((r) => setTimeout(r, 700));
      }

      const safeDetails = getSafePaymentDetails();

      const result = await processSimulatedSupportPayment(undefined, {
        userId: user.uid,
        userEmail: user.email || '',
        userName: profileData?.organizationName || profileData?.fullName || user.displayName || 'Supporter',
        userRole: 'donor',
        planId: plan.id,
        customAmount: plan.amount,
        paymentMethod: selectedMethod,
        paymentMethodDetails: safeDetails,
        paymentStatus: desiredStatus,
        failureReason: customFailureReason || (desiredStatus === 'failed' ? 'Simulated bank authorization decline' : null)
      });

      setResultData(result);

      if (desiredStatus === 'completed') {
        setPaymentState('success');
        if (onSuccess) onSuccess(result);
      } else if (desiredStatus === 'failed') {
        setPaymentState('failed');
      } else if (desiredStatus === 'cancelled') {
        setPaymentState('cancelled');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setPaymentState('failed');
      setErrorMessage(err.message || 'Payment simulation failed.');
    }
  };

  const handleCancelPayment = async () => {
    if (paymentState === 'processing') return;
    await executePaymentSimulation('cancelled', 'Payment session cancelled by user');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-stone-50 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-800 text-white flex items-center justify-center shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base leading-tight">
                {paymentState === 'success'
                  ? 'Payment Confirmation'
                  : paymentState === 'failed'
                  ? 'Payment Declined'
                  : paymentState === 'cancelled'
                  ? 'Checkout Cancelled'
                  : 'FoodBridge Secure Checkout'}
              </h3>
              <p className="text-[11px] text-stone-500">
                Karnataka Food Redistribution Network • Demo Sandbox
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded-lg"
            aria-label="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Prominent Demo Payment Disclaimer Banner */}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>SIMULATED DEMO PAYMENT — NO REAL MONEY CHARGED</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              This is a test checkout simulation for FoodBridge. No financial transaction takes place. Card numbers, CVVs, and passwords are dummy inputs and are never recorded or stored.
            </p>
          </div>

          {/* Processing State */}
          {paymentState === 'processing' && (
            <div className="py-12 text-center space-y-4 animate-in fade-in">
              <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-200 text-brand-800 mx-auto flex items-center justify-center animate-pulse">
                <Loader2 className="w-8 h-8 animate-spin text-brand-800" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-stone-900">Processing Simulated Transaction</h4>
                <p className="text-stone-500 text-xs font-mono">{processingStep}</p>
              </div>
              <p className="text-[11px] text-stone-400 max-w-xs mx-auto">
                Securely verifying simulated parameters and updating Firestore records...
              </p>
            </div>
          )}

          {/* Success State */}
          {paymentState === 'success' && resultData && (
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center border border-emerald-300">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-stone-900">Payment Successful!</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  Your voluntary contribution of <strong>₹{resultData.amount}</strong> has been confirmed.
                </p>
              </div>

              {/* Transaction & Schedule Details */}
              <div className="p-4 rounded-xl bg-surface-muted border border-border text-left space-y-2 text-xs">
                <div className="flex justify-between items-center text-stone-600">
                  <span>Transaction ID:</span>
                  <span className="font-mono font-bold text-stone-900">{resultData.transactionId}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Plan:</span>
                  <span className="font-semibold text-stone-900">{plan.name}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Payment Method:</span>
                  <span className="font-medium capitalize text-stone-800">{selectedMethod.replace('_', ' ')} (Demo)</span>
                </div>

                {resultData.membershipActivated && (
                  <div className="pt-2 border-t border-border/80 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-stone-700">Membership Status:</span>
                      <Badge variant="active" size="sm">
                        {resultData.periodStatus === 'upcoming' ? 'QUEUED / UPCOMING' : 'ACTIVE'}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-stone-600">Coverage Window:</span>
                      <span className="font-mono font-semibold text-brand-900">
                        {resultData.startDate ? new Date(resultData.startDate).toLocaleDateString() : 'Now'} → {resultData.expiresAt ? new Date(resultData.expiresAt).toLocaleDateString() : '30 Days'}
                      </span>
                    </div>

                    {resultData.periodStatus === 'upcoming' && (
                      <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-[11px] flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
                        <span>Consecutive Stacking: This pass is scheduled to activate automatically when your preceding pass expires.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                className="w-full mt-3 py-2.5 text-sm font-semibold justify-center shadow-sm"
                onClick={onClose}
              >
                Done • Return to Dashboard
              </Button>
            </div>
          )}

          {/* Failed State */}
          {paymentState === 'failed' && (
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-red-100 text-red-800 mx-auto flex items-center justify-center border border-red-300">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-stone-900">Payment Simulation Failed</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  {errorMessage || resultData?.failureReason || 'Simulated bank authorization was declined.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-stone-50 border border-border text-left text-[11px] text-stone-600 space-y-1">
                <p>• A failed payment <strong>never activates or queues</strong> a membership pass.</p>
                <p>• The declined attempt has been safely recorded in your audit history.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="primary"
                  className="w-full justify-center"
                  onClick={() => setPaymentState('idle')}
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* Cancelled State */}
          {paymentState === 'cancelled' && (
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-700 mx-auto flex items-center justify-center border border-stone-300">
                <XCircle className="w-8 h-8 text-stone-500" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-stone-900">Checkout Cancelled</h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  The payment simulation was cancelled. No charges or memberships were applied.
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full mt-2 justify-center"
                onClick={onClose}
              >
                Close Window
              </Button>
            </div>
          )}

          {/* Idle / Initial Form State */}
          {paymentState === 'idle' && (
            <div className="space-y-4">
              {/* Order Summary Card */}
              <div className="p-4 rounded-xl border border-brand-200 bg-brand-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-brand-900 uppercase tracking-wider block">Selected Support Option</span>
                    <h4 className="text-base font-bold text-stone-900">{plan.name}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-stone-900 font-mono">₹{plan.amount}</span>
                    <span className="text-[10px] text-stone-500 block">INR</span>
                  </div>
                </div>

                <div className="text-xs text-stone-600 leading-relaxed">
                  {plan.description}
                </div>

                {plan.activatesMembership && (
                  <div className="pt-2 border-t border-brand-200/60 space-y-1.5 text-[11px] text-brand-950 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-brand-700 flex-shrink-0" />
                      <span>Duration: <strong>30 Days</strong> from start date</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins className="w-3.5 h-3.5 text-brand-700 flex-shrink-0" />
                      <span>Reward tokens on completed donations (Redeem rate: <strong>₹{plan.redemptionRatePer100}/100 tokens</strong>)</span>
                    </div>

                    {/* Stacking Projection Preview */}
                    {hasActiveOrStacked && (
                      <div className="mt-2 p-2.5 rounded-lg bg-white/80 border border-brand-300 text-stone-800 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-brand-900 text-xs">
                          <Layers className="w-3.5 h-3.5 text-brand-700" />
                          <span>Duration Stacking Preview</span>
                        </div>
                        <p className="text-[11px] text-stone-600">
                          You already have active membership coverage until <strong>{anchorDate.toLocaleDateString()}</strong>.
                          This purchase will consecutively stack for <strong>+30 days</strong>, extending your coverage until{' '}
                          <strong className="text-emerald-800">{projectedExpiryDate ? projectedExpiryDate.toLocaleDateString() : 'future date'}</strong>!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method Selector Tabs */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-800 block">
                  Select Simulated Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod('card')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      selectedMethod === 'card'
                        ? 'border-brand-700 bg-brand-50/50 text-brand-950 font-bold ring-1 ring-brand-700'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-brand-800" />
                    <span className="text-[11px]">Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod('upi')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      selectedMethod === 'upi'
                        ? 'border-brand-700 bg-brand-50/50 text-brand-950 font-bold ring-1 ring-brand-700'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-brand-800" />
                    <span className="text-[11px]">UPI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod('net_banking')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      selectedMethod === 'net_banking'
                        ? 'border-brand-700 bg-brand-50/50 text-brand-950 font-bold ring-1 ring-brand-700'
                        : 'border-stone-200 hover:border-stone-300 text-stone-600'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-brand-800" />
                    <span className="text-[11px]">Net Banking</span>
                  </button>
                </div>
              </div>

              {/* Method-specific Form Fields */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                {selectedMethod === 'card' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                        Cardholder Name
                      </label>
                      <input
                        type="text"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        placeholder="Name on card"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                        Card Number (Demo)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="4532 •••• •••• 8892"
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] font-bold text-brand-800">
                          TEST CARD
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                          Expiry Date
                        </label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                          CVV (Simulated)
                        </label>
                        <input
                          type="password"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="•••"
                          maxLength={3}
                          className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedMethod === 'upi' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                        Virtual Payment Address / UPI ID
                      </label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="username@bank"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-stone-500">Quick Fill:</span>
                      {['donor@okhdfcbank', 'donor@okicici', 'donor@upi'].map((vpa) => (
                        <button
                          key={vpa}
                          type="button"
                          onClick={() => setUpiId(vpa)}
                          className="px-2 py-0.5 rounded bg-stone-200/70 hover:bg-stone-300 text-[10px] font-mono text-stone-700"
                        >
                          {vpa}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedMethod === 'net_banking' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                        Select Bank
                      </label>
                      <select
                        value={selectedBank}
                        onChange={(e) => setSelectedBank(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                      >
                        {INDIAN_BANKS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-stone-700 uppercase tracking-wider block mb-1">
                        Customer / Account ID (Demo)
                      </label>
                      <input
                        type="text"
                        value={bankCustomerId}
                        onChange={(e) => setBankCustomerId(e.target.value)}
                        placeholder="CUST_123456"
                        className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-mono text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand-700"
                      />
                    </div>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <Button
                  variant="primary"
                  className="w-full py-2.5 text-sm font-semibold justify-center shadow-sm"
                  onClick={() => executePaymentSimulation('completed')}
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  <span>{isDemoMode ? `Pay ₹${plan.amount} (Simulate Success)` : `Pay ₹${plan.amount}`}</span>
                </Button>

                {isDemoMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => executePaymentSimulation('failed', 'Simulated card authorization decline')}
                      className="w-full py-2 px-3 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-100/60 text-red-800 text-[11px] font-medium transition-colors"
                    >
                      Simulate Failed Payment
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPayment}
                      className="w-full py-2 px-3 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-[11px] font-medium transition-colors"
                    >
                      Cancel Checkout
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2 px-3 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Zero financial liability • Safe sandbox environment</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

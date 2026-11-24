import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { REWARD_RULES } from '../../config/membershipConfig';
import { requestTokenRedemption } from '../../services/walletService';
import {
  XCircle,
  Coins,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export function RedemptionModal({
  wallet,
  onClose,
  onSuccess
}) {
  const { t } = useLocale();
  const [tokensToRedeem, setTokensToRedeem] = useState(100);
  const [upiId, setUpiId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  const availableTokens = wallet?.availableTokens || 0;
  const batches = (wallet?.batches || []).filter((b) => (b.remainingTokens || 0) > 0);

  // Calculate live preview of FIFO payout
  const calculatePreviewPayout = (count) => {
    let needed = count;
    let total = 0;
    const previewAllocs = [];

    for (const b of batches) {
      if (needed <= 0) break;
      const take = Math.min(b.remainingTokens, needed);
      const rate = Number(b.redemptionRate) || 0;
      const payout = take * rate;
      previewAllocs.push({
        batchId: b.batchId || b.id,
        planName: b.planNameAtEarning || b.planAtEarning || 'Support Plan',
        tokensDeducted: take,
        ratePer100: b.redemptionRatePer100 || (rate * 100),
        amountINR: Math.round(payout * 100) / 100
      });
      total += payout;
      needed -= take;
    }

    return {
      isValid: needed === 0,
      totalAmount: Math.round(total * 100) / 100,
      allocations: previewAllocs
    };
  };

  const preview = calculatePreviewPayout(tokensToRedeem);

  const handleRedeemSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!wallet?.membership?.isActive) {
      setErrorMsg('Active membership required to redeem tokens. Please renew your membership.');
      return;
    }

    if (tokensToRedeem < REWARD_RULES.MIN_REDEMPTION_TOKENS) {
      setErrorMsg(`Minimum redemption is ${REWARD_RULES.MIN_REDEMPTION_TOKENS} tokens.`);
      return;
    }

    if (tokensToRedeem % 100 !== 0) {
      setErrorMsg('Redemption quantity must be in multiples of 100 tokens.');
      return;
    }

    if (tokensToRedeem > availableTokens) {
      setErrorMsg(`Cannot redeem more than available tokens (${availableTokens}).`);
      return;
    }

    const cleanUpi = upiId.trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      setErrorMsg('Please enter a valid UPI ID (e.g. yourname@okhdfcbank).');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');

      const result = await requestTokenRedemption(undefined, {
        userId: wallet.userId,
        tokensToRedeem,
        upiId: cleanUpi
      });

      setSuccessResult(result);
      if (onSuccess) onSuccess(result);
    } catch (err) {
      console.error('Redemption request error:', err);
      setErrorMsg(err.message || 'Failed to submit redemption request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-stone-50 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base leading-tight">
                {successResult ? 'Redemption Submitted' : t('redemption.title', 'Redeem Reward Tokens')}
              </h3>
              <p className="text-[11px] text-stone-500">
                {successResult ? 'Request pending administrative review' : t('redemption.description', 'Plan-based monetary reward payout')}
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

        {/* Body */}
        <div className="p-6">
          {successResult ? (
            /* Success confirmation */
            <div className="space-y-4 text-center py-2 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center border border-emerald-300">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-stone-900">Redemption Request Received!</h4>
                <p className="text-xs text-stone-600 mt-1">
                  Your request to redeem <strong>{successResult.requestedTokens} tokens</strong> for <strong>₹{successResult.calculatedAmount}</strong> has been logged.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-surface-muted border border-border text-xs text-left space-y-2">
                <div className="flex justify-between items-center text-stone-600">
                  <span>Request ID:</span>
                  <span className="font-mono font-semibold text-stone-900">{successResult.requestId}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Payout Amount:</span>
                  <span className="font-mono font-bold text-emerald-800 text-sm">₹{successResult.calculatedAmount}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Payout UPI ID:</span>
                  <span className="font-mono text-stone-800">{upiId}</span>
                </div>
                <div className="flex justify-between items-center text-stone-600">
                  <span>Status:</span>
                  <Badge variant="warning" size="sm">PENDING REVIEW</Badge>
                </div>
              </div>

              <p className="text-[11px] text-stone-500">
                Tokens are temporarily reserved and will be permanently deducted once administrator approval and simulated payout completes.
              </p>

              <Button
                variant="primary"
                className="w-full mt-2"
                onClick={onClose}
              >
                Back to Wallet
              </Button>
            </div>
          ) : (
            /* Redemption Form */
            <form onSubmit={handleRedeemSubmit} className="space-y-5">
              {/* Available balance notice */}
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs flex items-center justify-between">
                <span className="text-emerald-950 font-medium">{t('wallet.readyForRedemption', 'Available for Redemption')}:</span>
                <span className="font-mono font-bold text-emerald-900 text-sm">{availableTokens} Tokens</span>
              </div>

              {/* Tokens selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-700 flex justify-between">
                  <span>{t('redemption.tokensToRedeem', 'Select Tokens to Redeem (Multiples of 100)')}</span>
                  <span className="text-stone-500 font-normal">Min 100 tokens</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={100}
                    max={availableTokens}
                    step={100}
                    value={tokensToRedeem}
                    onChange={(e) => setTokensToRedeem(Math.max(100, Math.floor(Number(e.target.value) / 100) * 100))}
                    className="w-full px-3 py-2 rounded-lg border border-border font-mono text-base font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTokensToRedeem(Math.floor(availableTokens / 100) * 100)}
                    disabled={availableTokens < 100}
                  >
                    Max
                  </Button>
                </div>
              </div>

              {/* FIFO Batch Allocation & Valuation Preview */}
              <div className="p-3.5 rounded-xl bg-surface-muted border border-border space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-800">{t('redemption.calculatedPayout', 'Calculated Payout (FIFO):')}</span>
                  <span className="font-mono font-bold text-emerald-900 text-base">₹{preview.totalAmount}</span>
                </div>

                <div className="space-y-1.5 pt-1 text-[11px] text-stone-600 border-t border-border/70">
                  {preview.allocations.map((alloc, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="truncate max-w-[200px]">
                        {alloc.tokensDeducted} tokens ({alloc.planName} @ ₹{alloc.ratePer100}/100)
                      </span>
                      <span className="font-mono font-semibold text-stone-800">₹{alloc.amountINR}</span>
                    </div>
                  ))}
                  {preview.allocations.length === 0 && (
                    <div className="text-stone-500 italic">No available reward batches found.</div>
                  )}
                </div>
              </div>

              {/* UPI ID input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">
                  {t('redemption.upiPlaceholder', 'Your UPI ID for Payout Transfer')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. mobile@upi or username@okhdfcbank"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border text-sm text-stone-900 font-mono focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                  required
                />
                <span className="text-[11px] text-stone-500 block">
                  {t('redemption.payoutNotice', 'Payouts are simulated in demonstration mode. No real money will be dispatched.')}
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-700 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full justify-center text-sm font-semibold py-2.5 shadow-sm"
                  loading={submitting}
                  disabled={availableTokens < 100 || !preview.isValid}
                >
                  {t('redemption.submitBtn', 'Confirm Redemption')} (₹{preview.totalAmount})
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center text-xs text-stone-600"
                  onClick={onClose}
                  disabled={submitting}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>FIFO Batch Deductions • Original valuation permanently preserved</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

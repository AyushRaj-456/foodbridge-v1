import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToMessages,
  subscribeToConversation,
  sendChatMessage
} from '../../services/chatService';
import { confirmDeliveryAgreement } from '../../services/deliveryService';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  XCircle,
  Send,
  MessageSquare,
  Truck,
  Building2,
  Utensils,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Phone
} from 'lucide-react';

export function DonationChatModal({
  donation,
  onClose,
  onDeliveryUpdated
}) {
  const { user, profileData } = useAuth();
  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const messagesEndRef = useRef(null);

  const donationId = donation?.id || donation?.donationId;

  // Real-time messages listener
  useEffect(() => {
    if (!donationId) return;

    const unsubMessages = subscribeToMessages(undefined, donationId, (msgs) => {
      setMessages(msgs);
    });

    const unsubConv = subscribeToConversation(undefined, donationId, (conv) => {
      setConversation(conv);
    });

    return () => {
      unsubMessages();
      unsubConv();
    };
  }, [donationId]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sending || !user) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const activeRole = donation.donorId === user.uid
        ? 'donor'
        : donation.acceptedRecipientId === user.uid
        ? 'recipient'
        : 'delivery';

      const senderName = profileData?.organizationName || profileData?.fullName || user.email?.split('@')[0] || 'User';

      await sendChatMessage(undefined, donationId, {
        senderId: user.uid,
        senderName,
        senderRole: activeRole,
        text
      });
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmSplitInChat = async (deliveryId) => {
    if (confirmingDelivery || !user) return;
    setConfirmingDelivery(true);
    try {
      const partyRole = donation.donorId === user.uid ? 'donor' : 'recipient';
      await confirmDeliveryAgreement(undefined, deliveryId, partyRole);
      if (onDeliveryUpdated) onDeliveryUpdated();
    } catch (err) {
      console.error('Error confirming split:', err);
    } finally {
      setConfirmingDelivery(false);
    }
  };

  const formatMessageTime = (ts) => {
    if (!ts) return '';
    const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isDonor = donation?.donorId === user?.uid;
  const isRecipient = donation?.acceptedRecipientId === user?.uid;
  const isDelivery = donation?.deliveryPartnerId === user?.uid;

  const currentRole = isDonor ? 'donor' : isRecipient ? 'recipient' : 'delivery';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-white rounded-2xl border border-stone-200 max-w-2xl w-full h-[88vh] max-h-[700px] flex flex-col shadow-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b border-border bg-surface-muted/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <MessageSquare className="w-5 h-5 text-brand-100" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-900 text-sm sm:text-base truncate">
                  {donation?.title || conversation?.donationTitle || 'Donation Coordination'}
                </h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {(donation?.status || 'Active').replace(/_/g, ' ')}
                </span>
              </div>

              {/* Participant Badges */}
              <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5 truncate">
                <span className="flex items-center gap-1">
                  <Utensils className="w-3 h-3 text-stone-400" />
                  Donor: <strong className="text-stone-700">{donation?.donorName || conversation?.donorName}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-stone-400" />
                  NGO: <strong className="text-stone-700">{donation?.acceptedRecipientName || conversation?.recipientName}</strong>
                </span>
                {conversation?.deliveryPartnerName && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Truck className="w-3 h-3 text-blue-600" />
                      Courier: <strong className="text-blue-700">{conversation.deliveryPartnerName}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg transition-colors"
            aria-label="Close Chat"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#faf9f6]/60">
          {messages.length === 0 ? (
            <div className="py-20 text-center text-stone-400 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No messages yet. Send a message to coordinate pickup or delivery.</p>
            </div>
          ) : (
            messages.map((msg) => {
              // System Message Rendering
              if (msg.isSystemMessage || msg.senderRole === 'system') {
                const isProposal = msg.meta?.type === 'delivery_proposal';
                return (
                  <div key={msg.id} className="flex flex-col items-center my-2 space-y-1.5">
                    <div className="px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-[11px] text-center max-w-md shadow-xs">
                      {msg.text}
                    </div>

                    {/* Interactive proposal confirmation button inside chat */}
                    {isProposal && msg.meta?.deliveryId && (
                      <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl text-center max-w-sm space-y-2">
                        <span className="text-xs font-semibold text-brand-900 block">
                          Agreed 50/50 Cost Split: ₹{msg.meta.totalAmount}
                        </span>
                        <p className="text-[11px] text-stone-600">
                          Donor share: ₹{msg.meta.donorContribution} • Recipient share: ₹{msg.meta.recipientContribution}
                        </p>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleConfirmSplitInChat(msg.meta.deliveryId)}
                          loading={confirmingDelivery}
                        >
                          Confirm My Share (₹{currentRole === 'donor' ? msg.meta.donorContribution : msg.meta.recipientContribution})
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }

              // Normal User Message Rendering
              const isMine = msg.senderId === user?.uid;
              const roleBadgeColor = msg.senderRole === 'donor'
                ? 'bg-amber-100 text-amber-800'
                : msg.senderRole === 'recipient'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-blue-100 text-blue-800';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {!isMine && (
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[11px] font-bold text-stone-700">
                        {msg.senderName}
                      </span>
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${roleBadgeColor}`}>
                        {msg.senderRole}
                      </span>
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs ${
                      isMine
                        ? 'bg-brand-800 text-white rounded-br-xs'
                        : 'bg-white text-stone-800 border border-stone-200 rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <span
                      className={`block text-[10px] text-right mt-1 font-mono ${
                        isMine ? 'text-brand-200' : 'text-stone-400'
                      }`}
                    >
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t border-border bg-white flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message to coordinate pickup or delivery..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
            disabled={sending}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!inputText.trim() || sending}
            loading={sending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { HeartHandshake, ShieldAlert, ChevronRight, X } from 'lucide-react';

export function Footer() {
  const { t } = useLocale();
  const [activeModal, setActiveModal] = useState(null);

  const links = [
    { id: 'about', titleKey: 'footer.sections.about', contentKey: 'footer.placeholders.about' },
    { id: 'contact', titleKey: 'footer.sections.contact', contentKey: 'footer.placeholders.contact' },
    { id: 'faqs', titleKey: 'footer.sections.faqs', contentKey: 'footer.placeholders.faqs' },
    { id: 'privacy', titleKey: 'footer.sections.privacy', contentKey: 'footer.placeholders.privacy' },
    { id: 'terms', titleKey: 'footer.sections.terms', contentKey: 'footer.placeholders.terms' },
  ];

  return (
    <footer className="bg-surface-muted border-t border-border mt-20 pt-16 pb-12 text-stone-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-border">
          {/* Brand & Purpose */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-brand-800 text-white flex items-center justify-center">
                <HeartHandshake className="w-4 h-4 text-brand-100" aria-hidden="true" />
              </div>
              <span className="font-bold text-lg text-stone-900 tracking-tight">
                {t('nav.mark', 'FoodBridge')}
              </span>
            </div>
            <p className="text-sm text-stone-600 max-w-md leading-relaxed mb-4">
              {t('footer.tagline')}
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-200/80 text-xs">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" aria-hidden="true" />
              <span>{t('footer.ownerNote')}</span>
            </div>
          </div>

          {/* Core navigation / sections */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 mb-3">
              Information
            </h3>
            <ul className="space-y-2 text-sm">
              {links.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveModal(item)}
                    className="text-stone-600 hover:text-brand-800 transition-colors inline-flex items-center gap-1 group text-left"
                  >
                    <span>{t(item.titleKey)}</span>
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </li>
              ))}
              <li>
                <a
                  href="/support"
                  className="text-stone-600 hover:text-brand-800 transition-colors inline-flex items-center gap-1 group text-left font-medium"
                >
                  <span>Support FoodBridge</span>
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
            </ul>
          </div>

          {/* Governance & Privacy */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 mb-3">
              Governance & Safety
            </h3>
            <ul className="space-y-2 text-sm">
              {links.slice(3).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveModal(item)}
                    className="text-stone-600 hover:text-brand-800 transition-colors inline-flex items-center gap-1 group text-left"
                  >
                    <span>{t(item.titleKey)}</span>
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-4">
          <p>© {new Date().getFullYear()} {t('footer.copyright')}</p>
          <div className="flex items-center gap-6">
            <span>Karnataka, India</span>
            <span>Zero-Cost Public Architecture</span>
          </div>
        </div>
      </div>

      {/* Accessible Informational Modal for Legal/Policy Placeholders */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-xl border border-border max-w-lg w-full p-6 shadow-xl relative animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 id="modal-title" className="text-lg font-bold text-stone-900">
                  {t(activeModal.titleKey)}
                </h3>
                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                  Project Owner Placeholder
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-surface-muted"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-stone-700 leading-relaxed mb-6">
              {t(activeModal.contentKey)}
            </p>

            <div className="p-3 bg-surface-muted rounded-lg text-xs text-stone-600 border border-border/80 mb-6">
              <strong>Notice:</strong> This operational placeholder is ready for production legal and support documentation prior to public launch.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-brand-800 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

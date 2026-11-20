import React from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { HeartHandshake, ArrowLeft, Building2, Utensils, Truck, ShieldAlert } from 'lucide-react';

export function SignInPlaceholder() {
  const { t } = useLocale();

  const rolePreviews = [
    {
      role: 'Donor',
      desc: 'Messes, marriage halls, caterers, and restaurants with surplus food.',
      icon: Utensils,
    },
    {
      role: 'Recipient Organization',
      desc: 'Verified NGOs, shelters, gaushalas, compost yards, and biogas plants.',
      icon: Building2,
    },
    {
      role: 'Delivery Partner',
      desc: 'Community transport partners coordinating pickup and arrival handovers.',
      icon: Truck,
    },
    {
      role: 'Administrator',
      desc: 'Audited regional verification, partner approvals, and listing safety.',
      icon: ShieldAlert,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-20">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-600 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('auth.backHome', 'Back to Home')}</span>
        </Link>
      </div>

      <Card className="p-6 sm:p-10 border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-800 text-white flex items-center justify-center">
            <HeartHandshake className="w-6 h-6 text-brand-100" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              {t('auth.signInTitle', 'Sign In to FoodBridge')}
            </h1>
            <p className="text-xs sm:text-sm text-stone-600">
              {t('auth.signInSubtitle', 'Access your community redistribution portal')}
            </p>
          </div>
        </div>

        {/* Informational Phase 2 Note */}
        <div className="p-4 rounded-xl bg-brand-50 border border-brand-200/80 text-brand-900 text-xs sm:text-sm leading-relaxed mb-8">
          <p className="font-semibold mb-1">Phase 1 Foundation Ready</p>
          <p className="text-brand-800/90">{t('auth.notice')}</p>
        </div>

        {/* Roles grid */}
        <div className="space-y-3 mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Participant Roles
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rolePreviews.map((item) => {
              const RoleIcon = item.icon;
              return (
                <div
                  key={item.role}
                  className="p-3.5 rounded-lg border border-border bg-surface-muted/40 flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-md bg-white border border-border/80 flex items-center justify-center text-stone-700 flex-shrink-0 mt-0.5">
                    <RoleIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">{item.role}</h3>
                    <p className="text-xs text-stone-600 mt-0.5 leading-snug">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-6 border-t border-border flex justify-end">
          <Link to="/">
            <Button variant="primary">
              {t('auth.backHome', 'Return to Home')}
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';
import { Button } from '../components/common/Button';
import { HeartCrack } from 'lucide-react';

export function NotFoundPage() {
  const { t } = useLocale();

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500">
        <HeartCrack className="w-7 h-7" />
      </div>
      <h1 className="text-2xl font-bold text-stone-900 mb-2">
        Page Not Found
      </h1>
      <p className="text-sm text-stone-600 mb-6">
        The requested redistribution page could not be located.
      </p>
      <Link to="/">
        <Button variant="primary">
          {t('auth.backHome', 'Return to Home')}
        </Button>
      </Link>
    </div>
  );
}

import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../context/LocaleContext';
import { db } from '../services/firebase';
import { calculatePublicImpact } from '../services/impactService';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { SectionHeading } from '../components/common/SectionHeading';
import { EmptyState } from '../components/common/EmptyState';
import { GlobeFallback } from '../components/globe/GlobeFallback';
import {
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Trees,
  Flame,
  Dog,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  HeartHandshake,
  BarChart3,
  Scale,
  Coffee
} from 'lucide-react';

// Lazy-load the 3D globe to avoid blocking initial render
const InteractiveGlobe = lazy(() =>
  import('../components/globe/InteractiveGlobe').then((module) => ({
    default: module.InteractiveGlobe,
  }))
);

export function LandingPage() {
  const { t } = useLocale();

  const [impactData, setImpactData] = useState({
    totalMealsEstimated: 0,
    totalQuantityKg: 0,
    activeVerifiedRecipients: 0,
    ghgEmissionsAvoidedKg: 0,
    completedDonationsCount: 0,
    isZeroState: true
  });
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadImpact() {
      try {
        const data = await calculatePublicImpact(db);
        if (isMounted && data) {
          setImpactData(data);
        }
      } catch (err) {
        // Keeps verified zero state on network error
      }
    }
    loadImpact();
    return () => {
      isMounted = false;
    };
  }, []);

  const recipientCategories = [
    {
      id: 'human',
      badgeVariant: 'human',
      icon: Users,
      title: t('categories.items.human.title'),
      badgeText: t('categories.items.human.badge'),
      description: t('categories.items.human.description'),
      accepts: t('categories.items.human.accepts'),
      borderAccent: 'hover:border-emerald-500/60'
    },
    {
      id: 'animal',
      badgeVariant: 'animal',
      icon: Dog,
      title: t('categories.items.animal.title'),
      badgeText: t('categories.items.animal.badge'),
      description: t('categories.items.animal.description'),
      accepts: t('categories.items.animal.accepts'),
      borderAccent: 'hover:border-amber-500/60'
    },
    {
      id: 'compost',
      badgeVariant: 'compost',
      icon: Trees,
      title: t('categories.items.compost.title'),
      badgeText: t('categories.items.compost.badge'),
      description: t('categories.items.compost.description'),
      accepts: t('categories.items.compost.accepts'),
      borderAccent: 'hover:border-lime-500/60'
    },
    {
      id: 'biogas',
      badgeVariant: 'biogas',
      icon: Flame,
      title: t('categories.items.biogas.title'),
      badgeText: t('categories.items.biogas.badge'),
      description: t('categories.items.biogas.description'),
      accepts: t('categories.items.biogas.accepts'),
      borderAccent: 'hover:border-sky-500/60'
    },
  ];

  const steps = [
    {
      number: t('howItWorks.step1.number'),
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
      icon: Clock,
    },
    {
      number: t('howItWorks.step2.number'),
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
      icon: Scale,
    },
    {
      number: t('howItWorks.step3.number'),
      title: t('howItWorks.step3.title'),
      description: t('howItWorks.step3.description'),
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-24 sm:space-y-32">
      {/* 1. HERO SECTION */}
      <section className="relative pt-6 sm:pt-12 lg:pt-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-900 text-xs font-semibold">
                <HeartHandshake className="w-3.5 h-3.5 text-brand-700" aria-hidden="true" />
                <span>{t('hero.globeBadge')}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-stone-900 tracking-tight leading-[1.12]">
                {t('hero.headline')}
              </h1>

              <p className="text-base sm:text-lg text-stone-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                {t('hero.subheadline')}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                <Link to="/signin" className="w-full sm:w-auto">
                  <Button variant="primary" size="lg" fullWidth className="group">
                    <span>{t('hero.ctaDonate')}</span>
                    <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Button>
                </Link>
                <a href="#how-it-works" className="w-full sm:w-auto">
                  <Button variant="secondary" size="lg" fullWidth>
                    {t('hero.ctaExplore')}
                  </Button>
                </a>
              </div>

              <p className="text-xs text-stone-500 pt-1">
                {t('hero.illustrativeNotice')}
              </p>
            </div>

            {/* Right Interactive Globe Column */}
            <div className="lg:col-span-6">
              <Suspense fallback={<GlobeFallback reason="loading" />}>
                <InteractiveGlobe />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS SECTION */}
      <section id="how-it-works" className="scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            overline="Redistribution Flow"
            title={t('howItWorks.title')}
            subtitle={t('howItWorks.subtitle')}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => {
              const StepIcon = step.icon;
              return (
                <Card key={step.number} hover className="p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-800 border border-brand-200/60 flex items-center justify-center">
                        <StepIcon className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-2xl font-bold text-stone-300">
                        {step.number}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-stone-900 tracking-tight">
                      {step.title}
                    </h3>

                    <p className="text-sm text-stone-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  <div className="pt-6 mt-6 border-t border-border/60 flex items-center text-xs font-semibold text-brand-800">
                    <span>Community Step</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. RECIPIENT CATEGORIES SECTION */}
      <section id="recipients" className="scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            overline="Structured Suitability"
            title={t('categories.title')}
            subtitle={t('categories.subtitle')}
          />

          {/* Safety Rule Callout Banner */}
          <div className="mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs sm:text-sm font-medium leading-relaxed">
              {t('categories.safetyBanner')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recipientCategories.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <Card key={cat.id} hover className={`p-6 sm:p-7 flex flex-col justify-between ${cat.borderAccent}`}>
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-surface-muted text-stone-800 flex items-center justify-center border border-border">
                          <CatIcon className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-stone-900">
                          {cat.title}
                        </h3>
                      </div>
                      <Badge variant={cat.badgeVariant}>
                        {cat.badgeText}
                      </Badge>
                    </div>

                    <p className="text-sm text-stone-600 leading-relaxed">
                      {cat.description}
                    </p>

                    <div className="p-3 rounded-lg bg-surface-muted/60 border border-border/80 text-xs text-stone-700 font-medium">
                      {cat.accepts}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. IMPACT SECTION (Real Zero-State Metrics) */}
      <section id="impact" className="scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            overline="Accountability & Metrics"
            title={t('impact.title')}
            subtitle={t('impact.subtitle')}
          />

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
            <Card className="p-5 sm:p-6 text-center">
              <span className="block text-3xl sm:text-4xl font-extrabold text-stone-900 font-mono tracking-tight">
                {impactData.totalMealsEstimated}
              </span>
              <span className="block text-xs sm:text-sm font-semibold text-stone-800 mt-1">
                {t('impact.metrics.meals.label')}
              </span>
              <span className="block text-[11px] text-stone-500 mt-0.5">
                {t('impact.metrics.meals.unit')}
              </span>
            </Card>

            <Card className="p-5 sm:p-6 text-center">
              <span className="block text-3xl sm:text-4xl font-extrabold text-stone-900 font-mono tracking-tight">
                {impactData.totalQuantityKg}
              </span>
              <span className="block text-xs sm:text-sm font-semibold text-stone-800 mt-1">
                {t('impact.metrics.foodSaved.label')}
              </span>
              <span className="block text-[11px] text-stone-500 mt-0.5">
                {t('impact.metrics.foodSaved.unit')}
              </span>
            </Card>

            <Card className="p-5 sm:p-6 text-center">
              <span className="block text-3xl sm:text-4xl font-extrabold text-stone-900 font-mono tracking-tight">
                {impactData.activeVerifiedRecipients}
              </span>
              <span className="block text-xs sm:text-sm font-semibold text-stone-800 mt-1">
                {t('impact.metrics.organizations.label')}
              </span>
              <span className="block text-[11px] text-stone-500 mt-0.5">
                {t('impact.metrics.organizations.unit')}
              </span>
            </Card>

            <Card className="p-5 sm:p-6 text-center">
              <span className="block text-3xl sm:text-4xl font-extrabold text-stone-900 font-mono tracking-tight">
                {impactData.ghgEmissionsAvoidedKg}
              </span>
              <span className="block text-xs sm:text-sm font-semibold text-stone-800 mt-1">
                {t('impact.metrics.emissions.label')}
              </span>
              <span className="block text-[11px] text-stone-500 mt-0.5">
                {t('impact.metrics.emissions.unit')}
              </span>
            </Card>
          </div>

          {/* Transparent Calculation Methodology Documentation */}
          <div className="p-3.5 rounded-xl bg-surface-muted/80 border border-border/80 text-xs text-stone-600 mb-8 text-center leading-relaxed max-w-4xl mx-auto">
            <span className="font-semibold text-stone-800">Methodology: </span>
            <span>{t('impact.calculationMethod')}</span>
          </div>

          {/* Genuine Zero-State Assurance or Active Impact Badge */}
          {impactData?.isZeroState !== false ? (
            <EmptyState
              icon={BarChart3}
              title={t('impact.zeroStateHeading')}
              description={t('impact.zeroStateBody')}
              action={
                <Link to="/signin">
                  <Button variant="outline" size="sm">
                    {t('hero.ctaDonate')}
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                <span>
                  <strong>Verified Impact:</strong> Computed strictly from {impactData.completedDonationsCount} completed food redistribution handovers.
                </span>
              </div>
              <Link to="/signin">
                <Button variant="primary" size="sm">
                  {t('hero.ctaDonate')}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 5. COMMUNITY SUPPORT & MEMBERSHIP SECTION */}
      <section className="bg-gradient-to-b from-transparent to-amber-50/40 py-14 border-t border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold">
              <Coffee className="w-3.5 h-3.5 text-amber-700" />
              <span>Community Support & Membership</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
              Support FoodBridge With a Voluntary Contribution
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Voluntary contributions keep zero-waste food rescue active in Karnataka. Memberships enable token earnings and redemptions for Donors and verified NGOs.
            </p>
          </div>

          {/* 3 Support Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Plan A: Buy Us a Coffee */}
            <Card className="p-6 flex flex-col justify-between border-stone-200 hover:border-amber-300 transition-all bg-white shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center border border-amber-200">
                    <Coffee className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className="border-stone-300 text-stone-700 text-[10px]">
                    One-Time Support
                  </Badge>
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Buy Us a Coffee</h3>
                  <div className="text-2xl font-black text-stone-900 font-mono mt-1">₹50</div>
                  <p className="text-xs text-stone-500 mt-2 leading-relaxed">
                    A warm gesture supporting community volunteers. No membership or token earning benefits.
                  </p>
                </div>
              </div>
              <div className="pt-5 mt-4 border-t border-border">
                <Link to="/support" className="block w-full">
                  <Button variant="outline" size="sm" className="w-full justify-center">
                    Contribute ₹50
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Plan B: Fuel Support */}
            <Card className="p-6 flex flex-col justify-between border-emerald-300 ring-1 ring-emerald-500/20 bg-emerald-50/20 shadow-sm relative overflow-hidden">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <Badge variant="active" size="sm" className="text-[10px]">
                    30-Day Membership
                  </Badge>
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Fuel Support</h3>
                  <div className="text-2xl font-black text-stone-900 font-mono mt-1">₹100</div>
                  <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                    Activates a 30-day membership. Earn 10 tokens (Donor) or 5 tokens (NGO) on completed handovers.
                  </p>
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-100/60 border border-emerald-200 text-[11px] font-semibold text-emerald-900">
                    Redemption Rate: ₹2 per 100 tokens
                  </div>
                </div>
              </div>
              <div className="pt-5 mt-4 border-t border-emerald-200/80">
                <Link to="/support" className="block w-full">
                  <Button variant="primary" size="sm" className="w-full justify-center">
                    Join for ₹100
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Plan C: Corridor Help */}
            <Card className="p-6 flex flex-col justify-between border-brand-300 bg-brand-50/20 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-900 flex items-center justify-center border border-brand-200">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <Badge variant="outline" className="border-brand-300 text-brand-900 bg-brand-50 text-[10px]">
                    30-Day Membership
                  </Badge>
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Corridor Help</h3>
                  <div className="text-2xl font-black text-stone-900 font-mono mt-1">₹250</div>
                  <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                    Assists regional redistribution logistics. Earn tokens on handovers with maximum redemption value.
                  </p>
                  <div className="mt-3 p-2.5 rounded-lg bg-brand-100/60 border border-brand-200 text-[11px] font-semibold text-brand-950">
                    Redemption Rate: ₹6 per 100 tokens
                  </div>
                </div>
              </div>
              <div className="pt-5 mt-4 border-t border-brand-200/80">
                <Link to="/support" className="block w-full">
                  <Button variant="primary" size="sm" className="w-full justify-center">
                    Join for ₹250
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          <div className="pt-2 text-center text-xs text-stone-500">
            <span>Voluntary contributions support logistics across Karnataka. </span>
            <Link to="/support" className="text-brand-800 font-semibold underline hover:text-brand-900">
              Learn more about member benefits and simulated demo checkout &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

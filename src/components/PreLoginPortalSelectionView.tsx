import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  FlaskConical,
  HeartPulse,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  Warehouse,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../constants/brand';
import { useMedora } from '../contexts/MedoraContext';
import type { PortalIntent, PortalType } from '../types/medora';
import type { MedoraAdRecord } from '../types/patient';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';
import { HaneenAvatar } from './patient/HaneenAvatar';
import { MedoraTargetedAdShowcase } from './shared/MedoraTargetedAdShowcase';

interface PreLoginPortalSelectionViewProps {
  onBackToIntro: () => void;
  onSelectIntent: (intent: PortalIntent) => void;
  onOpenRequests?: () => void;
  onOpenDirectory?: () => void;
}

interface PortalCardSpec {
  id: PortalType;
  icon: typeof HeartPulse;
  accentText: string;
  accentBorder: string;
  accentBg: string;
}

const PORTAL_CARDS: PortalCardSpec[] = [
  {
    id: 'patient',
    icon: HeartPulse,
    accentText: 'text-sky-600 dark:text-sky-400',
    accentBorder: 'hover:border-sky-500/60 dark:hover:border-sky-400/60',
    accentBg: 'bg-sky-500/10 border-sky-500/20',
  },
  {
    id: 'doctor',
    icon: Stethoscope,
    accentText: 'text-blue-700 dark:text-blue-400',
    accentBorder: 'hover:border-blue-600/60 dark:hover:border-blue-400/60',
    accentBg: 'bg-blue-600/10 border-blue-500/20',
  },
  {
    id: 'lab',
    icon: FlaskConical,
    accentText: 'text-emerald-700 dark:text-emerald-400',
    accentBorder: 'hover:border-emerald-600/60 dark:hover:border-emerald-400/60',
    accentBg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'secretary',
    icon: UserCheck,
    accentText: 'text-[#9d6b14] dark:text-[#f4d378]',
    accentBorder: 'hover:border-[#d9a43b]/70',
    accentBg: 'bg-[#d9a43b]/15 border-[#d9a43b]/30',
  },
  {
    id: 'pharmacy',
    icon: Pill,
    accentText: 'text-teal-700 dark:text-teal-400',
    accentBorder: 'hover:border-teal-600/60 dark:hover:border-teal-400/60',
    accentBg: 'bg-teal-500/10 border-teal-500/20',
  },
  {
    id: 'wholesaler',
    icon: Warehouse,
    accentText: 'text-indigo-700 dark:text-indigo-400',
    accentBorder: 'hover:border-indigo-600/60 dark:hover:border-indigo-400/60',
    accentBg: 'bg-indigo-500/10 border-indigo-500/20',
  },
];

export function PreLoginPortalSelectionView({
  onBackToIntro,
  onSelectIntent,
  onOpenRequests,
  onOpenDirectory,
}: PreLoginPortalSelectionViewProps) {
  const { language, t, requests, portalIntent, firebaseUser } = useMedora();
  const isAr = language === 'ar';
  const ForwardIcon = isAr ? ArrowLeft : ArrowRight;
  const prefersReducedMotion = useReducedMotion();
  const [haneenWelcomeOpen, setHaneenWelcomeOpen] = useState(false);

  const ecosystemServices = [
    {
      index: '01',
      title: isAr ? 'الأطباء والعيادات المعتمدة' : 'Verified Physicians & Clinics',
      desc: isAr
        ? 'حجز المواعيد، الملف الطبي المشترك، والوصفات الإلكترونية.'
        : 'Appointment booking, shared patient records, and digital Rx.',
      actionLabel: isAr ? 'استعراض دليل الأطباء' : 'Browse Directory',
      onClick: () => (onOpenDirectory ? onOpenDirectory() : onSelectIntent('doctor')),
      Icon: Stethoscope,
    },
    {
      index: '02',
      title: isAr ? 'المختبرات الطبية والتحاليل' : 'Accredited Medical Laboratories',
      desc: isAr
        ? 'سحب منزلي، نتائج رقمية موثّقة، وربط مباشر مع ملف المريض.'
        : 'Home collection, verified lab results, and direct chart sync.',
      actionLabel: isAr ? 'بوابة المختبر' : 'Lab Portal',
      onClick: () => onSelectIntent('lab'),
      Icon: FlaskConical,
    },
    {
      index: '03',
      title: isAr ? 'سلسلة الصيدليات والمذاخر' : 'Pharmacy & Wholesale Supply',
      desc: isAr
        ? 'توريد FEFO متكامل، طلبات المرضى والأطباء، وإيصالات ثلاثية الأطراف.'
        : 'FEFO batch stock, doctor & patient orders, and 3-party receipts.',
      actionLabel: isAr ? 'بوابة الصيدلية' : 'Pharmacy Portal',
      onClick: () => onSelectIntent('pharmacy'),
      Icon: Pill,
    },
    {
      index: '04',
      title: isAr ? 'حنين الذكية للتثقيف الصحي' : 'Haneen AI Health Guidance',
      desc: isAr
        ? 'قراءة مبسطة للتقارير والتحاليل باللهجة العراقية وباستشهادات طبية موثوقة.'
        : 'Plain-language lab guidance and safe health education for patients.',
      actionLabel: isAr ? 'تعرّف على حنين' : 'Meet Haneen',
      onClick: () => setHaneenWelcomeOpen(true),
      Icon: Sparkles,
    },
  ];

  const handleEntryAdAction = (ad: MedoraAdRecord) => {
    if (ad.entityType === 'doctor' && onOpenDirectory) {
      onOpenDirectory();
      return;
    }
    if (ad.entityType === 'lab') {
      onSelectIntent('patient');
      return;
    }
    if (ad.entityType === 'pharmacy') {
      onSelectIntent('pharmacy');
      return;
    }
    if (ad.entityType === 'wholesaler') {
      onSelectIntent('wholesaler');
      return;
    }
    onSelectIntent('patient');
  };

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar
        onBackToIntro={onBackToIntro}
        showRequestsAction={Boolean(onOpenRequests)}
        onOpenRequests={onOpenRequests}
      />

      <main className="relative z-10 mx-auto my-8 w-full max-w-6xl space-y-10">
        {/* 1. Luxury MEDORA Ecosystem Hero */}
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-[#d9a43b]/25 dark:bg-[#07122a]/90 sm:p-10">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 text-center lg:col-span-8 lg:text-start">
              <p className="text-xs font-bold tracking-wider text-[#b68023] dark:text-[#f4d378]">
                {isAr
                  ? 'منظومة MEDORA الطبية والتجارية المتكاملة'
                  : 'MEDORA MEDICAL & PHARMACEUTICAL ECOSYSTEM'}
              </p>
              <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl lg:text-[2.65rem]">
                {t.portals.welcomeTitle}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
                {t.portals.choosePortalSubtitle}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2 lg:justify-start">
                {onOpenDirectory && (
                  <button
                    type="button"
                    onClick={onOpenDirectory}
                    className="medora-gold-button inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-[#040917] shadow-sm whitespace-nowrap cursor-pointer"
                  >
                    <Stethoscope className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {isAr
                        ? 'تصفح دليل أطباء MEDORA المعتمدين'
                        : 'Browse Approved Physicians Directory'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectIntent('patient')}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#0c3585]/35 bg-white px-5 py-2.5 text-xs font-bold text-[#0c3585] transition-colors hover:border-[#0c3585] dark:border-[#d9a43b]/35 dark:bg-[#040a1a] dark:text-[#f4d378] whitespace-nowrap cursor-pointer"
                >
                  <span>{isAr ? 'دخول بوابة المريض' : 'Enter Patient Portal'}</span>
                  <ForwardIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center lg:col-span-4">
              <div className="w-full max-w-[210px] sm:max-w-[240px]">
                <img
                  src={MEDORA_LOGO_URL}
                  alt="MEDORA Official Logo"
                  className="medora-logo-adaptive h-auto w-full select-none"
                />
              </div>
              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                {isAr
                  ? 'هوية طبية موثّقة · إدارة صلاحيات مستقلة لكل بوابة'
                  : 'Verified Healthcare Identity · Role-Isolated Portals'}
              </p>
            </div>
          </div>
        </section>

        {/* 2. Animated Targeted Showcase Carousel (Entry Audience Only) */}
        <MedoraTargetedAdShowcase
          portal="entry"
          language={language}
          firebaseUser={firebaseUser}
          onAdAction={handleEntryAdAction}
        />

        {/* 3. Organized MEDORA Ecosystem Services */}
        <section aria-labelledby="ecosystem-services-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2
                id="ecosystem-services-heading"
                className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl"
              >
                {isAr ? 'خدمات منظومة MEDORA الرئيسية' : 'Core MEDORA Ecosystem Services'}
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
                {isAr
                  ? 'ربط مباشر بين المرضى والأطباء والمختبرات والصيدليات والمذاخر الدوائية في بيئة موحدة.'
                  : 'Unified clinical and pharmaceutical coordination across all licensed healthcare stakeholders.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ecosystemServices.map((srv) => {
              const Icon = srv.Icon;
              return (
                <button
                  key={srv.index}
                  type="button"
                  onClick={srv.onClick}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white/95 p-5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d9a43b]/70 dark:border-slate-800 dark:bg-[#07122a]/90 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-latin text-xs font-bold tracking-wider text-[#b68023] tabular-nums dark:text-[#f4d378]">
                        {srv.index}.
                      </span>
                      <Icon className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                      {srv.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {srv.desc}
                    </p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#0c3585] group-hover:underline dark:text-[#f4d378]">
                    <span>{srv.actionLabel}</span>
                    <ForwardIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Role-Based Access Portals Grid */}
        <section aria-labelledby="portals-entry-heading" className="space-y-4">
          <div>
            <h2
              id="portals-entry-heading"
              className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl"
            >
              {isAr ? 'بوابات الدخول والتسجيل المصرّح بها' : 'Authorized Entry Portals'}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
              {isAr
                ? 'اختر البوابة المناسبة لحسابك؛ يتم التحقق من الصلاحية والاعتماد تلقائياً عند تسجيل الدخول.'
                : 'Select your destination portal; account permissions and approval status are enforced automatically.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PORTAL_CARDS.map((card) => {
              const Icon = card.icon;
              const copy = t.portals.items[card.id];
              const existingForPortal = requests.find(
                (r) => r.portalType === card.id,
              );
              const isSelected = portalIntent === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  data-portal-card={card.id}
                  onClick={() => onSelectIntent(card.id)}
                  className={`group flex flex-col justify-between rounded-2xl border bg-white/95 p-6 text-start shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:bg-[#07122a]/90 cursor-pointer ${
                    isSelected
                      ? 'border-[#d9a43b] ring-1 ring-[#d9a43b]/40'
                      : `border-slate-200 dark:border-slate-800 ${card.accentBorder}`
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border ${card.accentBg}`}
                      >
                        <Icon className={`h-6 w-6 ${card.accentText}`} aria-hidden="true" />
                      </div>
                      {existingForPortal && (
                        <span className="text-xs font-semibold text-[#b68023] dark:text-[#f4d378]">
                          {t.statusView.statuses[existingForPortal.status]}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
                      {copy.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {copy.subtitle}
                    </p>
                  </div>

                  <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {copy.activationNote}
                    </p>
                    <span
                      className={`mt-3 inline-flex items-center gap-1.5 text-sm font-bold ${card.accentText} group-hover:underline`}
                    >
                      <span>{t.portals.selectPortalAction}</span>
                      <ForwardIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Super Admin Executive Card */}
            <button
              type="button"
              data-portal-card="super_admin"
              onClick={() => onSelectIntent('super_admin')}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-gradient-to-br from-[#061128] via-[#081a3e] to-[#040a18] p-6 text-start text-white shadow-[0_20px_50px_-20px_rgba(12,53,133,0.65)] transition-all duration-200 hover:-translate-y-1 hover:border-[#f4d378] hover:shadow-[0_24px_60px_-18px_rgba(217,164,59,0.45)] cursor-pointer ${
                portalIntent === 'super_admin'
                  ? 'border-[#f4d378] ring-2 ring-[#d9a43b]/40'
                  : 'border-[#d9a43b]/55'
              }`}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-12 -top-12 h-36 w-36 rounded-full bg-[#d9a43b]/15 blur-2xl transition-opacity group-hover:opacity-100"
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#d9a43b]/45 bg-[#d9a43b]/15">
                    <Crown className="h-6 w-6 text-[#f4d378]" aria-hidden="true" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9a43b]/40 bg-[#d9a43b]/15 px-2.5 py-1 text-[11px] font-semibold text-[#f4d378]">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.portals.superAdminCard.badge}</span>
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-bold text-white">
                  {t.portals.superAdminCard.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {t.portals.superAdminCard.subtitle}
                </p>
              </div>

              <div className="relative mt-6 border-t border-[#d9a43b]/25 pt-4">
                <p className="text-xs text-[#f4d378]/85">
                  {t.portals.superAdminCard.activationNote}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#f4d378] group-hover:underline">
                  <span>{t.portals.superAdminCard.action}</span>
                  <ForwardIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-t border-slate-200/80 pt-4 text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-500">
        <span>MEDORA Medical Platform</span>
        <span className="font-latin tracking-wider" dir="ltr">
          YOUR HEALTH · OUR PRIORITY
        </span>
      </footer>

      {/* Floating Official Haneen Icon at Bottom of Main Page */}
      {!haneenWelcomeOpen && (
        <button
          type="button"
          onClick={() => setHaneenWelcomeOpen(true)}
          aria-label={isAr ? 'التعرّف على حنين الذكية' : 'Meet HANEEN AI Assistant'}
          title={isAr ? 'حنين الذكية — المساعد الصحي' : 'HANEEN AI Health Assistant'}
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] end-5 z-40 flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4d378] cursor-pointer"
        >
          <HaneenAvatar size="fab" language={language} />
        </button>
      )}

      {/* Welcome Assistant Dialog */}
      <AnimatePresence>
        {haneenWelcomeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            onClick={() => setHaneenWelcomeOpen(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={isAr ? 'ترحيب حنين الذكية' : 'Welcome to HANEEN AI'}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-t-3xl border border-violet-400/35 bg-white p-6 text-center shadow-[0_24px_70px_-15px_rgba(109,40,217,0.5)] dark:border-[#d9a43b]/35 dark:bg-[#07122a] sm:max-w-lg sm:rounded-3xl sm:p-8"
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setHaneenWelcomeOpen(false)}
                  aria-label={isAr ? 'إغلاق' : 'Close'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <HaneenAvatar size="xl" language={language} className="mx-auto mt-1" />

              <h2 className="mt-4 text-xl font-extrabold text-slate-950 dark:text-white sm:text-2xl">
                {isAr
                  ? 'هلا والله! آني حنين الذكية في MEDORA'
                  : 'Hello! I am HANEEN AI on MEDORA'}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base">
                {isAr
                  ? 'أساعدكم تفهمون نتائج التحاليل وتقارير الأشعة والمصطلحات الطبية باللهجة العراقية البسيطة والواضحة، استناداً إلى مصادر طبية موثوقة.'
                  : 'I help you understand your lab results, imaging terms, and medical concepts in clear everyday language based on trusted medical references.'}
              </p>

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setHaneenWelcomeOpen(false);
                    onSelectIntent('patient');
                  }}
                  className="medora-gold-button inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold text-[#040917] cursor-pointer"
                >
                  <span>
                    {isAr
                      ? 'دخول بوابة المريض لمحادثة حنين'
                      : 'Enter Patient Portal to Chat with Haneen'}
                  </span>
                  <ForwardIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

import { motion } from 'motion/react';
import {
  Activity,
  FlaskConical,
  HeartPulse,
  Info,
  Pill,
  Stethoscope,
  UserCheck,
  Warehouse,
} from 'lucide-react';
import { useMedora } from '../contexts/MedoraContext';
import type { PortalType } from '../types/medora';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';
import { MedoraTargetedAdShowcase } from './shared/MedoraTargetedAdShowcase';

interface PortalSelectionViewProps {
  onSelectPortal: (portal: PortalType) => void;
  onEditPersonal: () => void;
  onOpenRequests: () => void;
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

export function PortalSelectionView({
  onSelectPortal,
  onEditPersonal,
  onOpenRequests,
}: PortalSelectionViewProps) {
  const { t, requests, language, firebaseUser } = useMedora();

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar
        showRequestsAction
        onOpenRequests={onOpenRequests}
      />

      <main className="relative z-10 mx-auto my-8 w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
              {t.portals.stepLabel}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-4xl">
              {t.portals.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
              {t.portals.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onEditPersonal}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#d9a43b] dark:border-slate-700 dark:bg-[#07122a]/85 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Activity className="h-3.5 w-3.5 text-[#d9a43b]" aria-hidden="true" />
            <span>{t.forms.editPersonalInfo}</span>
          </button>
        </div>

        {requests.length > 0 && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 px-4 py-3.5 text-sm text-slate-800 dark:bg-[#d9a43b]/10 dark:text-amber-100">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#b68023] dark:text-[#f4d378]" aria-hidden="true" />
            <div>
              <p className="font-semibold">{t.portals.independenceTitle}</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-90 sm:text-sm">
                {t.portals.independenceNotice}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <MedoraTargetedAdShowcase
            portal="entry"
            language={language}
            firebaseUser={firebaseUser}
            compact
            onAdAction={(ad) => {
              if (ad.entityType === 'pharmacy') onSelectPortal('pharmacy');
              else if (ad.entityType === 'wholesaler') onSelectPortal('wholesaler');
              else if (ad.entityType === 'doctor') onSelectPortal('doctor');
              else onSelectPortal('patient');
            }}
          />
        </div>

        {/* Approved Non-Imaging Portals Only — Super Admin is NEVER shown here */}
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PORTAL_CARDS.map((card) => {
            const Icon = card.icon;
            const copy = t.portals.items[card.id];
            const existingForPortal = requests.find(
              (r) => r.portalType === card.id,
            );

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectPortal(card.id)}
                className={`group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white/95 p-6 text-start shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-[#07122a]/90 ${card.accentBorder} cursor-pointer`}
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

                  <h2 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
                    {copy.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {copy.subtitle}
                  </p>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.activationNote}
                  </p>
                  <span
                    className={`mt-3 inline-flex items-center text-sm font-bold ${card.accentText} group-hover:underline`}
                  >
                    {t.portals.selectPortalAction}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </motion.section>
  );
}

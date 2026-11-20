import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileEdit,
  PlusCircle,
  XCircle,
} from 'lucide-react';
import { useMedora } from '../contexts/MedoraContext';
import type {
  PortalType,
  RegistrationRequest,
  RequestStatus,
} from '../types/medora';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  IMAGING_PORTAL_DISABLED_MESSAGE_AR,
  isImagingPortalIdentifier,
} from '../config/featureFlags';

interface RequestStatusViewProps {
  justSubmittedRequest?: RegistrationRequest | null;
  highlightedPortal?: PortalType | null;
  onSelectAnotherPortal: () => void;
  onEditResubmitPortal: (portal: PortalType) => void;
  onOpenDoctorPortal?: () => void;
  onOpenPatientPortal?: () => void;
  onOpenLabPortal?: () => void;
  onOpenSecretaryPortal?: () => void;
  onOpenPharmacyPortal?: () => void;
  onOpenWholesalerPortal?: () => void;
  onOpenDirectory?: () => void;
}

const STATUS_STYLE: Record<
  RequestStatus,
  { badge: string; icon: typeof CheckCircle2 }
> = {
  Draft: {
    badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: FileEdit,
  },
  Submitted: {
    badge: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-200',
    icon: Clock,
  },
  'Under Review': {
    badge: 'border-[#d9a43b]/50 bg-[#d9a43b]/15 text-[#8c5d0b] dark:text-[#f4d378]',
    icon: Clock,
  },
  Approved: {
    badge: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-200',
    icon: CheckCircle2,
  },
  Rejected: {
    badge: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-950/50 dark:text-rose-200',
    icon: XCircle,
  },
  'Requires Changes': {
    badge: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200',
    icon: AlertTriangle,
  },
};

export function RequestStatusView({
  justSubmittedRequest,
  highlightedPortal,
  onSelectAnotherPortal,
  onEditResubmitPortal,
  onOpenDoctorPortal,
  onOpenPatientPortal,
  onOpenLabPortal,
  onOpenSecretaryPortal,
  onOpenPharmacyPortal,
  onOpenWholesalerPortal,
  onOpenDirectory,
}: RequestStatusViewProps) {
  const { language, t, requests } = useMedora();

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar onBackToPortals={onSelectAnotherPortal} />

      <main className="relative z-10 mx-auto my-8 w-full max-w-4xl space-y-6">
        {justSubmittedRequest && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-6 shadow-md dark:border-emerald-700/50 dark:bg-emerald-950/40">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <div>
                <h2 className="text-lg font-bold text-emerald-950 dark:text-emerald-100">
                  {t.statusView.successTitle}
                </h2>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                  {t.statusView.successSubtitle}
                </p>
                <p className="mt-2 font-latin text-sm font-bold text-emerald-900 tabular-nums dark:text-emerald-100" dir="ltr">
                  {t.statusView.requestNumber}: {justSubmittedRequest.requestNumber}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur-xl dark:border-[#d9a43b]/20 dark:bg-[#07122a]/90 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t.statusView.title}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t.statusView.subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onSelectAnotherPortal}
              className="medora-gold-button inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-[#040917] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              <span>{t.statusView.chooseAnotherPortal}</span>
            </button>
          </div>

          {requests.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.statusView.noRequests}
              </p>
              <button
                type="button"
                onClick={onSelectAnotherPortal}
                className="medora-gold-button mt-5 min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-bold text-[#040917] cursor-pointer"
              >
                {t.statusView.startPortalSelection}
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {requests.map((req) => {
                const style = STATUS_STYLE[req.status];
                const StatusIcon = style.icon;
                const isHighlighted = highlightedPortal === req.portalType;
                return (
                  <article
                    key={req.requestId}
                    className={`rounded-xl border p-5 ${
                      isHighlighted
                        ? 'border-[#d9a43b] bg-amber-50/30 ring-1 ring-[#d9a43b]/30 dark:bg-[#081635]'
                        : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-[#040a1a]/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-latin text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400" dir="ltr">
                          {req.requestNumber}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                          {(t.portals.items as Record<string, { title?: string }>)[req.portalType]?.title ??
                            (isImagingPortalIdentifier(String(req.portalType))
                              ? language === 'ar'
                                ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                                : 'Imaging Center — Temporarily Closed (Archive)'
                              : String(req.portalType))}
                        </h3>
                      </div>

                      <div
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${style.badge}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.statusView.statuses[req.status]}</span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {t.statusView.activationRule}:{' '}
                      </span>
                      {t.statusView.activationRules[req.activationRule]}
                    </p>

                    {!CLIENT_IMAGING_PORTAL_ENABLED &&
                      isImagingPortalIdentifier(String(req.portalType)) && (
                        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-xs font-bold text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]">
                          {IMAGING_PORTAL_DISABLED_MESSAGE_AR}
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'doctor' &&
                      onOpenDoctorPortal && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={onOpenDoctorPortal}
                            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <span>
                              {language === 'ar'
                                ? 'دخول بوابة الطبيب — MEDORA DOCTOR'
                                : 'Enter MEDORA DOCTOR Workspace'}
                            </span>
                          </button>
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'secretary' &&
                      onOpenSecretaryPortal && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={onOpenSecretaryPortal}
                            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <span>
                              {language === 'ar'
                                ? 'دخول بوابة السكرتير — MEDORA SECRETARY'
                                : 'Enter MEDORA SECRETARY Portal'}
                            </span>
                          </button>
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'lab' &&
                      onOpenLabPortal && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={onOpenLabPortal}
                            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <span>
                              {language === 'ar'
                                ? 'دخول بوابة المختبر — MEDORA LAB'
                                : 'Enter MEDORA LAB Portal'}
                            </span>
                          </button>
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'pharmacy' &&
                      onOpenPharmacyPortal && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={onOpenPharmacyPortal}
                            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <span>
                              {language === 'ar'
                                ? 'دخول بوابة الصيدلية — MEDORA PHARMACY'
                                : 'Enter MEDORA PHARMACY Portal'}
                            </span>
                          </button>
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'wholesaler' &&
                      onOpenWholesalerPortal && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={onOpenWholesalerPortal}
                            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <span>
                              {language === 'ar'
                                ? 'دخول بوابة المذخر — MEDORA WHOLESALER'
                                : 'Enter MEDORA WHOLESALER Portal'}
                            </span>
                          </button>
                        </div>
                      )}

                    {req.status === 'Approved' &&
                      req.portalType === 'patient' &&
                      (onOpenPatientPortal || onOpenDirectory) && (
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          {onOpenPatientPortal && (
                            <button
                              type="button"
                              onClick={onOpenPatientPortal}
                              className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                            >
                              <span>
                                {language === 'ar'
                                  ? 'دخول بوابة المريض — MEDORA PATIENT'
                                  : 'Enter MEDORA PATIENT Portal'}
                              </span>
                            </button>
                          )}
                          {onOpenDirectory && (
                            <button
                              type="button"
                              onClick={onOpenDirectory}
                              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#0c3585] px-5 py-2 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                            >
                              <span>
                                {language === 'ar'
                                  ? 'تصفح دليل الأطباء وحجز موعد'
                                  : 'Browse Approved Physicians Directory'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                    {(req.status === 'Rejected' ||
                      req.status === 'Requires Changes') && (
                      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
                        {req.reviewReason && (
                          <p>
                            <strong>{t.statusView.reasonLabel}:</strong>{' '}
                            {req.reviewReason}
                          </p>
                        )}
                        {req.reviewInstructions && (
                          <p className="mt-1">
                            <strong>{t.statusView.instructionsLabel}:</strong>{' '}
                            {req.reviewInstructions}
                          </p>
                        )}
                        {req.status === 'Requires Changes' && String(req.portalType) !== 'imaging' && (
                          <button
                            type="button"
                            onClick={() => onEditResubmitPortal(req.portalType)}
                            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#0c3585] px-4 py-2 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                          >
                            <FileEdit className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.statusView.editAndResubmit}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </motion.section>
  );
}

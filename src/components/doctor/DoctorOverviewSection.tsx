import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  FlaskConical,
  Lock,
  MessageSquare,
  Stethoscope,
  UserPlus,
  Users,
} from 'lucide-react';
import { CLIENT_IMAGING_PORTAL_ENABLED } from '../../config/featureFlags';
import { useMedora } from '../../contexts/MedoraContext';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import type {
  DoctorSectionId,
  DoctorWorkspaceData,
} from '../../types/doctor';
import type { Language } from '../../types/medora';
import type { MedoraAdRecord } from '../../types/patient';
import { MedoraTargetedAdShowcase } from '../shared/MedoraTargetedAdShowcase';

interface DoctorOverviewSectionProps {
  workspace: DoctorWorkspaceData;
  language: Language;
  onNavigate: (section: DoctorSectionId) => void;
  onOpenAddVisit?: () => void;
}

export function DoctorOverviewSection({
  workspace,
  language,
  onNavigate,
  onOpenAddVisit,
}: DoctorOverviewSectionProps) {
  const { firebaseUser } = useMedora();
  const dc = DOCTOR_TRANSLATIONS[language];
  const oc = dc.overview;
  const profile = workspace.doctorProfile;

  const handleAdAction = (ad: MedoraAdRecord) => {
    const validSections: string[] = [
      'overview',
      'appointments',
      'patients',
      'prescriptions',
      'diagnostics',
      'messages',
      'clinic_staff',
      'reports',
      'settings',
    ];
    if (ad.actionType === 'open_portal_tab' && ad.destinationTarget && validSections.includes(ad.destinationTarget)) {
      onNavigate(ad.destinationTarget as DoctorSectionId);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const todayAppointments = workspace.appointments.filter(
    (a) => a.date === todayIso && a.status !== 'cancelled' && a.status !== 'rejected',
  );
  const waitingAppointments = workspace.appointments.filter(
    (a) =>
      a.isWaitlist ||
      a.status === 'checked_in' ||
      (a.date === todayIso && a.status === 'confirmed'),
  );
  const unreadMessagesCount = workspace.conversations.reduce(
    (sum, c) => sum + (c.unreadByDoctor || 0),
    0,
  );
  const receivedDiagnostics = workspace.diagnostics.filter(
    (d) => d.status === 'results_received' || d.status === 'reviewed',
  );

  const upcomingList = workspace.appointments
    .filter(
      (a) =>
        a.date >= todayIso &&
        (a.status === 'pending' ||
          a.status === 'confirmed' ||
          a.status === 'checked_in'),
    )
    .slice(0, 6);

  const pendingConfirmations = workspace.appointments.filter(
    (a) => a.status === 'pending',
  ).length;
  const pendingStaffCount = workspace.staffMembers.filter(
    (s) => s.status === 'pending_approval',
  ).length;

  const alerts: Array<{
    id: string;
    label: string;
    section: DoctorSectionId;
    tone: 'amber' | 'sky' | 'gold';
  }> = [];

  if (pendingConfirmations > 0) {
    alerts.push({
      id: 'pending-bookings',
      label: `${pendingConfirmations} ${oc.pendingConfirmationsAlert}`,
      section: 'appointments',
      tone: 'amber',
    });
  }
  if (unreadMessagesCount > 0) {
    alerts.push({
      id: 'unread-msgs',
      label: `${unreadMessagesCount} ${oc.unreadMessagesAlert}`,
      section: 'messages',
      tone: 'sky',
    });
  }
  if (pendingStaffCount > 0 && workspace.actorRole === 'doctor') {
    alerts.push({
      id: 'pending-staff',
      label: `${pendingStaffCount} ${oc.pendingStaffAlert}`,
      section: 'clinic_staff',
      tone: 'gold',
    });
  }

  return (
    <div className="space-y-6">
      {/* Doctor Hero Identity Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                referrerPolicy="no-referrer"
                className="h-16 w-16 shrink-0 rounded-2xl border border-[#d9a43b]/50 object-cover sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#d9a43b]/40 bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378] sm:h-20 sm:w-20">
                <Stethoscope className="h-8 w-8" aria-hidden="true" />
              </div>
            )}

            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                {oc.welcomePrefix} {profile.fullName}
              </h2>
              <p className="mt-0.5 text-sm font-semibold text-[#0c3585] dark:text-[#f4d378]">
                {profile.specialty}
                {profile.subSpecialty ? ` · ${profile.subSpecialty}` : ''}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{oc.clinicLabel}:</span>{' '}
                {profile.clinicName} · {profile.governorate} ({profile.district})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-emerald-300/70 bg-emerald-50/70 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="me-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              {oc.accountStatusLabel}: {profile.status}
            </div>
          </div>
        </div>
      </section>

      <MedoraTargetedAdShowcase
        portal="doctor"
        language={language}
        firebaseUser={firebaseUser}
        compact
        onAdAction={handleAdAction}
      />

      {/* 4 Primary Clinical KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('appointments')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition-colors hover:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {oc.todayBookings}
            </span>
            <CalendarClock className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {todayAppointments.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('appointments')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition-colors hover:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {oc.waitingPatients}
            </span>
            <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {waitingAppointments.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('messages')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition-colors hover:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {oc.unreadMessages}
            </span>
            <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {unreadMessagesCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('diagnostics')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition-colors hover:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b] cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {oc.recentResults}
            </span>
            <FlaskConical className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {receivedDiagnostics.length}
          </p>
        </button>
      </section>

      {/* Quick Action Shortcuts */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {oc.quickShortcuts}
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigate('patients')}
            className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-[#d9a43b] cursor-pointer"
          >
            <UserPlus className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
            <span>{oc.addPatientShortcut}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('prescriptions')}
            className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-[#d9a43b] cursor-pointer"
          >
            <FileText className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
            <span>{oc.newRxShortcut}</span>
          </button>

          {workspace.actorRole === 'doctor' && (
            <button
              type="button"
              onClick={() => {
                if (onOpenAddVisit) {
                  onOpenAddVisit();
                } else {
                  onNavigate('patients');
                }
              }}
              className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-[#d9a43b]/60 bg-amber-50/60 px-4 py-2.5 text-sm font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-[#d9a43b]/40 dark:bg-amber-950/20 dark:text-[#f4d378] cursor-pointer"
            >
              <ClipboardPlus className="h-4 w-4 text-[#b68023] dark:text-[#f4d378]" aria-hidden="true" />
              <span>{dc.patients.addVisitTopBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('diagnostics')}
            className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-[#d9a43b] cursor-pointer"
          >
            <FlaskConical className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
            <span>
              {CLIENT_IMAGING_PORTAL_ENABLED ? oc.newOrderShortcut : oc.newLabOrderShortcut}
            </span>
          </button>

          {!CLIENT_IMAGING_PORTAL_ENABLED && (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex min-h-[46px] cursor-not-allowed items-center gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-2.5 text-sm font-bold text-amber-900 opacity-80 dark:border-[#d9a43b]/35 dark:bg-amber-950/30 dark:text-[#f4d378]"
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{oc.newImagingOrderClosedShortcut}</span>
            </button>
          )}
        </div>
      </section>

      {/* Main Split: Upcoming Appointments & Latest Diagnostics / Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {oc.upcomingTitle}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              {dc.nav.appointments}
            </button>
          </div>

          {upcomingList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {oc.noUpcoming}
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingList.map((appt) => (
                <div
                  key={appt.appointmentId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {appt.patientName}
                    </p>
                    <p className="font-latin text-xs text-slate-500 tabular-nums dark:text-slate-400" dir="ltr">
                      {appt.date} · {appt.time} · {appt.patientPhone}
                    </p>
                  </div>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {dc.appointmentStatuses[appt.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6 lg:col-span-5">
          {alerts.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {oc.alertsTitle}
              </h3>
              <div className="mt-3 space-y-2.5">
                {alerts.map((al) => (
                  <button
                    key={al.id}
                    type="button"
                    onClick={() => onNavigate(al.section)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 text-start text-xs font-semibold text-amber-950 hover:border-amber-400 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200 cursor-pointer"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{al.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {oc.latestDiagnosticsTitle}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('diagnostics')}
                className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                {dc.nav.diagnostics}
              </button>
            </div>
            {receivedDiagnostics.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                {oc.noDiagnostics}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {receivedDiagnostics.slice(0, 4).map((diag) => (
                  <div
                    key={diag.orderId}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <p className="font-bold text-slate-900 dark:text-white">
                      {diag.patientName} — {diag.requestedTests.join(', ')}
                    </p>
                    {diag.resultSummary && (
                      <p className="mt-1 line-clamp-2 text-slate-600 dark:text-slate-300">
                        {diag.resultSummary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

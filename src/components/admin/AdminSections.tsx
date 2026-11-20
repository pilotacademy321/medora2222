import { useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  Lock,
  Mail,
  Plus,
  Printer,
  Search,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { MedoraCopy } from '../../i18n/translations';
import type {
  AdminMessageRecord,
  AdminMessageStatus,
  AdminRoleRecord,
  AuditLogRecord,
  InstitutionRecord,
  Language,
  PortalType,
  RegistrationRequest,
  RequestStatus,
  SuperAdminServerStatus,
  UserAccount,
} from '../../types/medora';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import { AdminExecutiveReportPrintSheet } from '../shared/MedoraPrintableDocument';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  isImagingPortalIdentifier,
} from '../../config/featureFlags';
import { formatIsoDate } from './AdminModals';

export type AdminSectionId =
  | 'overview'
  | 'messages'
  | 'network_messaging'
  | 'notifications_center'
  | 'commerce_receipts'
  | 'institutions'
  | 'labs'
  | 'pharmacies'
  | 'wholesalers'
  | 'haneen_admin'
  | 'requests'
  | 'ads'
  | 'reviews'
  | 'feedback'
  | 'users'
  | 'permissions'
  | 'audit_logs'
  | 'settings';

function StatusDotText({
  tone,
  label,
}: {
  tone: 'amber' | 'emerald' | 'rose' | 'blue' | 'slate';
  label: string;
}) {
  const palette: Record<typeof tone, string> = {
    amber:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800/60',
    emerald:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800/60',
    rose: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800/60',
    blue: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800/60',
    slate:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${palette[tone]}`}
    >
      {label}
    </span>
  );
}

function requestTone(
  status: RequestStatus,
): 'amber' | 'emerald' | 'rose' | 'blue' | 'slate' {
  if (status === 'Approved') return 'emerald';
  if (status === 'Rejected') return 'rose';
  if (status === 'Under Review' || status === 'Submitted') return 'amber';
  if (status === 'Requires Changes') return 'blue';
  return 'slate';
}

function instTone(
  status: InstitutionRecord['status'],
): 'amber' | 'emerald' | 'rose' | 'slate' {
  if (status === 'active') return 'emerald';
  if (status === 'pending_approval') return 'amber';
  if (status === 'suspended' || status === 'rejected') return 'rose';
  return 'slate';
}

function subTone(
  sub?: InstitutionRecord['subscriptionStatus'],
): 'amber' | 'emerald' | 'rose' | 'blue' | 'slate' {
  if (sub === 'active') return 'emerald';
  if (sub === 'trial') return 'blue';
  if (sub === 'expired') return 'rose';
  return 'slate';
}

function msgTone(
  status: AdminMessageStatus,
): 'amber' | 'emerald' | 'blue' | 'slate' {
  if (status === 'new') return 'amber';
  if (status === 'replied') return 'emerald';
  if (status === 'read') return 'blue';
  return 'slate';
}

export function AdminOverviewSection({
  t,
  language,
  messages,
  institutions,
  requests,
  totalUsers = 0,
  totalAds = 0,
  publishedAds = 0,
  pendingReviews = 0,
  openFeedback = 0,
  onNavigate,
  onSelectMessage,
  onSelectInstitution,
  onComposeMessage,
}: {
  t: MedoraCopy;
  language: Language;
  messages: AdminMessageRecord[];
  institutions: InstitutionRecord[];
  requests: RegistrationRequest[];
  totalUsers?: number;
  totalAds?: number;
  publishedAds?: number;
  pendingReviews?: number;
  openFeedback?: number;
  onNavigate: (section: AdminSectionId) => void;
  onSelectMessage: (msg: AdminMessageRecord) => void;
  onSelectInstitution: (inst: InstitutionRecord) => void;
  onComposeMessage: () => void;
}) {
  const [exportingPdf, setExportingPdf] = useState(false);

  const unreadMessages = messages.filter(
    (m) => !m.isRead || m.status === 'new',
  ).length;
  const activeInstitutions = institutions.filter(
    (i) => i.status === 'active',
  ).length;
  const pendingInstitutions = institutions.filter(
    (i) => i.status === 'pending_approval',
  ).length;
  const activeSubscriptions = institutions.filter(
    (i) => i.subscriptionStatus === 'active',
  ).length;
  const expiredSubscriptions = institutions.filter(
    (i) => i.subscriptionStatus === 'expired',
  ).length;
  const pendingRequests = requests.filter(
    (r) => r.status === 'Submitted' || r.status === 'Under Review',
  ).length;

  const executiveMetrics = {
    totalInstitutions: institutions.length,
    activeInstitutions,
    pendingInstitutions,
    activeSubscriptions,
    totalRequests: requests.length,
    pendingRequests,
    totalUsers,
    totalMessages: messages.length,
    unreadMessages,
    totalAds,
    publishedAds,
    pendingReviews,
    openFeedback,
  };

  const handleDownloadExecutivePdf = async () => {
    setExportingPdf(true);
    try {
      await downloadMedoraPdf({
        filename: sanitizePdfFilename(
          `medora-executive-report-${new Date().toISOString().slice(0, 10)}`,
        ),
        element: (
          <AdminExecutiveReportPrintSheet
            lang={language}
            metrics={executiveMetrics}
          />
        ),
        dir: language === 'ar' ? 'rtl' : 'ltr',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            void printMedoraDocument(
              <AdminExecutiveReportPrintSheet
                lang={language}
                metrics={executiveMetrics}
              />,
              t.admin.overview.printReportBtn,
            )
          }
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t.admin.overview.printReportBtn}</span>
        </button>
        <button
          type="button"
          disabled={exportingPdf}
          onClick={() => void handleDownloadExecutivePdf()}
          className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {exportingPdf
              ? t.admin.overview.exportingPdf
              : t.admin.overview.downloadReportPdfBtn}
          </span>
        </button>
      </div>

      {/* Side-by-Side Primary Executive Panels */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Panel 1: Admin Messages */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#f4d378]/10 dark:text-[#f4d378]">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.admin.overview.messagesPanelTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.admin.sectionDescriptions.messages}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onComposeMessage}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#d9a43b]/50 bg-[#d9a43b]/10 px-3 py-1.5 text-xs font-semibold text-[#9a6b16] hover:bg-[#d9a43b]/20 dark:text-[#f4d378] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.admin.messages.composeBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('messages')}
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t.admin.overview.viewAll}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.admin.overview.totalMessages}
              </p>
              <p className="mt-1 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {messages.length}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {t.admin.overview.unreadMessages}
              </p>
              <p className="mt-1 font-latin text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                {unreadMessages}
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1 divide-y divide-slate-200 dark:divide-slate-800">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t.admin.emptyList}
              </p>
            ) : (
              messages.slice(0, 6).map((msg) => (
                <button
                  key={msg.messageId}
                  type="button"
                  onClick={() => onSelectMessage(msg)}
                  className="flex w-full items-start justify-between gap-3 py-3 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 px-2 rounded-lg cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!msg.isRead && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                          aria-hidden="true"
                        />
                      )}
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {msg.subject}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {msg.senderName} · {formatIsoDate(msg.createdAt, language)}
                    </p>
                  </div>
                  <StatusDotText
                    tone={msgTone(msg.status)}
                    label={t.admin.messages.statuses[msg.status]}
                  />
                </button>
              ))
            )}
          </div>
        </section>

        {/* Panel 2: Subscriptions & Institutions */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#f4d378]/10 dark:text-[#f4d378]">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.admin.overview.institutionsPanelTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.admin.sectionDescriptions.institutions}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('institutions')}
              className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t.admin.overview.viewAll}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.admin.overview.totalInstitutions}
              </p>
              <p className="mt-1 font-latin text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {institutions.length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <p className="text-[11px] text-emerald-800 dark:text-emerald-200">
                {t.admin.overview.activeInstitutions}
              </p>
              <p className="mt-1 font-latin text-xl font-bold tabular-nums text-emerald-900 dark:text-emerald-100">
                {activeInstitutions}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <p className="text-[11px] text-amber-800 dark:text-amber-200">
                {t.admin.overview.pendingInstitutions}
              </p>
              <p className="mt-1 font-latin text-xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                {pendingInstitutions}
              </p>
            </div>
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
              <p className="text-[11px] text-blue-800 dark:text-blue-200">
                {t.admin.overview.activeSubscriptions}
              </p>
              <p className="mt-1 font-latin text-xl font-bold tabular-nums text-blue-900 dark:text-blue-100">
                {activeSubscriptions}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200/70 bg-rose-50/50 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="text-[11px] text-rose-800 dark:text-rose-200">
                {t.admin.overview.expiredSubscriptions}
              </p>
              <p className="mt-1 font-latin text-xl font-bold tabular-nums text-rose-900 dark:text-rose-100">
                {expiredSubscriptions}
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1 divide-y divide-slate-200 dark:divide-slate-800">
            {institutions.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t.admin.emptyList}
              </p>
            ) : (
              institutions.slice(0, 6).map((inst) => (
                <button
                  key={inst.institutionId}
                  type="button"
                  onClick={() => onSelectInstitution(inst)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 px-2 rounded-lg cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {inst.nameAr}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {!CLIENT_IMAGING_PORTAL_ENABLED &&
                      isImagingPortalIdentifier(String(inst.type))
                        ? language === 'ar'
                          ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                          : 'Imaging Center — Temporarily Closed (Archive)'
                        : (t.admin.institutions.types as Record<string, string>)[
                            inst.type
                          ] ?? inst.type}{' '}
                      · {inst.governorate}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusDotText
                      tone={instTone(inst.status)}
                      label={t.admin.institutions.statuses[inst.status]}
                    />
                    <StatusDotText
                      tone={subTone(inst.subscriptionStatus)}
                      label={
                        t.admin.institutions.subscriptions[
                          inst.subscriptionStatus || 'none'
                        ]
                      }
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Quick Action Bar for Incoming Registration Requests */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#d9a43b]/35 bg-white px-6 py-4 shadow-sm dark:bg-[#07122a]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d9a43b]/15 text-[#9a6b16] dark:text-[#f4d378]">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {t.admin.overview.pendingRequestsCount}:{' '}
              <span className="font-latin text-base tabular-nums text-[#b68023] dark:text-[#f4d378]">
                {pendingRequests}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.admin.requests.autoApprovalBlockedNote}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('requests')}
          className="medora-gold-button min-h-[40px] rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
        >
          {t.admin.nav.requests}
        </button>
      </div>
    </div>
  );
}

export function AdminMessagesSection({
  t,
  language,
  messages,
  onSelectMessage,
  onComposeMessage,
}: {
  t: MedoraCopy;
  language: Language;
  messages: AdminMessageRecord[];
  onSelectMessage: (msg: AdminMessageRecord) => void;
  onComposeMessage: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | AdminMessageStatus>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q) ||
        m.senderEmail.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q)
      );
    });
  }, [messages, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'new', 'read', 'replied', 'archived'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                statusFilter === st
                  ? 'border-[#0c3585] bg-[#0c3585] text-white'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {st === 'all' ? t.admin.allFilter : t.admin.messages.statuses[st]}
            </button>
          ))}

          <button
            type="button"
            onClick={onComposeMessage}
            className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.admin.messages.composeBtn}</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {messages.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((msg) => (
              <button
                key={msg.messageId}
                type="button"
                onClick={() => onSelectMessage(msg)}
                className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-4 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#b68023] dark:text-[#f4d378]">
                      {t.admin.messages.categories[msg.category]}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {msg.senderName}
                    </span>
                    {!msg.isRead && (
                      <StatusDotText
                        tone="amber"
                        label={t.admin.messages.unreadBadge}
                      />
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {msg.subject}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">
                    {msg.body}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusDotText
                    tone={msgTone(msg.status)}
                    label={t.admin.messages.statuses[msg.status]}
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatIsoDate(msg.createdAt, language)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminInstitutionsSection({
  t,
  institutions,
  onSelectInstitution,
}: {
  t: MedoraCopy;
  institutions: InstitutionRecord[];
  onSelectInstitution: (inst: InstitutionRecord) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<'all' | InstitutionRecord['type']>(
    'all',
  );
  const [statusFilter, setStatusFilter] = useState<
    'all' | InstitutionRecord['status']
  >('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return institutions.filter((inst) => {
      if (typeFilter !== 'all' && inst.type !== typeFilter) return false;
      if (statusFilter !== 'all' && inst.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inst.nameAr.toLowerCase().includes(q) ||
        (inst.nameEn || '').toLowerCase().includes(q) ||
        inst.licenseNumber.toLowerCase().includes(q) ||
        inst.governorate.toLowerCase().includes(q)
      );
    });
  }, [institutions, typeFilter, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        {t.admin.paymentGatewayNote}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | InstitutionRecord['type'])
            }
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">{t.admin.allFilter}</option>
            <option value="clinic">{t.admin.institutions.types.clinic}</option>
            <option value="lab">{t.admin.institutions.types.lab}</option>
            <option value="pharmacy">{t.admin.institutions.types.pharmacy}</option>
            <option value="wholesaler">{t.admin.institutions.types.wholesaler}</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'all' | InstitutionRecord['status'],
              )
            }
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">{t.admin.allFilter}</option>
            <option value="pending_approval">
              {t.admin.institutions.statuses.pending_approval}
            </option>
            <option value="active">{t.admin.institutions.statuses.active}</option>
            <option value="suspended">
              {t.admin.institutions.statuses.suspended}
            </option>
            <option value="rejected">
              {t.admin.institutions.statuses.rejected}
            </option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {institutions.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.name}</th>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.type}</th>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.location}</th>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.licenseNumber}</th>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.approvalStatus}</th>
                  <th className="px-4 py-3 text-start">{t.admin.institutions.subscriptionState}</th>
                  <th className="px-4 py-3 text-end" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((inst) => (
                  <tr
                    key={inst.institutionId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                  >
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                      <div>{inst.nameAr}</div>
                      {inst.nameEn && (
                        <div className="font-latin text-[11px] font-normal text-slate-500">
                          {inst.nameEn}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {!CLIENT_IMAGING_PORTAL_ENABLED &&
                      isImagingPortalIdentifier(String(inst.type))
                        ? t.admin.institutions.types.imagingClosed
                        : (t.admin.institutions.types as Record<string, string>)[
                            inst.type
                          ] ?? inst.type}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      {inst.governorate} · {inst.district}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs" dir="ltr">
                      {inst.licenseNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusDotText
                        tone={instTone(inst.status)}
                        label={t.admin.institutions.statuses[inst.status]}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusDotText
                        tone={subTone(inst.subscriptionStatus)}
                        label={
                          t.admin.institutions.subscriptions[
                            inst.subscriptionStatus || 'none'
                          ]
                        }
                      />
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectInstitution(inst)}
                        className="min-h-[34px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        {t.admin.institutions.manageBtn}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminRequestsSection({
  t,
  language,
  requests,
  onSelectRequest,
}: {
  t: MedoraCopy;
  language: Language;
  requests: RegistrationRequest[];
  onSelectRequest: (req: RegistrationRequest) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [portalFilter, setPortalFilter] = useState<'all' | PortalType>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (portalFilter !== 'all' && r.portalType !== portalFilter) return false;
      if (!q) return true;
      return (
        r.requestNumber.toLowerCase().includes(q) ||
        r.applicantName.toLowerCase().includes(q) ||
        r.applicantEmail.toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, portalFilter, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 px-4 py-3 text-xs font-medium text-slate-800 dark:text-amber-100">
        {t.admin.requests.autoApprovalBlockedNote}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={portalFilter}
            onChange={(e) =>
              setPortalFilter(e.target.value as 'all' | PortalType)
            }
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">{t.admin.allFilter}</option>
            <option value="doctor">{t.portals.items.doctor.title}</option>
            <option value="lab">{t.portals.items.lab.title}</option>
            <option value="pharmacy">{t.portals.items.pharmacy.title}</option>
            <option value="wholesaler">{t.portals.items.wholesaler.title}</option>
            <option value="secretary">{t.portals.items.secretary.title}</option>
            <option value="patient">{t.portals.items.patient.title}</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | RequestStatus)
            }
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">{t.admin.allFilter}</option>
            <option value="Submitted">{t.statusView.statuses.Submitted}</option>
            <option value="Under Review">
              {t.statusView.statuses['Under Review']}
            </option>
            <option value="Approved">{t.statusView.statuses.Approved}</option>
            <option value="Requires Changes">
              {t.statusView.statuses['Requires Changes']}
            </option>
            <option value="Rejected">{t.statusView.statuses.Rejected}</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {requests.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{t.statusView.requestNumber}</th>
                  <th className="px-4 py-3 text-start">{t.admin.requests.applicant}</th>
                  <th className="px-4 py-3 text-start">{t.admin.requests.email}</th>
                  <th className="px-4 py-3 text-start">{t.statusView.portalType}</th>
                  <th className="px-4 py-3 text-start">{t.admin.requests.submittedAt}</th>
                  <th className="px-4 py-3 text-start">{t.statusView.currentStatus}</th>
                  <th className="px-4 py-3 text-end" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((req) => (
                  <tr
                    key={req.requestId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                  >
                    <td className="px-4 py-3.5 font-latin text-xs font-semibold tabular-nums" dir="ltr">
                      {req.requestNumber}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {req.applicantName}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs text-slate-600 dark:text-slate-300" dir="ltr">
                      {req.applicantEmail}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {!CLIENT_IMAGING_PORTAL_ENABLED &&
                      isImagingPortalIdentifier(String(req.portalType))
                        ? language === 'ar'
                          ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                          : 'Imaging Center — Temporarily Closed (Archive)'
                        : (t.portals.items as Record<string, { title?: string }>)[
                            req.portalType
                          ]?.title ?? req.portalType}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatIsoDate(req.submittedAt || req.createdAt, language)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusDotText
                        tone={requestTone(req.status)}
                        label={t.statusView.statuses[req.status]}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectRequest(req)}
                        className="medora-gold-button min-h-[34px] rounded-lg px-3.5 py-1 text-xs font-bold text-[#040917] cursor-pointer whitespace-nowrap"
                      >
                        {t.admin.requests.reviewBtn}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminUsersSection({
  t,
  language,
  users,
}: {
  t: MedoraCopy;
  language: Language;
  users: UserAccount[];
}) {
  const [search, setSearch] = useState('');
  const [portalFilter, setPortalFilter] = useState<'all' | 'none' | PortalType>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (portalFilter !== 'all' && u.selectedPortal !== portalFilter) return false;
      if (!q) return true;
      return (
        (u.fullName || '').toLowerCase().includes(q) ||
        u.googleName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [users, portalFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        <Users className="h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
        <span>{t.admin.users.noMedicalRecordsNote}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <select
          value={portalFilter}
          onChange={(e) =>
            setPortalFilter(e.target.value as 'all' | 'none' | PortalType)
          }
          className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="all">{t.admin.allFilter}</option>
          <option value="patient">{t.portals.items.patient.title}</option>
          <option value="doctor">{t.portals.items.doctor.title}</option>
          <option value="lab">{t.portals.items.lab.title}</option>
          <option value="pharmacy">{t.portals.items.pharmacy.title}</option>
          <option value="wholesaler">{t.portals.items.wholesaler.title}</option>
          <option value="secretary">{t.portals.items.secretary.title}</option>
          <option value="none">none</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {users.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{t.admin.users.name}</th>
                  <th className="px-4 py-3 text-start">{t.admin.users.email}</th>
                  <th className="px-4 py-3 text-start">{t.admin.users.portal}</th>
                  <th className="px-4 py-3 text-start">{t.admin.users.governorate}</th>
                  <th className="px-4 py-3 text-start">{t.admin.users.accountStatus}</th>
                  <th className="px-4 py-3 text-start">{t.admin.users.lastLogin}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((u) => (
                  <tr
                    key={u.uid}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                  >
                    <td className="px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {u.fullName || u.googleName}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs text-slate-600 dark:text-slate-300" dir="ltr">
                      {u.email}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {u.selectedPortal === 'none'
                        ? '—'
                        : ((t.portals.items as Record<string, { title?: string }>)[
                            u.selectedPortal
                          ]?.title ?? u.selectedPortal)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      {u.governorate || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusDotText
                        tone={
                          u.accountStatus === 'active'
                            ? 'emerald'
                            : u.accountStatus === 'restricted' ||
                                u.accountStatus === 'suspended'
                              ? 'rose'
                              : 'amber'
                        }
                        label={t.admin.users.statuses[u.accountStatus]}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatIsoDate(u.lastLoginAt, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminPermissionsSection({
  t,
  language,
  adminRoles,
}: {
  t: MedoraCopy;
  language: Language;
  adminRoles: AdminRoleRecord[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-[#d9a43b]/40 bg-[#d9a43b]/10 p-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#9a6b16] dark:text-[#f4d378]" />
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t.admin.permissions.readOnlyTitle}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {t.admin.permissions.readOnlyBody}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {adminRoles.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t.admin.emptyList}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{t.admin.users.email}</th>
                  <th className="px-4 py-3 text-start">{t.admin.permissions.roleLabel}</th>
                  <th className="px-4 py-3 text-start">{t.admin.permissions.activeLabel}</th>
                  <th className="px-4 py-3 text-start">{t.admin.permissions.grantedByLabel}</th>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.timestamp}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {adminRoles.map((roleDoc) => (
                  <tr key={roleDoc.uid}>
                    <td className="px-4 py-3.5 font-latin text-xs font-semibold text-slate-900 dark:text-white" dir="ltr">
                      {roleDoc.email}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs text-[#b68023] dark:text-[#f4d378]">
                      {roleDoc.role}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusDotText
                        tone={roleDoc.active ? 'emerald' : 'rose'}
                        label={
                          roleDoc.active
                            ? t.admin.permissions.activeBadge
                            : t.admin.permissions.inactiveBadge
                        }
                      />
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs text-slate-600 dark:text-slate-300">
                      {roleDoc.grantedBy || 'server_policy'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatIsoDate(roleDoc.updatedAt || roleDoc.createdAt, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t.admin.permissions.policyMatrixTitle}
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(['patient', 'doctor', 'lab', 'pharmacy', 'wholesaler', 'secretary'] as PortalType[]).map(
            (portal) => (
              <div
                key={portal}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {t.portals.items[portal].title}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {t.portals.items[portal].activationNote}
                </p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminAuditLogsSection({
  t,
  language,
  auditLogs,
}: {
  t: MedoraCopy;
  language: Language;
  auditLogs: AuditLogRecord[];
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        log.targetCollection.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q),
    );
  }, [auditLogs, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.searchPlaceholder}
          className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {auditLogs.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.timestamp}</th>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.action}</th>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.actor}</th>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.target}</th>
                  <th className="px-4 py-3 text-start">{t.admin.auditLogs.details}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((log) => (
                  <tr
                    key={log.logId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                  >
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatIsoDate(log.createdAt, language)}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                      {log.action}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs" dir="ltr">
                      {log.actorEmail}
                    </td>
                    <td className="px-4 py-3.5 font-latin text-xs text-slate-600 dark:text-slate-300" dir="ltr">
                      {log.targetCollection}/{log.targetId}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 dark:text-slate-200">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminSettingsSection({
  t,
  serverStatus,
}: {
  t: MedoraCopy;
  serverStatus: SuperAdminServerStatus;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2.5 border-b border-slate-200 pb-4 dark:border-slate-800">
          <Server className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t.admin.settings.serverVerificationTitle}
          </h3>
        </div>

        <dl className="mt-4 divide-y divide-slate-200 text-xs dark:divide-slate-800">
          <div className="flex items-center justify-between py-3">
            <dt className="text-slate-600 dark:text-slate-300">
              {t.admin.settings.adminSdkLabel}
            </dt>
            <dd>
              <StatusDotText
                tone={
                  serverStatus.serverAdminSdkActive
                    ? 'emerald'
                    : serverStatus.firestoreTransport === 'verified_rules_rest'
                      ? 'amber'
                      : 'rose'
                }
                label={
                  serverStatus.serverAdminSdkActive
                    ? t.admin.settings.configured
                    : serverStatus.serviceAccountStatus
                      ? `${t.admin.settings.missing} (${serverStatus.serviceAccountStatus})`
                      : t.admin.settings.missing
                }
              />
            </dd>
          </div>
          {serverStatus.firestoreTransport && (
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-600 dark:text-slate-300">Transport</dt>
              <dd className="font-latin font-semibold text-slate-900 dark:text-white" dir="ltr">
                {serverStatus.firestoreTransport}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between py-3">
            <dt className="text-slate-600 dark:text-slate-300">
              {t.admin.settings.allowlistLabel}
            </dt>
            <dd>
              <StatusDotText
                tone={serverStatus.hasAllowlist ? 'emerald' : 'rose'}
                label={
                  serverStatus.hasAllowlist
                    ? t.admin.settings.configured
                    : t.admin.settings.missing
                }
              />
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-slate-600 dark:text-slate-300">
              {t.admin.settings.claimsLabel}
            </dt>
            <dd>
              <StatusDotText
                tone={serverStatus.customClaimsActive ? 'emerald' : 'amber'}
                label={
                  serverStatus.customClaimsActive
                    ? t.admin.settings.active
                    : t.admin.settings.missing
                }
              />
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-slate-600 dark:text-slate-300">
              {t.admin.settings.projectLabel}
            </dt>
            <dd className="font-latin font-semibold text-slate-900 dark:text-white" dir="ltr">
              {serverStatus.projectId || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-slate-600 dark:text-slate-300">
              {t.admin.settings.databaseLabel}
            </dt>
            <dd className="font-latin font-semibold text-slate-900 dark:text-white" dir="ltr">
              {serverStatus.firestoreDatabaseId || '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2.5 border-b border-slate-200 pb-4 dark:border-slate-800">
          <ShieldCheck className="h-5 w-5 text-[#b68023] dark:text-[#f4d378]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {t.admin.settings.governanceRulesTitle}
          </h3>
        </div>

        <ul className="mt-4 space-y-3">
          {t.admin.settings.governanceRules.map((rule, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
          <Activity className="h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
          <span>{t.admin.verifiedBadge}</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Mail,
  Send,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { MedoraCopy } from '../../i18n/translations';
import {
  createAdminMessage,
  fetchAdminRequestDetails,
  submitAdminRequestDecision,
  updateAdminInstitution,
  updateAdminMessage,
} from '../../services/medoraFirestore';
import type {
  AdminMessageCategory,
  AdminMessageRecord,
  AdminMessageStatus,
  InstitutionRecord,
  Language,
  RegistrationRequest,
  SubscriptionStatus,
  UploadedDocMeta,
  UserAccount,
} from '../../types/medora';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  IMAGING_PORTAL_DISABLED_MESSAGE_AR,
  isImagingPortalIdentifier,
} from '../../config/featureFlags';

export function formatIsoDate(value: unknown, language: Language): string {
  if (!value) return '—';
  let date: Date | null = null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  } else if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    date = (value as { toDate: () => Date }).toDate();
  }
  if (!date) return '—';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-IQ' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

interface RequestReviewModalProps {
  firebaseUser: User;
  request: RegistrationRequest;
  t: MedoraCopy;
  language: Language;
  onClose: () => void;
  onDecisionApplied: () => Promise<void>;
}

export function RequestReviewModal({
  firebaseUser,
  request,
  t,
  language,
  onClose,
  onDecisionApplied,
}: RequestReviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [institution, setInstitution] = useState<InstitutionRecord | null>(null);
  const [reason, setReason] = useState(request.reviewReason || '');
  const [instructions, setInstructions] = useState(
    request.reviewInstructions || '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    fetchAdminRequestDetails(firebaseUser, request.requestId)
      .then((res) => {
        if (!mounted) return;
        setProfile(res.profile);
        setInstitution(res.institution);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : t.admin.errorLoading);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [firebaseUser, request.requestId, t.admin.errorLoading]);

  const docs: UploadedDocMeta[] = [];
  if (profile) {
    const rawDocs =
      (profile.verificationDocuments as UploadedDocMeta[] | undefined) ||
      (profile.licenseDocuments as UploadedDocMeta[] | undefined) ||
      [];
    if (Array.isArray(rawDocs)) {
      for (const item of rawDocs) {
        if (item && typeof item.url === 'string') {
          docs.push(item);
        }
      }
    }
  }

  const handleDecision = async (
    nextStatus: 'Under Review' | 'Approved' | 'Rejected' | 'Requires Changes',
  ) => {
    setActionError(null);
    if (nextStatus === 'Rejected' && reason.trim().length < 3) {
      setActionError(t.admin.requests.reasonRequiredError);
      return;
    }
    if (
      nextStatus === 'Requires Changes' &&
      instructions.trim().length < 3 &&
      reason.trim().length < 3
    ) {
      setActionError(t.admin.requests.instructionsRequiredError);
      return;
    }

    setSubmitting(true);
    try {
      await submitAdminRequestDecision(firebaseUser, {
        requestId: request.requestId,
        status: nextStatus,
        reason: reason.trim(),
        instructions: instructions.trim(),
      });
      await onDecisionApplied();
      onClose();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t.admin.errorLoading,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isImagingRequestLocked =
    !CLIENT_IMAGING_PORTAL_ENABLED &&
    isImagingPortalIdentifier(String(request.portalType));

  const ignoredProfileKeys = new Set([
    'uid',
    'createdAt',
    'updatedAt',
    'avatarUrl',
    'managerAvatarUrl',
    'verificationDocuments',
    'licenseDocuments',
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <p className="font-latin text-xs font-semibold text-[#b68023] dark:text-[#f4d378]" dir="ltr">
              {request.requestNumber}
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t.admin.requests.detailsTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Request Core Header */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.admin.requests.applicant}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                {request.applicantName}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.admin.requests.email}
              </p>
              <p className="mt-0.5 font-latin text-sm text-slate-800 dark:text-slate-200" dir="ltr">
                {request.applicantEmail}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.statusView.portalType}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
                {!CLIENT_IMAGING_PORTAL_ENABLED &&
                isImagingPortalIdentifier(String(request.portalType))
                  ? language === 'ar'
                    ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                    : 'Imaging Center — Temporarily Closed (Archive)'
                  : (t.portals.items as Record<string, { title?: string }>)[
                      request.portalType
                    ]?.title ?? request.portalType}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.statusView.currentStatus}
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#b68023] dark:text-[#f4d378]">
                {t.statusView.statuses[request.status]}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.admin.requests.submittedAt}
              </p>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                {formatIsoDate(request.submittedAt || request.createdAt, language)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.statusView.activationRule}
              </p>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                {t.statusView.activationRules[request.activationRule]}
              </p>
            </div>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t.admin.requests.loadingDetails}
            </p>
          ) : loadError ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {loadError}
            </div>
          ) : (
            <>
              {/* Profile Details */}
              {profile && (
                <div>
                  <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
                    {t.review.portalSection}
                  </h3>
                  <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-2">
                    {Object.entries(profile)
                      .filter(
                        ([key, val]) =>
                          !ignoredProfileKeys.has(key) &&
                          val !== undefined &&
                          val !== null &&
                          val !== '',
                      )
                      .map(([key, val]) => (
                        <div key={key} className="min-w-0">
                          <p className="font-latin text-[11px] text-slate-500 dark:text-slate-400">
                            {key}
                          </p>
                          <p className="break-words text-xs font-medium text-slate-900 dark:text-slate-100">
                            {Array.isArray(val) ? val.join(' · ') : String(val)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Linked Institution Summary */}
              {institution && (
                <div className="rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Building2 className="h-4 w-4 text-[#b68023] dark:text-[#f4d378]" />
                    <span>{institution.nameAr}</span>
                    {institution.nameEn && (
                      <span className="font-latin text-xs text-slate-500">
                        ({institution.nameEn})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {t.admin.institutions.licenseNumber}:{' '}
                    <span className="font-latin font-semibold" dir="ltr">
                      {institution.licenseNumber}
                    </span>{' '}
                    · {t.admin.institutions.approvalStatus}:{' '}
                    {t.admin.institutions.statuses[institution.status]}
                  </p>
                </div>
              )}

              {/* Attached Documents */}
              <div>
                <h3 className="mb-2.5 text-sm font-bold text-slate-900 dark:text-white">
                  {t.admin.requests.attachedDocs}
                </h3>
                {docs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t.admin.requests.noDocs}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {docs.map((docItem, idx) => (
                      <ProtectedMediaButton
                        key={`${docItem.url}-${idx}`}
                        firebaseUser={firebaseUser}
                        url={docItem.url}
                        fileName={docItem.name}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:border-[#d9a43b] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
                          <span className="truncate">{docItem.name}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-[#0c3585] dark:text-[#f4d378]">
                          {t.admin.requests.openDoc}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                      </ProtectedMediaButton>
                    ))}
                  </div>
                )}
              </div>

              {/* Decision Controls */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t.admin.requests.decisionTitle}
                </h3>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.admin.requests.rejectionReasonLabel}
                    </label>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t.admin.requests.rejectionReasonPlaceholder}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.admin.requests.instructionsLabel}
                    </label>
                    <textarea
                      rows={3}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder={t.admin.requests.instructionsPlaceholder}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                {actionError && (
                  <div
                    role="alert"
                    className="mt-3 flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                {isImagingRequestLocked && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/40 dark:text-[#f4d378]">
                    {IMAGING_PORTAL_DISABLED_MESSAGE_AR}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={submitting || isImagingRequestLocked}
                    onClick={() => void handleDecision('Under Review')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:border-[#0c3585] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>{t.admin.requests.startReviewBtn}</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting || isImagingRequestLocked}
                    onClick={() => void handleDecision('Approved')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{t.admin.requests.approveBtn}</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('Requires Changes')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{t.admin.requests.requiresChangesBtn}</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision('Rejected')}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>{t.admin.requests.rejectBtn}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface InstitutionDetailModalProps {
  firebaseUser: User;
  institution: InstitutionRecord;
  t: MedoraCopy;
  language: Language;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function InstitutionDetailModal({
  firebaseUser,
  institution,
  t,
  language,
  onClose,
  onUpdated,
}: InstitutionDetailModalProps) {
  const [status, setStatus] = useState<InstitutionRecord['status']>(
    institution.status,
  );
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus>(institution.subscriptionStatus || 'none');
  const [subscriptionPlan, setSubscriptionPlan] = useState(
    institution.subscriptionPlan || '',
  );
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(
    institution.subscriptionExpiresAt || '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateAdminInstitution(firebaseUser, {
        institutionId: institution.institutionId,
        status,
        subscriptionStatus,
        subscriptionPlan: subscriptionPlan.trim(),
        subscriptionExpiresAt: subscriptionExpiresAt.trim(),
      });
      await onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <span className="font-latin text-xs font-semibold text-[#b68023] dark:text-[#f4d378]" dir="ltr">
              {institution.institutionId}
            </span>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {institution.nameAr}
            </h2>
            {institution.nameEn && (
              <p className="font-latin text-xs text-slate-500">{institution.nameEn}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50">
            <div>
              <p className="text-slate-500">{t.admin.institutions.type}</p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {!CLIENT_IMAGING_PORTAL_ENABLED &&
                isImagingPortalIdentifier(String(institution.type))
                  ? language === 'ar'
                    ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                    : 'Imaging Center — Temporarily Closed (Archive)'
                  : (t.admin.institutions.types as Record<string, string>)[
                      institution.type
                    ] ?? institution.type}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.institutions.licenseNumber}</p>
              <p className="mt-0.5 font-latin font-semibold text-slate-900 dark:text-white" dir="ltr">
                {institution.licenseNumber}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.institutions.location}</p>
              <p className="mt-0.5 text-slate-800 dark:text-slate-200">
                {institution.governorate} · {institution.district}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.requests.submittedAt}</p>
              <p className="mt-0.5 text-slate-800 dark:text-slate-200">
                {formatIsoDate(institution.createdAt, language)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!CLIENT_IMAGING_PORTAL_ENABLED &&
              isImagingPortalIdentifier(String(institution.type)) && (
                <div className="sm:col-span-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/40 dark:text-[#f4d378]">
                  {IMAGING_PORTAL_DISABLED_MESSAGE_AR}
                </div>
              )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.admin.institutions.approvalStatus}
              </label>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as InstitutionRecord['status'])
                }
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="pending_approval">
                  {t.admin.institutions.statuses.pending_approval}
                </option>
                <option
                  value="active"
                  disabled={
                    !CLIENT_IMAGING_PORTAL_ENABLED &&
                    isImagingPortalIdentifier(String(institution.type))
                  }
                >
                  {t.admin.institutions.statuses.active}
                </option>
                <option value="suspended">
                  {t.admin.institutions.statuses.suspended}
                </option>
                <option value="rejected">
                  {t.admin.institutions.statuses.rejected}
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.admin.institutions.subscriptionState}
              </label>
              <select
                value={subscriptionStatus}
                onChange={(e) =>
                  setSubscriptionStatus(e.target.value as SubscriptionStatus)
                }
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="none">{t.admin.institutions.subscriptions.none}</option>
                <option value="trial">
                  {t.admin.institutions.subscriptions.trial}
                </option>
                <option value="active">
                  {t.admin.institutions.subscriptions.active}
                </option>
                <option value="expired">
                  {t.admin.institutions.subscriptions.expired}
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.admin.institutions.planName}
              </label>
              <input
                type="text"
                value={subscriptionPlan}
                onChange={(e) => setSubscriptionPlan(e.target.value)}
                placeholder="Standard / Institutional"
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t.admin.institutions.expiresAt}
              </label>
              <input
                type="date"
                value={subscriptionExpiresAt}
                onChange={(e) => setSubscriptionExpiresAt(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            {t.admin.paymentGatewayNote}
          </p>

          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="medora-gold-button min-h-[42px] rounded-xl px-5 py-2 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {saving ? t.admin.institutions.saving : t.admin.institutions.saveChanges}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageDetailModalProps {
  firebaseUser: User;
  message: AdminMessageRecord;
  t: MedoraCopy;
  language: Language;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function MessageDetailModal({
  firebaseUser,
  message,
  t,
  language,
  onClose,
  onUpdated,
}: MessageDetailModalProps) {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!message.isRead) {
      updateAdminMessage(firebaseUser, {
        messageId: message.messageId,
        status: message.status === 'new' ? 'read' : message.status,
        isRead: true,
      })
        .then(() => onUpdated())
        .catch(() => {});
    }
  }, [firebaseUser, message.isRead, message.messageId, message.status, onUpdated]);

  const setStatus = async (status: AdminMessageStatus, isRead: boolean) => {
    setUpdating(true);
    try {
      await updateAdminMessage(firebaseUser, {
        messageId: message.messageId,
        status,
        isRead,
      });
      await onUpdated();
      onClose();
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#f4d378]/10 dark:text-[#f4d378]">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-[#b68023] dark:text-[#f4d378]">
                {t.admin.messages.categories[message.category]}
              </span>
              <h2 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                {message.subject}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t.admin.messages.sender}: <strong className="text-slate-900 dark:text-white">{message.senderName}</strong>{' '}
              (<span className="font-latin" dir="ltr">{message.senderEmail}</span>)
            </span>
            <span>{formatIsoDate(message.createdAt, language)}</span>
          </div>

          <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
            {message.body}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <span className="text-xs font-semibold text-[#b68023] dark:text-[#f4d378]">
              {t.admin.messages.status}: {t.admin.messages.statuses[message.status]}
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={updating}
                onClick={() => void setStatus('read', true)}
                className="min-h-[38px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t.admin.messages.markRead}
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => void setStatus('replied', true)}
                className="min-h-[38px] rounded-xl bg-[#0c3585] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0e41a3] cursor-pointer"
              >
                {t.admin.messages.markReplied}
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => void setStatus('archived', true)}
                className="min-h-[38px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {t.admin.messages.markArchived}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ComposeMessageModalProps {
  firebaseUser: User;
  t: MedoraCopy;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function ComposeMessageModal({
  firebaseUser,
  t,
  onClose,
  onCreated,
}: ComposeMessageModalProps) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] =
    useState<AdminMessageCategory>('institution_notice');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 2 || body.trim().length < 2) {
      setError(t.admin.errorLoading);
      return;
    }
    setSending(true);
    try {
      await createAdminMessage(firebaseUser, {
        subject: subject.trim(),
        body: body.trim(),
        category,
      });
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t.admin.messages.composeTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.admin.messages.category}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AdminMessageCategory)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="institution_notice">
                {t.admin.messages.categories.institution_notice}
              </option>
              <option value="system">{t.admin.messages.categories.system}</option>
              <option value="compliance">
                {t.admin.messages.categories.compliance}
              </option>
              <option value="inquiry">{t.admin.messages.categories.inquiry}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.admin.messages.subject}
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.admin.messages.body}
            </label>
            <textarea
              required
              minLength={2}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {sending ? t.admin.messages.sending : t.admin.messages.sendBtn}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

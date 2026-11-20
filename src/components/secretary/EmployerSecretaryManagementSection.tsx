import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import {
  createEmployerSecretaryTask,
  fetchEmployerSecretaryWorkspace,
  revokeSecretaryInvitation,
  searchEmployerSecretaries,
  sendSecretaryInvitation,
  updateSecretaryEmployment,
} from '../../services/secretaryService';
import type { Language } from '../../types/medora';
import {
  PERMISSIONS_BY_EMPLOYER,
  type AnySecretaryPermission,
  type EmployerSecretaryWorkspace,
  type EmployerType,
  type InitialTaskTemplate,
  type SecretaryCandidateSummary,
  type SecretaryEmploymentRecord,
} from '../../types/secretary';

interface EmployerSecretaryManagementSectionProps {
  firebaseUser: User;
  employerType: EmployerType;
  language: Language;
}

export function EmployerSecretaryManagementSection({
  firebaseUser,
  employerType,
  language,
}: EmployerSecretaryManagementSectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const em = st.employerManagement;
  const isAr = language === 'ar';
  const entityPerms = PERMISSIONS_BY_EMPLOYER[employerType];

  const [workspace, setWorkspace] = useState<EmployerSecretaryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Add Secretary / Invite Modal State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SecretaryCandidateSummary[]>([]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<SecretaryCandidateSummary | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');
  const [expiryDays, setExpiryDays] = useState(14);
  const [selectedPerms, setSelectedPerms] = useState<AnySecretaryPermission[]>(() => [
    ...entityPerms.slice(0, 2),
  ]);
  const [initialTasks, setInitialTasks] = useState<InitialTaskTemplate[]>([]);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Edit Permissions Modal State
  const [editingEmployment, setEditingEmployment] =
    useState<SecretaryEmploymentRecord | null>(null);
  const [editPermsDraft, setEditPermsDraft] = useState<AnySecretaryPermission[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  // Assign Task Modal State
  const [taskTargetEmp, setTaskTargetEmp] =
    useState<SecretaryEmploymentRecord | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Terminate Confirmation Modal State
  const [confirmTerminateEmp, setConfirmTerminateEmp] =
    useState<SecretaryEmploymentRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const translateErr = useCallback(
    (err: unknown) => {
      const code = err instanceof Error ? err.message : String(err);
      return em.errorMap[code] || code;
    },
    [em.errorMap],
  );

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchEmployerSecretaryWorkspace(firebaseUser, employerType);
        setWorkspace(data);
      } catch (err) {
        setStatusBanner({ type: 'err', text: translateErr(err) });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [firebaseUser, employerType, translateErr],
  );

  useEffect(() => {
    void loadWorkspace(false);
  }, [loadWorkspace]);

  const counts = useMemo(() => {
    const active = (workspace?.employments || []).filter((e) => e.status === 'Active').length;
    const pending = (workspace?.invitations || []).filter((i) => i.status === 'Pending').length;
    const openTasks = (workspace?.tasks || []).filter((t) => t.status !== 'done').length;
    return { active, pending, openTasks };
  }, [workspace]);

  const handleSearch = async () => {
    if (searchQ.trim().length < 2) {
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchEmployerSecretaries(firebaseUser, employerType, searchQ.trim());
      setCandidates(res.candidates);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setSearching(false);
    }
  };

  const toggleInvitePerm = (perm: AnySecretaryPermission) => {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) {
      setStatusBanner({ type: 'err', text: em.selectCandidateHint });
      return;
    }
    if (selectedPerms.length === 0) {
      setStatusBanner({ type: 'err', text: em.errorMap.PERMISSION_REQUIRED });
      return;
    }
    setSendingInvite(true);
    setStatusBanner(null);
    try {
      await sendSecretaryInvitation(firebaseUser, employerType, {
        secretaryUid: selectedCandidate.uid,
        message: inviteMessage.trim(),
        proposedPermissions: selectedPerms,
        initialTasks: initialTasks.filter((t) => t.title.trim().length >= 2),
        expiryDays,
      });
      setInviteOpen(false);
      setSelectedCandidate(null);
      setSearchQ('');
      setCandidates([]);
      setInviteMessage('');
      setInitialTasks([]);
      setStatusBanner({
        type: 'ok',
        text: isAr
          ? 'تم إرسال دعوة التوظيف بنجاح (بانتظار قبول السكرتير).'
          : 'Hiring invitation sent successfully (pending secretary acceptance).',
      });
      await loadWorkspace(true);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    setBusyId(invitationId);
    setStatusBanner(null);
    try {
      await revokeSecretaryInvitation(firebaseUser, employerType, invitationId);
      await loadWorkspace(true);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePermissions = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingEmployment) return;
    if (editPermsDraft.length === 0) {
      setStatusBanner({ type: 'err', text: em.errorMap.PERMISSION_REQUIRED });
      return;
    }
    setSavingPerms(true);
    try {
      await updateSecretaryEmployment(
        firebaseUser,
        employerType,
        editingEmployment.employmentId,
        { permissions: editPermsDraft },
      );
      setEditingEmployment(null);
      await loadWorkspace(true);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setSavingPerms(false);
    }
  };

  const handleEmploymentStatus = async (
    emp: SecretaryEmploymentRecord,
    nextStatus: 'Active' | 'Suspended' | 'Terminated',
  ) => {
    setBusyId(emp.employmentId);
    setStatusBanner(null);
    try {
      await updateSecretaryEmployment(firebaseUser, employerType, emp.employmentId, {
        status: nextStatus,
      });
      setConfirmTerminateEmp(null);
      await loadWorkspace(true);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskTargetEmp || taskTitle.trim().length < 2) return;
    setSavingTask(true);
    try {
      await createEmployerSecretaryTask(firebaseUser, employerType, {
        employmentId: taskTargetEmp.employmentId,
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        priority: taskPriority,
        dueDate: taskDueDate || undefined,
      });
      setTaskTargetEmp(null);
      setTaskTitle('');
      setTaskDesc('');
      setTaskDueDate('');
      await loadWorkspace(true);
    } catch (err) {
      setStatusBanner({ type: 'err', text: translateErr(err) });
    } finally {
      setSavingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
        <Loader2 className="me-2 h-4 w-4 animate-spin text-[#0c3585] dark:text-[#f4d378]" />
        <span>{em.sectionTitle}...</span>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* Header + Action */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {em.sectionTitle}
              </h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {em.sectionSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadWorkspace(true)}
              disabled={refreshing}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{em.refreshBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInviteOpen(true);
                setStatusBanner(null);
              }}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>{em.addSecretaryBtn}</span>
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">{em.kpiActive}</p>
            <p className="mt-1 font-latin text-2xl font-extrabold text-slate-900 tabular-nums dark:text-white">
              {counts.active}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">{em.kpiPendingInvites}</p>
            <p className="mt-1 font-latin text-2xl font-extrabold text-[#9d6b14] tabular-nums dark:text-[#f4d378]">
              {counts.pending}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">{em.kpiOpenTasks}</p>
            <p className="mt-1 font-latin text-2xl font-extrabold text-[#0c3585] tabular-nums dark:text-blue-400">
              {counts.openTasks}
            </p>
          </div>
        </div>
      </div>

      {statusBanner && (
        <div
          role="alert"
          className={`rounded-xl border px-4 py-3 text-sm ${
            statusBanner.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          {statusBanner.text}
        </div>
      )}

      {/* Linked Secretaries */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <ShieldCheck className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h4 className="text-base font-bold text-slate-900 dark:text-white">
            {em.linkedTitle}
          </h4>
        </div>

        {(workspace?.employments || []).length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {em.noLinked}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {workspace?.employments.map((emp) => {
              const empTasks = (workspace.tasks || []).filter(
                (t) => t.employmentId === emp.employmentId,
              );
              const busy = busyId === emp.employmentId;
              const statusColor =
                emp.status === 'Active'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : emp.status === 'Suspended'
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';

              return (
                <article
                  key={emp.employmentId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white">
                          {emp.secretaryName}
                        </h5>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${statusColor}`}>
                          {st.employmentStatuses[emp.status]}
                        </span>
                        {emp.secretaryCode && (
                          <span className="font-latin text-xs font-semibold text-slate-500 tabular-nums" dir="ltr">
                            {emp.secretaryCode}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-latin text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                        {emp.secretaryEmail} {emp.secretaryPhone ? `· ${emp.secretaryPhone}` : ''}
                      </p>
                      <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{em.grantedPermsLabel}: </span>
                        {emp.permissions.map((p) => st.permissions[p]?.label || p).join(' · ') || '—'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 tabular-nums">
                        {empTasks.length} {em.tasksCountLabel} ({empTasks.filter((t) => t.status !== 'done').length}{' '}
                        {isAr ? 'مفتوحة' : 'open'})
                      </p>
                    </div>

                    {emp.status !== 'Terminated' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingEmployment(emp);
                            setEditPermsDraft([...emp.permissions]);
                          }}
                          className="min-h-[36px] rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                        >
                          {em.editPermissionsBtn}
                        </button>
                        {emp.status === 'Active' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setTaskTargetEmp(emp)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                          >
                            <ClipboardList className="h-3.5 w-3.5" />
                            <span>{em.assignTaskBtn}</span>
                          </button>
                        )}
                        {emp.status === 'Active' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleEmploymentStatus(emp, 'Suspended')}
                            className="min-h-[36px] rounded-xl border border-amber-300 px-3 text-xs font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 cursor-pointer"
                          >
                            {em.suspendBtn}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleEmploymentStatus(emp, 'Active')}
                            className="min-h-[36px] rounded-xl border border-emerald-300 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 cursor-pointer"
                          >
                            {em.reactivateBtn}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmTerminateEmp(emp)}
                          className="min-h-[36px] rounded-xl border border-rose-300 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 cursor-pointer"
                        >
                          {em.terminateBtn}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Sent Invitations */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <Send className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h4 className="text-base font-bold text-slate-900 dark:text-white">
            {em.invitationsTitle}
          </h4>
        </div>

        {(workspace?.invitations || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {em.noInvitations}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {workspace?.invitations.map((inv) => {
              const busy = busyId === inv.invitationId;
              return (
                <div
                  key={inv.invitationId}
                  className="flex flex-wrap items-start justify-between gap-3 py-3.5"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {inv.secretaryName}
                      </span>
                      <span className="text-xs font-semibold text-[#9d6b14] dark:text-[#f4d378]">
                        {st.invitationStatuses[inv.status]}
                      </span>
                    </div>
                    <p className="font-latin text-xs text-slate-500" dir="ltr">
                      {inv.secretaryEmail} {inv.secretaryCode ? `· ${inv.secretaryCode}` : ''}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {em.grantedPermsLabel}:{' '}
                      {inv.proposedPermissions.map((p) => st.permissions[p]?.label || p).join(' · ')}
                    </p>
                    {inv.message && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">“{inv.message}”</p>
                    )}
                    <p className="font-latin text-[11px] text-slate-400 tabular-nums" dir="ltr">
                      {em.expiresAtLabel}: {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>

                  {inv.status === 'Pending' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRevokeInvite(inv.invitationId)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-rose-300 px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 cursor-pointer"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>{em.revokeInviteBtn}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Secretary Activity Log */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <History className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h4 className="text-base font-bold text-slate-900 dark:text-white">
            {em.activityTitle}
          </h4>
        </div>

        {(workspace?.activityLogs || []).length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {em.noActivity}
          </p>
        ) : (
          <div className="mt-3 max-h-60 divide-y divide-slate-100 overflow-y-auto text-xs dark:divide-slate-800">
            {workspace?.activityLogs.slice(0, 30).map((log) => (
              <div
                key={log.logId}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">{log.actorName}</span>{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    — {log.action} ({log.details})
                  </span>
                </div>
                {log.createdAt && (
                  <span className="font-latin text-slate-500 tabular-nums" dir="ltr">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal 1: Add Secretary / Send Hiring Invitation */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {em.modalTitle}
              </h4>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="mt-4 space-y-5">
              {/* Step 1: Search Registered Secretary */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {em.searchLabel}
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSearch();
                      }
                    }}
                    placeholder={em.searchPlaceholder}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    disabled={searching}
                    onClick={() => void handleSearch()}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    <span>{em.searchBtn}</span>
                  </button>
                </div>

                {candidates.length > 0 && (
                  <div className="mt-2.5 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
                    {candidates.map((cand) => {
                      const blocked = cand.relationStatus === 'Active' || cand.relationStatus === 'Pending';
                      const isSel = selectedCandidate?.uid === cand.uid;
                      return (
                        <button
                          key={cand.uid}
                          type="button"
                          disabled={blocked}
                          onClick={() => setSelectedCandidate(cand)}
                          className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-start transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                            isSel
                              ? 'border-[#d9a43b] bg-amber-50/50 dark:bg-amber-950/20'
                              : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {cand.fullName}{' '}
                              <span className="font-latin text-xs font-semibold text-slate-500">
                                ({cand.secretaryCode})
                              </span>
                            </p>
                            <p className="font-latin text-xs text-slate-500" dir="ltr">
                              {cand.email}
                            </p>
                            {cand.educationQualification && (
                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                {cand.educationQualification}
                              </p>
                            )}
                          </div>
                          {cand.relationStatus !== 'none' ? (
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                              {cand.relationStatus === 'Active'
                                ? em.alreadyActiveTag
                                : cand.relationStatus === 'Pending'
                                  ? em.alreadyPendingTag
                                  : em.suspendedTag}
                            </span>
                          ) : isSel ? (
                            <CheckCircle2 className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCandidate && (
                  <div className="mt-2 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3.5 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <strong>{em.selectedCandidate}:</strong> {selectedCandidate.fullName} (
                    <span className="font-latin">{selectedCandidate.email}</span>)
                  </div>
                )}
              </div>

              {/* Step 2: Permissions Strictly Scoped to EmployerType */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {em.permissionsLabel}
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {entityPerms.map((perm) => (
                    <label
                      key={perm}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPerms.includes(perm)}
                        onChange={() => toggleInvitePerm(perm)}
                        className="mt-0.5 h-4 w-4 accent-[#0c3585]"
                      />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {st.permissions[perm]?.label || perm}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {st.permissions[perm]?.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Step 3: Message + Expiry */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {em.messageLabel}
                  </label>
                  <textarea
                    rows={2}
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder={em.messagePlaceholder}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {em.expiryLabel}
                  </label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    {[3, 7, 14, 30].map((d) => (
                      <option key={d} value={d}>
                        {d} {em.daysSuffix}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 4: Optional Initial Tasks */}
              <div className="space-y-2 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {em.initialTasksLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setInitialTasks((prev) => [
                        ...prev,
                        { title: '', description: '', priority: 'medium' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{em.addInitialTaskBtn}</span>
                  </button>
                </div>

                {initialTasks.map((t, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <input
                      type="text"
                      value={t.title}
                      onChange={(e) =>
                        setInitialTasks((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row)),
                        )
                      }
                      placeholder={em.taskTitlePlaceholder}
                      className="min-h-[38px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 sm:col-span-5"
                    />
                    <input
                      type="text"
                      value={t.description || ''}
                      onChange={(e) =>
                        setInitialTasks((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, description: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder={em.taskDescPlaceholder}
                      className="min-h-[38px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 sm:col-span-4"
                    />
                    <select
                      value={t.priority}
                      onChange={(e) =>
                        setInitialTasks((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, priority: e.target.value as 'low' | 'medium' | 'high' }
                              : row,
                          ),
                        )
                      }
                      className="min-h-[38px] rounded-lg border border-slate-300 px-2 text-xs dark:border-slate-700 dark:bg-slate-950 sm:col-span-2"
                    >
                      <option value="low">{st.priorities.low}</option>
                      <option value="medium">{st.priorities.medium}</option>
                      <option value="high">{st.priorities.high}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setInitialTasks((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer sm:col-span-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
                >
                  {em.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={sendingInvite || !selectedCandidate}
                  className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{sendingInvite ? em.sendingBtn : em.sendInviteBtn}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Permissions */}
      {editingEmployment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              {em.editPermsModalTitle} · {editingEmployment.secretaryName}
            </h4>
            <form onSubmit={handleSavePermissions} className="mt-4 space-y-4">
              <div className="space-y-2">
                {entityPerms.map((perm) => (
                  <label
                    key={perm}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={editPermsDraft.includes(perm)}
                      onChange={() =>
                        setEditPermsDraft((prev) =>
                          prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
                        )
                      }
                      className="mt-0.5 h-4 w-4 accent-[#0c3585]"
                    />
                    <div>
                      <p className="font-bold">{st.permissions[perm]?.label || perm}</p>
                      <p className="text-[11px] text-slate-500">
                        {st.permissions[perm]?.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEmployment(null)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
                >
                  {em.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={savingPerms}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {em.savePermsBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Assign Task */}
      {taskTargetEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              {em.taskModalTitle} · {taskTargetEmp.secretaryName}
            </h4>
            <form onSubmit={handleCreateTask} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold">{em.taskTitleLabel} *</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-bold">{em.taskDescLabel}</label>
                <textarea
                  rows={2}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold">{em.taskPriorityLabel}</label>
                  <select
                    value={taskPriority}
                    onChange={(e) =>
                      setTaskPriority(e.target.value as 'low' | 'medium' | 'high')
                    }
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="low">{st.priorities.low}</option>
                    <option value="medium">{st.priorities.medium}</option>
                    <option value="high">{st.priorities.high}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold">{em.taskDueDateLabel}</label>
                  <input
                    type="date"
                    dir="ltr"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskTargetEmp(null)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
                >
                  {em.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {em.saveTaskBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Confirm Permanent Termination */}
      {confirmTerminateEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-2xl dark:border-rose-800 dark:bg-[#07122a]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-rose-600" />
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {em.terminateConfirmTitle}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {em.terminateConfirmBody}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTerminateEmp(null)}
                className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {em.cancelBtn}
              </button>
              <button
                type="button"
                disabled={busyId === confirmTerminateEmp.employmentId}
                onClick={() => void handleEmploymentStatus(confirmTerminateEmp, 'Terminated')}
                className="min-h-[38px] rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer"
              >
                {em.terminateBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {isAr
            ? 'جميع الدعوات والموافقات والصلاحيات مسجلة في سجل التدقيق وتُفرض من الخادم وقواعد الأمان.'
            : 'All invitations, consents, and permission changes are server-verified and audited.'}
        </span>
      </div>
    </section>
  );
}

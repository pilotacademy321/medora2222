import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CalendarPlus,
  Check,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Lock,
  MessageSquare,
  Package,
  Send,
  UserCheck,
  X,
} from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import {
  createScopedDoctorAppointment,
  createScopedPharmacyItem,
  fetchScopedMessages,
  sendScopedMessage,
  updateScopedDoctorAppointment,
  updateScopedLabBooking,
  updateScopedLabOrderTracking,
  updateSecretaryTaskStatus,
} from '../../services/secretaryService';
import type { Language } from '../../types/medora';
import type {
  ScopedEmployerWorkspaceData,
  SecretaryTaskRecord,
} from '../../types/secretary';

interface SecretaryWorkspaceSectionProps {
  firebaseUser: User;
  mode: 'tasks' | 'appointments_bookings' | 'messages';
  activeScope: ScopedEmployerWorkspaceData | null;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

export function SecretaryWorkspaceSection({
  firebaseUser,
  mode,
  activeScope,
  language,
  onRefreshWorkspace,
}: SecretaryWorkspaceSectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const tk = st.portal.tasks;
  const op = st.portal.operations;
  const ms = st.portal.messages;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Doctor New Booking Modal
  const [apptOpen, setApptOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [apptDate, setApptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [visitType, setVisitType] = useState<'scheduled' | 'walk_in' | 'follow_up'>('scheduled');
  const [isWaitlist, setIsWaitlist] = useState(false);
  const [reason, setReason] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);

  // Pharmacy New Operational Item
  const [pharmOpen, setPharmOpen] = useState(false);
  const [pharmKind, setPharmKind] = useState<
    'order' | 'pickup_booking' | 'inventory' | 'supplier_order'
  >('order');
  const [pharmTitle, setPharmTitle] = useState('');
  const [pharmCounterparty, setPharmCounterparty] = useState('');
  const [pharmQty, setPharmQty] = useState('');
  const [pharmDate, setPharmDate] = useState('');
  const [pharmNotes, setPharmNotes] = useState('');
  const [savingPharm, setSavingPharm] = useState(false);

  // Scoped Messaging State
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<Array<Record<string, unknown>>>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    setActiveConvId(null);
    setConvMessages([]);
    setBanner(null);
  }, [activeScope?.employment.employmentId, mode]);

  if (!activeScope) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#07122a]">
        <Lock className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {mode === 'tasks'
            ? tk.noEmployerNotice
            : mode === 'messages'
              ? ms.noEmployerNotice
              : op.noEmployerNotice}
        </p>
      </div>
    );
  }

  const emp = activeScope.employment;
  const perms = new Set<string>(emp.permissions);

  // 1) TASKS MODE
  if (mode === 'tasks') {
    const handleTaskMove = async (
      task: SecretaryTaskRecord,
      nextStatus: 'todo' | 'in_progress' | 'done',
    ) => {
      setBusyId(task.taskId);
      setBanner(null);
      try {
        await updateSecretaryTaskStatus(firebaseUser, task.taskId, nextStatus);
        await onRefreshWorkspace();
      } catch (err) {
        setBanner({
          type: 'err',
          text: err instanceof Error ? err.message : 'TASK_UPDATE_FAILED',
        });
      } finally {
        setBusyId(null);
      }
    };

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
            {st.employerTypeLabels[emp.employerType]} · {emp.employerName}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{tk.title}</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{tk.subtitle}</p>
        </div>

        {banner && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {banner.text}
          </div>
        )}

        {activeScope.tasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
            {tk.empty}
          </div>
        ) : (
          <div className="space-y-3">
            {activeScope.tasks.map((task) => {
              const busy = busyId === task.taskId;
              return (
                <article
                  key={task.taskId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {task.title}
                        </h3>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {st.priorities[task.priority]}
                        </span>
                        <span className="rounded-md border border-[#d9a43b]/40 bg-[#d9a43b]/15 px-2 py-0.5 text-[11px] font-bold text-[#9d6b14] dark:text-[#f4d378]">
                          {st.taskStatuses[task.status]}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                          {task.description}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        {tk.assignedByLabel}: {task.createdByName}
                        {task.dueDate ? ` · ${tk.dueDateLabel}: ${task.dueDate}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(['todo', 'in_progress', 'done'] as const).map((statusKey) => (
                        <button
                          key={statusKey}
                          type="button"
                          disabled={busy || task.status === statusKey}
                          onClick={() => void handleTaskMove(task, statusKey)}
                          className={`min-h-[34px] rounded-xl px-3 text-xs font-bold cursor-pointer disabled:opacity-50 ${
                            task.status === statusKey
                              ? 'bg-[#0c3585] text-white'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                          }`}
                        >
                          {statusKey === 'todo'
                            ? tk.markTodo
                            : statusKey === 'in_progress'
                              ? tk.markInProgress
                              : tk.markDone}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2) MESSAGES MODE (Scoped Strictly to Active Employer + adminMessaging perm)
  if (mode === 'messages') {
    if (!perms.has('adminMessaging')) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#07122a]">
          <Lock className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {ms.noMessagingPermNotice}
          </p>
        </div>
      );
    }

    const conversations = activeScope.conversations || [];
    const activeConv = conversations.find((c) => c.conversationId === activeConvId) || null;

    const handleSelectConv = async (conversationId: string) => {
      setActiveConvId(conversationId);
      setLoadingMsgs(true);
      try {
        const res = await fetchScopedMessages(
          firebaseUser,
          emp.employmentId,
          conversationId,
        );
        setConvMessages(res.messages);
      } catch (err) {
        setBanner({
          type: 'err',
          text: err instanceof Error ? err.message : 'MESSAGES_LOAD_FAILED',
        });
      } finally {
        setLoadingMsgs(false);
      }
    };

    const handleSendReply = async (e: FormEvent) => {
      e.preventDefault();
      if (!activeConvId || !replyText.trim()) return;
      setSendingMsg(true);
      try {
        const res = await sendScopedMessage(
          firebaseUser,
          emp.employmentId,
          activeConvId,
          replyText.trim(),
        );
        setConvMessages((prev) => [...prev, res.message]);
        setReplyText('');
        await onRefreshWorkspace();
      } catch (err) {
        setBanner({
          type: 'err',
          text: err instanceof Error ? err.message : 'MESSAGE_SEND_FAILED',
        });
      } finally {
        setSendingMsg(false);
      }
    };

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
            {st.employerTypeLabels[emp.employerType]} · {emp.employerName}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{ms.title}</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ms.subtitle}</p>
        </div>

        {banner && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {banner.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-5">
            {conversations.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500">{ms.emptyConversations}</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.conversationId}
                    type="button"
                    onClick={() => void handleSelectConv(conv.conversationId)}
                    className={`w-full rounded-xl border p-3 text-start transition cursor-pointer ${
                      activeConvId === conv.conversationId
                        ? 'border-[#d9a43b] bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {conv.patientName}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="rounded-md bg-rose-500 px-1.5 py-0.5 font-latin text-[10px] font-bold text-white tabular-nums">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                      {conv.lastMessagePreview || '—'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-7">
            {!activeConv ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center text-center text-xs text-slate-500">
                <MessageSquare className="mb-2 h-7 w-7 text-slate-300" />
                <span>{ms.selectPrompt}</span>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeConv.patientName}
                  </h3>
                  {activeConv.patientPhone && (
                    <p className="font-latin text-xs text-slate-500" dir="ltr">
                      {activeConv.patientPhone}
                    </p>
                  )}
                </div>

                <div className="my-4 max-h-80 space-y-2.5 overflow-y-auto">
                  {loadingMsgs ? (
                    <p className="py-8 text-center text-xs text-slate-500">...</p>
                  ) : (
                    convMessages.map((m, idx) => {
                      const isEmployerSide = m.senderRole !== 'patient';
                      return (
                        <div
                          key={String(m.messageId || idx)}
                          className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs ${
                            isEmployerSide
                              ? 'ms-auto bg-[#0c3585] text-white'
                              : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          <p className="font-bold opacity-85">{String(m.senderName || '')}</p>
                          <p className="mt-0.5 leading-relaxed">{String(m.text || '')}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendReply} className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={ms.replyPlaceholder}
                    className="min-h-[40px] flex-1 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !replyText.trim()}
                    className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{ms.sendBtn}</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3) OPERATIONS MODE (Appointments, Bookings, Waitlist, Lab Arrivals/Tracking, Pharmacy Ops)
  const hasDoctorOps =
    emp.employerType === 'doctor' &&
    (perms.has('manageBookings') ||
      perms.has('confirmAppointments') ||
      perms.has('manageWaitlist') ||
      perms.has('viewSelectedFiles'));

  const hasLabOps =
    emp.employerType === 'lab' &&
    (perms.has('manageBookings') ||
      perms.has('registerPatientArrival') ||
      perms.has('trackOrders') ||
      perms.has('viewTestStatus'));

  const hasPharmacyOps =
    emp.employerType === 'pharmacy' &&
    (perms.has('trackOrders') ||
      perms.has('managePickupBookings') ||
      perms.has('manageInventory') ||
      perms.has('trackSupplierOrders'));

  const handleDoctorApptCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSavingAppt(true);
    setBanner(null);
    try {
      await createScopedDoctorAppointment(firebaseUser, emp.employmentId, {
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        date: apptDate,
        time: apptTime,
        visitType,
        isWaitlist,
        reason: reason.trim(),
      });
      setApptOpen(false);
      setPatientName('');
      setPatientPhone('');
      setReason('');
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'APPOINTMENT_CREATE_FAILED',
      });
    } finally {
      setSavingAppt(false);
    }
  };

  const handleDoctorApptAction = async (
    appointmentId: string,
    payload: { status?: string; isWaitlist?: boolean },
  ) => {
    setBusyId(appointmentId);
    setBanner(null);
    try {
      await updateScopedDoctorAppointment(
        firebaseUser,
        emp.employmentId,
        appointmentId,
        payload,
      );
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'APPOINTMENT_UPDATE_FAILED',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleLabBookingAction = async (
    bookingId: string,
    payload: { status?: string; registerArrival?: boolean },
  ) => {
    setBusyId(bookingId);
    setBanner(null);
    try {
      await updateScopedLabBooking(firebaseUser, emp.employmentId, bookingId, payload);
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'LAB_BOOKING_UPDATE_FAILED',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleLabOrderStage = async (
    orderId: string,
    stage: 'ordered' | 'sample_collected' | 'in_lab',
  ) => {
    setBusyId(orderId);
    setBanner(null);
    try {
      await updateScopedLabOrderTracking(firebaseUser, emp.employmentId, orderId, stage);
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'ORDER_TRACKING_FAILED',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePharmacyAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPharm(true);
    setBanner(null);
    try {
      await createScopedPharmacyItem(firebaseUser, emp.employmentId, {
        kind: pharmKind,
        title: pharmTitle.trim(),
        counterpartyName: pharmCounterparty.trim(),
        quantity: pharmQty ? Number(pharmQty) : undefined,
        scheduledDate: pharmDate || undefined,
        notes: pharmNotes.trim() || undefined,
      });
      setPharmOpen(false);
      setPharmTitle('');
      setPharmCounterparty('');
      setPharmQty('');
      setPharmNotes('');
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'PHARMACY_ITEM_CREATE_FAILED',
      });
    } finally {
      setSavingPharm(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
              {st.employerTypeLabels[emp.employerType]} · {emp.employerName}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{op.title}</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{op.subtitle}</p>
          </div>

          {emp.employerType === 'doctor' &&
            (perms.has('manageBookings') || perms.has('manageWaitlist')) && (
              <button
                type="button"
                onClick={() => setApptOpen(true)}
                className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                <CalendarPlus className="h-4 w-4" />
                <span>{op.doctorNewApptBtn}</span>
              </button>
            )}

          {hasPharmacyOps && (
            <button
              type="button"
              onClick={() => setPharmOpen(true)}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
            >
              <Package className="h-4 w-4" />
              <span>{op.pharmacyAddBtn}</span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {banner.text}
        </div>
      )}

      {!hasDoctorOps && !hasLabOps && !hasPharmacyOps && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#07122a]">
          <Lock className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {op.noOperationsPermNotice}
          </p>
        </div>
      )}

      {/* DOCTOR SCOPED WORKSPACE */}
      {emp.employerType === 'doctor' &&
        (perms.has('manageBookings') ||
          perms.has('confirmAppointments') ||
          perms.has('manageWaitlist')) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            {(activeScope.appointments || []).length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">—</p>
            ) : (
              <div className="space-y-3">
                {(activeScope.appointments || []).map((a) => {
                  const busy = busyId === a.appointmentId;
                  return (
                    <article
                      key={a.appointmentId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {a.patientName}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {a.status}
                          </span>
                          {a.isWaitlist && (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              {op.waitlistTag}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-latin text-xs text-slate-500 tabular-nums" dir="ltr">
                          {a.date} · {a.time} · {a.patientPhone}
                        </p>
                        {a.reason && (
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                            {a.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {perms.has('confirmAppointments') && a.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleDoctorApptAction(a.appointmentId, { status: 'confirmed' })
                              }
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>{op.confirmBtn}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleDoctorApptAction(a.appointmentId, { status: 'rejected' })
                              }
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-rose-300 px-3 text-xs font-bold text-rose-700 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>{op.rejectBtn}</span>
                            </button>
                          </>
                        )}
                        {perms.has('manageWaitlist') &&
                          (a.status === 'confirmed' || a.status === 'pending') && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleDoctorApptAction(a.appointmentId, {
                                  status: 'checked_in',
                                  isWaitlist: false,
                                })
                              }
                              className="min-h-[34px] rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white cursor-pointer"
                            >
                              {op.checkInBtn}
                            </button>
                          )}
                        {perms.has('manageWaitlist') && !a.isWaitlist && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleDoctorApptAction(a.appointmentId, { isWaitlist: true })
                            }
                            className="min-h-[34px] rounded-xl border border-slate-300 px-3 text-xs font-bold dark:border-slate-700 cursor-pointer"
                          >
                            {op.waitlistMoveBtn}
                          </button>
                        )}
                        {perms.has('manageBookings') &&
                          a.status !== 'cancelled' &&
                          a.status !== 'completed' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleDoctorApptAction(a.appointmentId, { status: 'cancelled' })
                              }
                              className="min-h-[34px] rounded-xl border border-rose-300 px-3 text-xs font-bold text-rose-700 cursor-pointer"
                            >
                              {op.cancelBtn}
                            </button>
                          )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* DOCTOR PATIENT-CONSENTED FILES ONLY */}
      {emp.employerType === 'doctor' && perms.has('viewSelectedFiles') && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <FileText className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {op.selectedFilesTitle}
            </h3>
          </div>
          {(activeScope.selectedFiles || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">{op.noFiles}</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {(activeScope.selectedFiles || []).map((f) => (
                <div
                  key={f.fileId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{f.title}</p>
                    <p className="text-slate-500">
                      {f.patientName} · {f.category}
                    </p>
                  </div>
                  <span className="font-latin text-slate-500 tabular-nums" dir="ltr">
                    {f.documentDate}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* LAB SCOPED WORKSPACE */}
      {emp.employerType === 'lab' &&
        (perms.has('manageBookings') || perms.has('registerPatientArrival')) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <UserCheck className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {op.labBookingsTitle}
              </h3>
            </div>
            {(activeScope.labBookings || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">—</p>
            ) : (
              <div className="mt-3 space-y-3">
                {(activeScope.labBookings || []).map((b) => {
                  const busy = busyId === b.bookingId;
                  return (
                    <article
                      key={b.bookingId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {b.patientName}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold">
                            {b.status}
                          </span>
                          {b.arrivalRegistered && (
                            <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              {op.arrivalRegisteredBadge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-latin text-xs text-slate-500 tabular-nums" dir="ltr">
                          {b.date} · {b.time} · {b.patientPhone}
                        </p>
                        {b.requestedTests.length > 0 && (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {b.requestedTests.join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {perms.has('registerPatientArrival') && !b.arrivalRegistered && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void handleLabBookingAction(b.bookingId, { registerArrival: true })
                            }
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white cursor-pointer"
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            <span>{op.registerArrivalBtn}</span>
                          </button>
                        )}
                        {perms.has('manageBookings') && b.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleLabBookingAction(b.bookingId, { status: 'confirmed' })
                              }
                              className="min-h-[34px] rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white cursor-pointer"
                            >
                              {op.confirmBtn}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleLabBookingAction(b.bookingId, { status: 'cancelled' })
                              }
                              className="min-h-[34px] rounded-xl border border-rose-300 px-3 text-xs font-bold text-rose-700 cursor-pointer"
                            >
                              {op.cancelBtn}
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {emp.employerType === 'lab' &&
        (perms.has('trackOrders') || perms.has('viewTestStatus')) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {op.labOrdersTitle}
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">{op.clinicalLockedNote}</span>
            </div>

            {(activeScope.labOrders || []).length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">—</p>
            ) : (
              <div className="mt-3 space-y-3">
                {(activeScope.labOrders || []).map((ord) => {
                  const busy = busyId === ord.orderId;
                  const lockedPastIntake =
                    ord.status === 'result_entered' ||
                    ord.status === 'approved' ||
                    ord.status === 'cancelled';

                  return (
                    <article
                      key={ord.orderId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                    >
                      <div>
                        <p className="font-latin text-xs font-semibold text-slate-500 tabular-nums" dir="ltr">
                          {ord.orderNumber} · {ord.status}
                        </p>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {ord.patientName}
                        </h4>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                          {ord.testNames.join(' · ')}
                        </p>
                      </div>

                      {perms.has('trackOrders') && !lockedPastIntake && (
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              ['ordered', op.stageOrdered],
                              ['sample_collected', op.stageSampleCollected],
                              ['in_lab', op.stageInLab],
                            ] as const
                          ).map(([stageKey, stageLabel]) => (
                            <button
                              key={stageKey}
                              type="button"
                              disabled={busy || ord.status === stageKey}
                              onClick={() => void handleLabOrderStage(ord.orderId, stageKey)}
                              className={`min-h-[34px] rounded-xl px-3 text-xs font-bold cursor-pointer disabled:opacity-50 ${
                                ord.status === stageKey
                                  ? 'bg-[#0c3585] text-white'
                                  : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                              }`}
                            >
                              {stageLabel}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* PHARMACY SCOPED WORKSPACE */}
      {hasPharmacyOps && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Package className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {op.pharmacyTitle}
            </h3>
          </div>
          {(activeScope.pharmacyItems || []).length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">—</p>
          ) : (
            <div className="mt-3 space-y-3">
              {(activeScope.pharmacyItems || []).map((item) => (
                <article
                  key={item.itemId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div>
                    <p className="font-latin text-xs font-semibold text-slate-500 tabular-nums" dir="ltr">
                      {item.referenceCode} · {item.kind} · {item.status}
                    </p>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h4>
                    {item.counterpartyName && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {item.counterpartyName}
                      </p>
                    )}
                  </div>
                  {typeof item.quantity === 'number' && (
                    <span className="font-latin text-sm font-extrabold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                      Qty: {item.quantity}
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Scoped Doctor Booking Create */}
      {apptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {op.doctorNewApptBtn}
            </h3>
            <form onSubmit={handleDoctorApptCreate} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold">{op.patientName} *</label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-bold">{op.patientPhone} *</label>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold">{op.date} *</label>
                  <input
                    type="date"
                    dir="ltr"
                    required
                    value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold">{op.time} *</label>
                  <input
                    type="time"
                    dir="ltr"
                    required
                    value={apptTime}
                    onChange={(e) => setApptTime(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold">{op.visitType}</label>
                  <select
                    value={visitType}
                    onChange={(e) =>
                      setVisitType(e.target.value as 'scheduled' | 'walk_in' | 'follow_up')
                    }
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="scheduled">scheduled</option>
                    <option value="walk_in">walk_in</option>
                    <option value="follow_up">follow_up</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 pt-5 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isWaitlist}
                    onChange={(e) => setIsWaitlist(e.target.checked)}
                    className="h-4 w-4 accent-[#0c3585]"
                  />
                  <span>{op.waitlistToggle}</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold">{op.reason}</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApptOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold cursor-pointer"
                >
                  {op.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={savingAppt}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {op.saveBooking}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Scoped Pharmacy Item Create */}
      {pharmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {op.pharmacyAddBtn}
            </h3>
            <form onSubmit={handlePharmacyAdd} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold">{op.pharmacyKindLabel}</label>
                <select
                  value={pharmKind}
                  onChange={(e) =>
                    setPharmKind(
                      e.target.value as 'order' | 'pickup_booking' | 'inventory' | 'supplier_order',
                    )
                  }
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {perms.has('trackOrders') && <option value="order">{op.pharmacyKindOrder}</option>}
                  {perms.has('managePickupBookings') && (
                    <option value="pickup_booking">{op.pharmacyKindPickup}</option>
                  )}
                  {perms.has('manageInventory') && (
                    <option value="inventory">{op.pharmacyKindInventory}</option>
                  )}
                  {perms.has('trackSupplierOrders') && (
                    <option value="supplier_order">{op.pharmacyKindSupplier}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold">Title *</label>
                <input
                  type="text"
                  required
                  value={pharmTitle}
                  onChange={(e) => setPharmTitle(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold">Patient / Supplier</label>
                  <input
                    type="text"
                    value={pharmCounterparty}
                    onChange={(e) => setPharmCounterparty(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold">Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={pharmQty}
                    onChange={(e) => setPharmQty(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold">{op.date}</label>
                <input
                  type="date"
                  dir="ltr"
                  value={pharmDate}
                  onChange={(e) => setPharmDate(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-bold">{op.reason}</label>
                <input
                  type="text"
                  value={pharmNotes}
                  onChange={(e) => setPharmNotes(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPharmOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold cursor-pointer"
                >
                  {op.cancelBtn}
                </button>
                <button
                  type="submit"
                  disabled={savingPharm}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {op.saveBooking}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

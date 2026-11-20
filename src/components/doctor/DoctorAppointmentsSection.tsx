import { useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  Calendar,
  Check,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  createDoctorAppointment,
  saveDoctorWorkingSchedule,
  updateDoctorAppointment,
} from '../../services/doctorService';
import type {
  DayOfWeekKey,
  DoctorAppointment,
  DoctorWorkspaceData,
  WorkingSchedule,
} from '../../types/doctor';
import type { Language } from '../../types/medora';

interface DoctorAppointmentsSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

type ViewTab = 'day' | 'week' | 'month' | 'waitlist' | 'schedule';

const DAY_KEYS: DayOfWeekKey[] = [
  'sat',
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
];

function addDays(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function getDefaultSchedule(ws?: WorkingSchedule): WorkingSchedule {
  if (ws) return ws;
  return {
    days: {
      sat: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
      sun: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
      mon: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
      tue: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
      wed: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
      thu: { enabled: true, startTime: '09:00', endTime: '14:00', breakStart: '', breakEnd: '' },
      fri: { enabled: false, startTime: '09:00', endTime: '14:00', breakStart: '', breakEnd: '' },
    },
    consultationDurationMinutes: 20,
    maxPatientsPerPeriod: 1,
    holidayDates: [],
  };
}

export function DoctorAppointmentsSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
}: DoctorAppointmentsSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const ac = dc.appointments;

  const canManage =
    workspace.actorRole === 'doctor' ||
    workspace.permissions.includes('manageAppointments');
  const canEditSchedule =
    workspace.actorRole === 'doctor' ||
    workspace.permissions.includes('editClinicSchedule');
  const canManageWaitlist =
    workspace.actorRole === 'doctor' ||
    workspace.permissions.includes('manageWaitlist');

  const todayIso = new Date().toISOString().slice(0, 10);
  const [viewTab, setViewTab] = useState<ViewTab>('day');
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // New Booking Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [patientRecordId, setPatientRecordId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [bookDate, setBookDate] = useState(todayIso);
  const [bookTime, setBookTime] = useState('09:00');
  const [visitType, setVisitType] = useState<'scheduled' | 'walk_in' | 'follow_up'>('scheduled');
  const [isWaitlist, setIsWaitlist] = useState(false);
  const [reason, setReason] = useState('');
  const [savingBooking, setSavingBooking] = useState(false);

  // Reschedule Modal State
  const [rescheduleTarget, setRescheduleTarget] = useState<DoctorAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(todayIso);
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [savingReschedule, setSavingReschedule] = useState(false);

  // Schedule Editor State
  const [scheduleDraft, setScheduleDraft] = useState<WorkingSchedule>(() =>
    getDefaultSchedule(workspace.doctorProfile.workingSchedule),
  );
  const [holidayInput, setHolidayInput] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const visibleAppointments = useMemo(() => {
    if (viewTab === 'waitlist') {
      return workspace.appointments.filter((a) => a.isWaitlist);
    }
    if (viewTab === 'day') {
      return workspace.appointments.filter(
        (a) => !a.isWaitlist && a.date === selectedDate,
      );
    }
    if (viewTab === 'week') {
      const endWeek = addDays(selectedDate, 6);
      return workspace.appointments.filter(
        (a) => !a.isWaitlist && a.date >= selectedDate && a.date <= endWeek,
      );
    }
    if (viewTab === 'month') {
      const monthPrefix = selectedDate.slice(0, 7);
      return workspace.appointments.filter(
        (a) => !a.isWaitlist && a.date.startsWith(monthPrefix),
      );
    }
    return [];
  }, [workspace.appointments, viewTab, selectedDate]);

  const handleSelectPatientPreset = (id: string) => {
    setPatientRecordId(id);
    const found = workspace.patients.find((p) => p.patientRecordId === id);
    if (found) {
      setPatientName(found.fullName);
      setPatientPhone(found.phone);
    }
  };

  const handleCreateBooking = async (e: FormEvent) => {
    e.preventDefault();
    setSavingBooking(true);
    setBannerMsg(null);
    try {
      await createDoctorAppointment(firebaseUser, {
        patientRecordId: patientRecordId || undefined,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        date: bookDate,
        time: bookTime,
        visitType,
        isWaitlist,
        reason: reason.trim(),
      });
      await onRefreshWorkspace();
      setShowNewModal(false);
      setPatientRecordId('');
      setPatientName('');
      setPatientPhone('');
      setReason('');
      setIsWaitlist(false);
      setSelectedDate(bookDate);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setBannerMsg({
        type: 'err',
        text: code === 'SLOT_ALREADY_BOOKED' ? ac.slotTakenError : code || 'Error',
      });
    } finally {
      setSavingBooking(false);
    }
  };

  const handleStatusChange = async (
    appt: DoctorAppointment,
    status: DoctorAppointment['status'],
    extra?: { promoteFromWaitlist?: boolean },
  ) => {
    setBusyId(appt.appointmentId);
    setBannerMsg(null);
    try {
      await updateDoctorAppointment(firebaseUser, appt.appointmentId, {
        status,
        promoteFromWaitlist: extra?.promoteFromWaitlist,
      });
      await onRefreshWorkspace();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setBannerMsg({
        type: 'err',
        text: code === 'SLOT_ALREADY_BOOKED' ? ac.slotTakenError : code || 'Error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRescheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setSavingReschedule(true);
    setBannerMsg(null);
    try {
      await updateDoctorAppointment(firebaseUser, rescheduleTarget.appointmentId, {
        date: rescheduleDate,
        time: rescheduleTime,
      });
      await onRefreshWorkspace();
      setRescheduleTarget(null);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setBannerMsg({
        type: 'err',
        text: code === 'SLOT_ALREADY_BOOKED' ? ac.slotTakenError : code || 'Error',
      });
    } finally {
      setSavingReschedule(false);
    }
  };

  const handleSaveSchedule = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    setBannerMsg(null);
    try {
      await saveDoctorWorkingSchedule(firebaseUser, scheduleDraft);
      await onRefreshWorkspace();
      setBannerMsg({ type: 'ok', text: ac.savedNotice });
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {ac.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'day', label: ac.viewDay },
              { id: 'week', label: ac.viewWeek },
              { id: 'month', label: ac.viewMonth },
              { id: 'waitlist', label: ac.viewWaitlist },
              ...(canEditSchedule ? [{ id: 'schedule', label: ac.viewSchedule }] : []),
            ] as Array<{ id: ViewTab; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewTab(tab.id)}
              className={`min-h-[40px] rounded-xl border px-3.5 py-2 text-xs font-bold cursor-pointer ${
                viewTab === tab.id
                  ? 'border-[#0c3585] bg-[#0c3585] text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setBookDate(selectedDate);
                setShowNewModal(true);
              }}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-[#040917] cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{ac.newBookingBtn}</span>
            </button>
          )}
        </div>
      </div>

      {bannerMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            bannerMsg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          {bannerMsg.text}
        </div>
      )}

      {/* Schedule & Holidays Editor */}
      {viewTab === 'schedule' ? (
        <form
          onSubmit={handleSaveSchedule}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ac.durationLabel}
              </label>
              <input
                type="number"
                min={5}
                max={180}
                value={scheduleDraft.consultationDurationMinutes}
                onChange={(e) =>
                  setScheduleDraft((prev) => ({
                    ...prev,
                    consultationDurationMinutes: Number(e.target.value) || 20,
                  }))
                }
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ac.capacityLabel}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={scheduleDraft.maxPatientsPerPeriod}
                onChange={(e) =>
                  setScheduleDraft((prev) => ({
                    ...prev,
                    maxPatientsPerPeriod: Number(e.target.value) || 1,
                  }))
                }
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {ac.scheduleTitle}
            </h3>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {DAY_KEYS.map((dayKey) => {
                const rule = scheduleDraft.days[dayKey];
                return (
                  <div
                    key={dayKey}
                    className="grid grid-cols-1 items-center gap-3 p-3.5 sm:grid-cols-6"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white sm:col-span-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            days: {
                              ...prev.days,
                              [dayKey]: { ...rule, enabled: e.target.checked },
                            },
                          }))
                        }
                        className="h-4 w-4 accent-[#0c3585]"
                      />
                      <span>{dc.days[dayKey]}</span>
                    </label>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">{ac.workingHoursStart}</span>
                      <input
                        type="time"
                        disabled={!rule.enabled}
                        value={rule.startTime}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            days: {
                              ...prev.days,
                              [dayKey]: { ...rule, startTime: e.target.value },
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-latin text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">{ac.workingHoursEnd}</span>
                      <input
                        type="time"
                        disabled={!rule.enabled}
                        value={rule.endTime}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            days: {
                              ...prev.days,
                              [dayKey]: { ...rule, endTime: e.target.value },
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-latin text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">{ac.breakStart}</span>
                      <input
                        type="time"
                        disabled={!rule.enabled}
                        value={rule.breakStart || ''}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            days: {
                              ...prev.days,
                              [dayKey]: { ...rule, breakStart: e.target.value },
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-latin text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">{ac.breakEnd}</span>
                      <input
                        type="time"
                        disabled={!rule.enabled}
                        value={rule.breakEnd || ''}
                        onChange={(e) =>
                          setScheduleDraft((prev) => ({
                            ...prev,
                            days: {
                              ...prev.days,
                              [dayKey]: { ...rule, breakEnd: e.target.value },
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-latin text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Holidays */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {ac.holidaysLabel}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
                className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (!holidayInput) return;
                  if (!scheduleDraft.holidayDates.includes(holidayInput)) {
                    setScheduleDraft((prev) => ({
                      ...prev,
                      holidayDates: [...prev.holidayDates, holidayInput].sort(),
                    }));
                  }
                  setHolidayInput('');
                }}
                className="min-h-[40px] rounded-xl border border-[#0c3585] px-4 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585] hover:text-white dark:border-[#d9a43b] dark:text-[#f4d378] cursor-pointer"
              >
                {ac.addHolidayBtn}
              </button>
            </div>
            {scheduleDraft.holidayDates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {scheduleDraft.holidayDates.map((hd) => (
                  <span
                    key={hd}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-latin text-xs font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900"
                  >
                    {hd}
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleDraft((prev) => ({
                          ...prev,
                          holidayDates: prev.holidayDates.filter((x) => x !== hd),
                        }))
                      }
                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={savingSchedule}
            className="medora-gold-button min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
          >
            {savingSchedule ? '...' : ac.saveScheduleBtn}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Date Picker Bar for Day / Week / Month */}
          {viewTab !== 'waitlist' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-[#07122a]">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 font-latin text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayIso)}
                  className="min-h-[38px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {dc.reports.periodDay}
                </button>
              </div>
              <span className="font-latin text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                {visibleAppointments.length} {dc.nav.appointments}
              </span>
            </div>
          )}

          {/* Appointments List */}
          {visibleAppointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
              {ac.noAppointments}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAppointments.map((appt) => {
                const isBusy = busyId === appt.appointmentId;
                return (
                  <article
                    key={appt.appointmentId}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:flex-row lg:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-latin text-sm font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]" dir="ltr">
                          <Clock className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
                          {appt.date} · {appt.time}
                        </span>
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {dc.appointmentStatuses[appt.status]}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {ac.visitTypes[appt.visitType]}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {appt.patientName}
                      </h3>
                      <p className="font-latin text-xs text-slate-600 tabular-nums dark:text-slate-300" dir="ltr">
                        {appt.patientPhone}
                      </p>
                      {appt.reason && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {appt.reason}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap items-center gap-2">
                        {appt.isWaitlist && canManageWaitlist && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleStatusChange(appt, 'confirmed', {
                                promoteFromWaitlist: true,
                              })
                            }
                            className="min-h-[36px] rounded-lg bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                          >
                            {ac.confirmBtn}
                          </button>
                        )}
                        {appt.status === 'pending' && !appt.isWaitlist && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatusChange(appt, 'confirmed')}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              {ac.confirmBtn}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatusChange(appt, 'rejected')}
                              className="min-h-[36px] rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 cursor-pointer"
                            >
                              {ac.rejectBtn}
                            </button>
                          </>
                        )}
                        {appt.status === 'confirmed' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStatusChange(appt, 'checked_in')}
                            className="min-h-[36px] rounded-lg bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
                          >
                            {ac.checkInBtn}
                          </button>
                        )}
                        {(appt.status === 'confirmed' || appt.status === 'checked_in') && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatusChange(appt, 'completed')}
                              className="min-h-[36px] rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
                            >
                              {ac.completeBtn}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStatusChange(appt, 'no_show')}
                              className="min-h-[36px] rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              {ac.noShowBtn}
                            </button>
                          </>
                        )}
                        {appt.status !== 'completed' &&
                          appt.status !== 'cancelled' &&
                          appt.status !== 'rejected' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setRescheduleTarget(appt);
                                  setRescheduleDate(appt.date);
                                  setRescheduleTime(appt.time);
                                }}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {ac.rescheduleBtn}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleStatusChange(appt, 'cancelled')}
                                className="min-h-[36px] rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300 cursor-pointer"
                              >
                                {ac.cancelBtn}
                              </button>
                            </>
                          )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* New Appointment Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowNewModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateBooking}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {ac.newBookingBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {workspace.patients.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.selectPatientOpt}
                </label>
                <select
                  value={patientRecordId}
                  onChange={(e) => handleSelectPatientPreset(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">—</option>
                  {workspace.patients.map((pt) => (
                    <option key={pt.patientRecordId} value={pt.patientRecordId}>
                      {pt.fullName} ({pt.fileNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.patientName} *
                </label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.patientPhone} *
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.dateLabel} *
                </label>
                <input
                  type="date"
                  required
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.timeLabel} *
                </label>
                <input
                  type="time"
                  required
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.visitTypeLabel}
                </label>
                <select
                  value={visitType}
                  onChange={(e) =>
                    setVisitType(
                      e.target.value as 'scheduled' | 'walk_in' | 'follow_up',
                    )
                  }
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="scheduled">{ac.visitTypes.scheduled}</option>
                  <option value="walk_in">{ac.visitTypes.walk_in}</option>
                  <option value="follow_up">{ac.visitTypes.follow_up}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.reasonLabel}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            {canManageWaitlist && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWaitlist}
                  onChange={(e) => setIsWaitlist(e.target.checked)}
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{ac.waitlistToggle}</span>
              </label>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {ac.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingBooking}
                className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingBooking ? '...' : ac.saveBookingBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setRescheduleTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleRescheduleSubmit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {ac.rescheduleTitle}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {rescheduleTarget.patientName}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.newDate}
                </label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {ac.newTime}
                </label>
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {ac.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingReschedule}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingReschedule ? '...' : ac.rescheduleBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

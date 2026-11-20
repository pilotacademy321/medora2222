import { useCallback, useEffect, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Edit3,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  cancelAdminNotificationLog,
  fetchAdminNotificationsOverview,
  fetchRoleInAppNotifications,
  markAllRoleInAppNotificationsRead,
  markRoleInAppNotificationRead,
  retryAdminNotificationLog,
  runAdminContractFlowSimulation,
  runAdminNotificationSimulation,
  updateAdminNotificationTemplate,
} from '../../services/notificationService';
import {
  NOTIFICATION_EVENT_CATALOG,
  inferNotificationIconCategory,
  resolveNotificationActionRoute,
} from '../../constants/notificationCatalog';
import { NotificationBadgeIcon } from '../shared/NotificationBadgeIcon';
import { NotificationItemCard } from '../shared/NotificationItemCard';
import {
  NOTIFICATION_VISUAL_LABELS,
  resolveNotificationVisualKind,
  type NotificationVisualKind,
} from '../shared/notificationVisuals';
import type { AdminSectionId } from './AdminSections';
import type { Language } from '../../types/medora';
import type {
  NotificationAdminOverviewResponse,
  NotificationChannel,
  NotificationEventType,
  NotificationLogRecord,
  NotificationRecipientRole,
  NotificationTemplateRecord,
  RoleInAppNotificationRecord,
} from '../../types/notifications';

interface AdminNotificationsSectionProps {
  firebaseUser: User | null;
  language: Language;
  adminInbox?: RoleInAppNotificationRecord[];
  onUpdateAdminInbox?: (
    updater:
      | RoleInAppNotificationRecord[]
      | ((prev: RoleInAppNotificationRecord[]) => RoleInAppNotificationRecord[]),
  ) => void;
  onNavigateSection?: (section: AdminSectionId) => void;
}

type AdminNotifTab = 'inbox' | 'logs' | 'templates' | 'catalog' | 'simulator';

export function AdminNotificationsSection({
  firebaseUser,
  language,
  adminInbox,
  onUpdateAdminInbox,
  onNavigateSection,
}: AdminNotificationsSectionProps) {
  const isAr = language === 'ar';

  const [tab, setTab] = useState<AdminNotifTab>('inbox');
  const [localInbox, setLocalInbox] = useState<RoleInAppNotificationRecord[]>([]);
  const inboxList = adminInbox ?? localInbox;
  const updateInboxList = useCallback(
    (
      updater:
        | RoleInAppNotificationRecord[]
        | ((prev: RoleInAppNotificationRecord[]) => RoleInAppNotificationRecord[]),
    ) => {
      if (onUpdateAdminInbox) {
        onUpdateAdminInbox(updater);
      } else {
        setLocalInbox(updater);
      }
    },
    [onUpdateAdminInbox],
  );
  const unreadInboxCount = inboxList.filter((n) => !n.isRead).length;
  const [overview, setOverview] = useState<NotificationAdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [channelFilter, setChannelFilter] = useState<'all' | NotificationChannel>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busyLogId, setBusyLogId] = useState<string | null>(null);

  // Template editing
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [editBodyAr, setEditBodyAr] = useState('');
  const [editBodyEn, setEditBodyEn] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  // Simulator state
  const [simChannel, setSimChannel] = useState<NotificationChannel>('whatsapp');
  const [simEventType, setSimEventType] =
    useState<NotificationEventType>('appointment_updated');
  const [simRole, setSimRole] = useState<NotificationRecipientRole>('patient');
  const [simPhone, setSimPhone] = useState('+9647701234567');
  const [simFailure, setSimFailure] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [contractSimResult, setContractSimResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [catalogRoleFilter, setCatalogRoleFilter] = useState<
    'all' | NotificationRecipientRole | 'future'
  >('all');

  const loadOverview = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [data, inboxRes] = await Promise.all([
        fetchAdminNotificationsOverview(firebaseUser),
        fetchRoleInAppNotifications(firebaseUser, 'super_admin').catch(() => null),
      ]);
      setOverview(data);
      if (inboxRes) {
        updateInboxList(inboxRes.notifications);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ADMIN_NOTIFICATION_OVERVIEW_FAILED');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, updateInboxList]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleRetry = async (logId: string) => {
    if (!firebaseUser) return;
    setBusyLogId(logId);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      await retryAdminNotificationLog(firebaseUser, logId);
      setActionMsg(
        isAr ? 'تمت إعادة معالجة الإشعار بنجاح.' : 'Notification reprocessed cleanly.',
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'LOG_RETRY_FAILED');
    } finally {
      setBusyLogId(null);
    }
  };

  const handleCancel = async (logId: string) => {
    if (!firebaseUser) return;
    setBusyLogId(logId);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      await cancelAdminNotificationLog(firebaseUser, logId);
      setActionMsg(isAr ? 'تم إلغاء سجل الإشعار.' : 'Notification log cancelled.');
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'LOG_CANCEL_FAILED');
    } finally {
      setBusyLogId(null);
    }
  };

  const startEditTemplate = (tpl: NotificationTemplateRecord) => {
    setEditingTplId(tpl.templateId);
    setEditBodyAr(tpl.bodyAr);
    setEditBodyEn(tpl.bodyEn);
    setActionMsg(null);
    setErrorMsg(null);
  };

  const saveTemplate = async (tpl: NotificationTemplateRecord, nextEnabled?: boolean) => {
    if (!firebaseUser) return;
    setSavingTpl(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      await updateAdminNotificationTemplate(firebaseUser, tpl.templateId, {
        ...(editingTplId === tpl.templateId ? { bodyAr: editBodyAr, bodyEn: editBodyEn } : {}),
        ...(nextEnabled !== undefined ? { enabled: nextEnabled } : {}),
      });
      setEditingTplId(null);
      setActionMsg(isAr ? 'تم حفظ القالب الآمن بنجاح.' : 'Safe template updated.');
      await loadOverview();
    } catch (err) {
      const code = err instanceof Error ? err.message : 'TEMPLATE_UPDATE_FAILED';
      setErrorMsg(
        code === 'SENSITIVE_MEDICAL_OR_SECRET_CONTENT_FORBIDDEN_IN_WHATSAPP'
          ? isAr
            ? 'ممنوع تضمين مصطلحات طبية حساسة أو رموز OTP داخل قوالب واتساب.'
            : 'Sensitive medical terms or OTP keywords are forbidden in WhatsApp templates.'
          : code,
      );
    } finally {
      setSavingTpl(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!firebaseUser) return;
    setSimRunning(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const res = await runAdminNotificationSimulation(firebaseUser, {
        channel: simChannel,
        eventType: simEventType,
        recipientRole: simRole,
        phone: simChannel === 'whatsapp' ? simPhone : undefined,
        locale: language,
        simulateFailure: simFailure,
      });
      setActionMsg(
        res.ok
          ? isAr
            ? `تم تنفيذ محاكاة ${simChannel === 'whatsapp' ? 'واتساب' : 'إشعار داخل المنصة'} بنجاح (${res.log?.notificationLogId || ''}).`
            : `Simulated ${simChannel} dispatch succeeded (${res.log?.notificationLogId || ''}).`
          : isAr
            ? `تم تسجيل نتيجة الاختبار بحالة: ${res.log?.status || res.error}`
            : `Simulation logged with status: ${res.log?.status || res.error}`,
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SIMULATION_FAILED');
    } finally {
      setSimRunning(false);
    }
  };

  const handleRunContractSimulation = async (
    scenario: 'pharmacy_eligibility' | 'wholesaler_cycle',
  ) => {
    if (!firebaseUser) return;
    setSimRunning(true);
    setActionMsg(null);
    setErrorMsg(null);
    setContractSimResult(null);
    try {
      const res = await runAdminContractFlowSimulation(firebaseUser, {
        scenario,
        locale: language,
      });
      setContractSimResult({ flowType: res.flowType, steps: res.steps });
      setActionMsg(
        isAr
          ? `تم تنفيذ محاكاة العقد المستقبلي (${res.flowType}) والتحقق من قيود الأمان والخصوصية.`
          : `Future contract simulation (${res.flowType}) completed with privacy & ownership checks.`,
      );
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CONTRACT_FLOW_SIMULATION_FAILED');
    } finally {
      setSimRunning(false);
    }
  };

  const logs: NotificationLogRecord[] = (overview?.logs || []).filter((log) => {
    if (channelFilter !== 'all' && log.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Architecture Governance Banner */}
      <div className="rounded-2xl border border-[#d9a43b]/40 bg-amber-50/40 p-5 dark:bg-amber-950/15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#b68023] dark:text-[#f4d378]" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr
                  ? 'مركز الإشعارات الموحد (MEDORA In-App + WhatsApp Simulation)'
                  : 'MEDORA Unified Notification Center (In-App + WhatsApp Simulation)'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'تمت إزالة نظام SMS ورموز OTP بالكامل واعتماد Google Authentication حصراً للتسجيل. تعمل الإشعارات عبر قناتين فقط (داخل منصة MEDORA أو واتساب في وضع المحاكاة الآمن دون إرسال خارجي فعلي أو كشف أي بيانات طبية).'
                  : 'SMS and OTP have been completely removed; accounts use Google Authentication exclusively. Notifications operate strictly across Two Channels (MEDORA In-App or WhatsApp Simulation with zero external API calls or sensitive medical PII).'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <BellRing className="h-3.5 w-3.5" />
            <span>{isAr ? 'القناة 1: MEDORA In-App (نشطة)' : 'Channel 1: MEDORA In-App (Active)'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-amber-800 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>
              {isAr
                ? 'القناة 2: WhatsApp Business (وضع المحاكاة — Meta API غير مرتبط بعد)'
                : 'Channel 2: WhatsApp Business (Simulation Mode — Meta API Disconnected)'}
            </span>
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            {
              label: isAr ? 'إجمالي الإشعارات' : 'Total Dispatches',
              val: overview.stats.totalLogs,
            },
            {
              label: isAr ? 'داخل منصة MEDORA' : 'MEDORA In-App',
              val: overview.stats.inAppCount,
            },
            {
              label: isAr ? 'محاكاة WhatsApp' : 'WhatsApp Simulated',
              val: overview.stats.whatsappSimulatedCount,
            },
            {
              label: isAr ? 'تم التسليم / محاكاة ناجحة' : 'Delivered / Simulated',
              val: overview.stats.deliveredCount,
            },
            {
              label: isAr ? 'محجوب / فشل / ملغى' : 'Blocked / Failed / Cancelled',
              val:
                overview.stats.blockedCount +
                overview.stats.failedCount +
                overview.stats.cancelledCount,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]"
            >
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {kpi.label}
              </p>
              <p className="mt-1 font-latin text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {kpi.val}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </div>
      )}
      {actionMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {(
          [
            {
              id: 'inbox',
              label: isAr ? 'صندوق إشعارات الإدارة' : 'Admin Inbox',
              badge: unreadInboxCount,
            },
            { id: 'logs', label: isAr ? 'سجل الإشعارات والقنوات' : 'Channel Delivery Logs' },
            { id: 'templates', label: isAr ? 'القوالب الآمنة لـ WhatsApp' : 'Safe WhatsApp Templates' },
            { id: 'catalog', label: isAr ? 'دليل الأحداث والأيقونات' : 'Event Catalog & Icons' },
            { id: 'simulator', label: isAr ? 'مختبر المحاكاة والاختبار' : 'Two-Channel Simulator' },
          ] as Array<{ id: AdminNotifTab; label: string; badge?: number }>
        ).map((tItem) => (
          <button
            key={tItem.id}
            type="button"
            onClick={() => setTab(tItem.id)}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-xs font-bold cursor-pointer ${
              tab === tItem.id
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-300'
            }`}
          >
            {tItem.id === 'inbox' && <Bell className="h-3.5 w-3.5 shrink-0" />}
            <span>{tItem.label}</span>
            {typeof tItem.badge === 'number' && tItem.badge > 0 && (
              <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-extrabold text-[#040917] tabular-nums">
                {tItem.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{isAr ? 'جاري التحميل...' : 'Loading...'}</span>
        </div>
      ) : null}

      {/* TAB 0: SUPER ADMIN IN-APP INBOX */}
      {tab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'إشعارات الإدارة التشغيلية الفورية' : 'Super Admin Operational Notifications'}
              </h3>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {isAr
                  ? `غير المقروء: ${unreadInboxCount} · الإجمالي: ${inboxList.length}`
                  : `Unread: ${unreadInboxCount} · Total: ${inboxList.length}`}
              </span>
            </div>

            {unreadInboxCount > 0 && firebaseUser && (
              <button
                type="button"
                onClick={() => {
                  updateInboxList((prev) => prev.map((n) => ({ ...n, isRead: true })));
                  void markAllRoleInAppNotificationsRead(firebaseUser, 'super_admin');
                }}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
              </button>
            )}
          </div>

          {inboxList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
              {isAr ? 'لا توجد إشعارات في صندوق الإدارة حالياً.' : 'No admin notifications at the moment.'}
            </div>
          ) : (
            <div className="space-y-3">
              {inboxList.slice(0, 50).map((n) => {
                const actionRoute =
                  n.actionRoute ||
                  (n.eventType
                    ? resolveNotificationActionRoute(
                        'super_admin',
                        n.eventType,
                        n.relatedId,
                        n.relatedType,
                      )
                    : undefined);

                const canNav =
                  Boolean(onNavigateSection) &&
                  Boolean(actionRoute) &&
                  actionRoute?.section !== 'notifications_center';

                return (
                  <NotificationItemCard
                    key={n.notificationId}
                    notification={{
                      ...n,
                      actionRoute,
                    }}
                    language={language}
                    canNavigate={canNav}
                    navigateLabel={isAr ? 'فتح القسم' : 'Open Section'}
                    onMarkRead={() => {
                      if (!firebaseUser) return;
                      updateInboxList((prev) =>
                        prev.map((x) =>
                          x.notificationId === n.notificationId
                            ? { ...x, isRead: true }
                            : x,
                        ),
                      );
                      void markRoleInAppNotificationRead(
                        firebaseUser,
                        n.notificationId,
                        'super_admin',
                      );
                    }}
                    onNavigate={(route) => {
                      onNavigateSection?.(route.section as AdminSectionId);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: LOGS */}
      {tab === 'logs' && overview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as 'all' | NotificationChannel)}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">{isAr ? 'جميع القنوات (In-App + WhatsApp)' : 'All Channels'}</option>
              <option value="in_app">{isAr ? 'داخل منصة MEDORA' : 'MEDORA In-App'}</option>
              <option value="whatsapp">{isAr ? 'WhatsApp (محاكاة)' : 'WhatsApp (Simulation)'}</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
              <option value="Delivered">Delivered (In-App)</option>
              <option value="Simulated">Simulated (WhatsApp)</option>
              <option value="Blocked">Blocked (No Consent)</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
              {isAr ? 'لا توجد سجلات مطابقة للفلتر الحالي.' : 'No notification logs match your filter.'}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const statusColor =
                  log.status === 'Delivered' || log.status === 'Simulated'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : log.status === 'Blocked' || log.status === 'Failed'
                      ? 'text-rose-700 dark:text-rose-300'
                      : log.status === 'Cancelled'
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-amber-700 dark:text-amber-300';

                return (
                  <article
                    key={log.notificationLogId}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <NotificationBadgeIcon
                          category={log.iconCategory}
                          eventType={log.eventType}
                          relatedType={log.relatedType}
                          title={log.title}
                          body={log.bodyPreview}
                          workflowState={
                            log.status === 'Cancelled'
                              ? 'cancelled'
                              : log.status === 'Delivered' || log.status === 'Simulated'
                                ? 'completed'
                                : 'pending'
                          }
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            <span
                              className={
                                log.channel === 'whatsapp'
                                  ? 'font-bold text-emerald-700 dark:text-emerald-300'
                                  : 'font-bold text-[#0c3585] dark:text-blue-300'
                              }
                            >
                              {log.channel === 'whatsapp'
                                ? 'WhatsApp (Simulation)'
                                : 'MEDORA In-App'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {log.recipientRole}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-latin">{log.eventType}</span>
                            <span aria-hidden="true">·</span>
                            <span className={`font-bold ${statusColor}`}>{log.status}</span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {log.title}
                          </h3>
                          {log.bodyPreview && (
                            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              {log.bodyPreview}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-3 font-latin text-[11px] text-slate-500 tabular-nums">
                            <span>UID: {log.recipientUid}</span>
                            {log.recipientPhoneMasked && (
                              <span dir="ltr">{log.recipientPhoneMasked}</span>
                            )}
                            <span dir="ltr">
                              {log.createdAt.slice(0, 19).replace('T', ' ')}
                            </span>
                            {log.errorCode && (
                              <span className="text-rose-600">[{log.errorCode}]</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(log.status === 'Failed' || log.status === 'Blocked') && (
                          <button
                            type="button"
                            disabled={busyLogId === log.notificationLogId}
                            onClick={() => void handleRetry(log.notificationLogId)}
                            className="inline-flex min-h-[34px] shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>{isAr ? 'إعادة المحاولة' : 'Retry'}</span>
                          </button>
                        )}
                        {log.status !== 'Delivered' && log.status !== 'Cancelled' && (
                          <button
                            type="button"
                            disabled={busyLogId === log.notificationLogId}
                            onClick={() => void handleCancel(log.notificationLogId)}
                            className="inline-flex min-h-[34px] shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEMPLATES */}
      {tab === 'templates' && overview && (
        <div className="space-y-4">
          {overview.templates.map((tpl) => {
            const isEditing = editingTplId === tpl.templateId;
            return (
              <div
                key={tpl.templateId}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isAr ? tpl.labelAr : tpl.labelEn}
                    </h3>
                    <p className="font-latin text-[11px] text-slate-500">
                      {tpl.eventType} · {tpl.whatsappTemplateName} ·{' '}
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Zero Medical PII Verified
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={savingTpl}
                      onClick={() => void saveTemplate(tpl, !tpl.enabled)}
                      className={`min-h-[34px] rounded-xl px-3 text-xs font-bold cursor-pointer ${
                        tpl.enabled
                          ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {tpl.enabled
                        ? isAr
                          ? 'مفعّل'
                          : 'Enabled'
                        : isAr
                          ? 'معطّل'
                          : 'Disabled'}
                    </button>

                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditTemplate(tpl)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تعديل' : 'Edit'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {isAr ? 'النص العربي الآمن' : 'Arabic Safe Body'}
                      </label>
                      <textarea
                        rows={2}
                        value={editBodyAr}
                        onChange={(e) => setEditBodyAr(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {isAr ? 'النص الإنجليزي الآمن' : 'English Safe Body'}
                      </label>
                      <textarea
                        rows={2}
                        value={editBodyEn}
                        onChange={(e) => setEditBodyEn(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 font-latin text-xs dark:border-slate-700 dark:bg-slate-950"
                        dir="ltr"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingTpl}
                        onClick={() => void saveTemplate(tpl)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white cursor-pointer"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>{isAr ? 'حفظ القالب' : 'Save Template'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTplId(null)}
                        className="min-h-[36px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {tpl.bodyAr}
                    </div>
                    <div
                      className="rounded-xl bg-slate-50 p-3 font-latin text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      dir="ltr"
                    >
                      {tpl.bodyEn}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: EVENT CATALOG & ICONS */}
      {tab === 'catalog' && overview && (
        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'كتالوج الأحداث الموحد لجميع بوابات المنصة والعقود المستقبلية (الصيدلية والمذخر) — وفق نظام الأيقونات والألوان الطبية الـ 12.'
                  : 'Unified event catalog across all portals and future pharmacy/wholesaler contracts, mapped to the 12 standardized medical icons and color tokens.'}
              </p>
              <select
                value={catalogRoleFilter}
                onChange={(e) =>
                  setCatalogRoleFilter(
                    e.target.value as 'all' | NotificationRecipientRole | 'future',
                  )
                }
                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">{isAr ? 'جميع الأحداث' : 'All Events'}</option>
                <option value="doctor">{isAr ? 'الطبيب (Doctor)' : 'Doctor'}</option>
                <option value="patient">{isAr ? 'المريض (Patient)' : 'Patient'}</option>
                <option value="lab">{isAr ? 'المختبر (Lab)' : 'Laboratory'}</option>
                <option value="pharmacy">{isAr ? 'الصيدلية (مستقبلي)' : 'Pharmacy (Future)'}</option>
                <option value="wholesaler">{isAr ? 'المذخر (مستقبلي)' : 'Wholesaler (Future)'}</option>
                <option value="secretary">{isAr ? 'السكرتير (Secretary)' : 'Secretary'}</option>
                <option value="future">{isAr ? 'العقود المستقبلية فقط' : 'Future Contracts Only'}</option>
              </select>
            </div>

            {/* 12-Icon Visual Legend */}
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-4 lg:grid-cols-6">
              {(Object.keys(NOTIFICATION_VISUAL_LABELS) as NotificationVisualKind[]).map(
                (vKind) => (
                  <div key={vKind} className="flex items-center gap-2">
                    <NotificationBadgeIcon visualKind={vKind} size="sm" />
                    <span className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      {isAr
                        ? NOTIFICATION_VISUAL_LABELS[vKind].ar
                        : NOTIFICATION_VISUAL_LABELS[vKind].en}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(overview.catalog || Object.values(NOTIFICATION_EVENT_CATALOG))
              .filter((entry) => {
                if (catalogRoleFilter === 'all') return true;
                if (catalogRoleFilter === 'future') return Boolean(entry.futureContract);
                return entry.roles.includes(catalogRoleFilter);
              })
              .map((entry) => {
                const cat =
                  entry.iconCategory || inferNotificationIconCategory(entry.eventType);
                const visualKind = resolveNotificationVisualKind({
                  eventType: entry.eventType,
                  iconCategory: cat,
                });
                const catLabel = isAr
                  ? NOTIFICATION_VISUAL_LABELS[visualKind].ar
                  : NOTIFICATION_VISUAL_LABELS[visualKind].en;
                return (
                  <article
                    key={entry.eventType}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]"
                  >
                    <div className="flex items-start gap-3">
                      <NotificationBadgeIcon
                        category={cat}
                        visualKind={visualKind}
                        eventType={entry.eventType}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {catLabel}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-latin">{entry.eventType}</span>
                          {entry.futureContract && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-teal-700 dark:text-teal-300">
                                {isAr ? 'عقد مستقبلي (محاكاة)' : 'Future Contract'}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                          {isAr ? entry.labelAr : entry.labelEn}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                          {isAr ? entry.summaryAr : entry.summaryEn}
                        </p>
                        <p className="mt-1.5 font-latin text-[11px] text-slate-500 dark:text-slate-400">
                          Roles: {entry.roles.join(' · ')}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 4: SIMULATOR */}
      {tab === 'simulator' && overview && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr
                ? 'اختبار محاكاة القناتين (دون إرسال خارجي فعلي)'
                : 'Two-Channel Simulation Runner (No Real External Sending)'}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'القناة' : 'Channel'}
                </label>
                <select
                  value={simChannel}
                  onChange={(e) => setSimChannel(e.target.value as NotificationChannel)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="whatsapp">WhatsApp (Simulation Mode)</option>
                  <option value="in_app">MEDORA In-App Notification</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'بوابة المستلم' : 'Recipient Role'}
                </label>
                <select
                  value={simRole}
                  onChange={(e) => setSimRole(e.target.value as NotificationRecipientRole)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="patient">Patient</option>
                  <option value="doctor">Doctor</option>
                  <option value="lab">Lab</option>
                  <option value="pharmacy">Pharmacy (Future Contract)</option>
                  <option value="wholesaler">Wholesaler / المذخر (Future Contract)</option>
                  <option value="secretary">Secretary</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'نوع الحدث' : 'Event Type'}
                </label>
                <select
                  value={simEventType}
                  onChange={(e) => setSimEventType(e.target.value as NotificationEventType)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs font-bold dark:border-slate-700 dark:bg-slate-950"
                >
                  {overview.templates.map((tpl) => (
                    <option key={tpl.eventType} value={tpl.eventType}>
                      {tpl.eventType} — {isAr ? tpl.labelAr : tpl.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {simChannel === 'whatsapp' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'رقم الهاتف العراقي للاختبار (+964)' : 'Test Iraqi Phone (+964)'}
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              )}
            </div>

            {simChannel === 'whatsapp' && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simFailure}
                  onChange={(e) => setSimFailure(e.target.checked)}
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>
                  {isAr
                    ? 'محاكاة فشل الإرسال لاختبار إعادة المحاولة (Retry)'
                    : 'Simulate failure state to test Retry lifecycle'}
                </span>
              </label>
            )}

            <button
              type="button"
              disabled={simRunning}
              onClick={() => void handleRunSimulation()}
              className="medora-gold-button inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {simRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>{isAr ? 'تنفيذ اختبار المحاكاة' : 'Run Safe Simulation'}</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr
                  ? 'محاكاة تدفقات الصيدلية والمذخر المستقبلية (Simulation Only)'
                  : 'Future Pharmacy & Wholesaler Contract Simulator (Simulation Only)'}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'اختبار قواعد أهلية المريض عند توفر الدواء في الصيدلية، والتحقق من الحجب الإلزامي لإشعارات المخزون التجاري عن الأطباء، ومسار طلب الصيدلية من المذخر.'
                  : 'Verify patient medicine availability eligibility, strict doctor commercial-stock blocking, and pharmacy-to-wholesaler linked order flows without creating portals or live messaging.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={simRunning}
                onClick={() => void handleRunContractSimulation('pharmacy_eligibility')}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#0c3585] bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#0a2c6e] disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                <span>
                  {isAr
                    ? 'محاكاة أهلية توفر الدواء + حجب الطبيب'
                    : 'Simulate Pharmacy Eligibility + Doctor Block'}
                </span>
              </button>

              <button
                type="button"
                disabled={simRunning}
                onClick={() => void handleRunContractSimulation('wholesaler_cycle')}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:border-[#0c3585] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                <span>
                  {isAr
                    ? 'محاكاة دورة طلب الصيدلية ↔ المذخر'
                    : 'Simulate Pharmacy ↔ Wholesaler Cycle'}
                </span>
              </button>
            </div>

            {contractSimResult && (
              <pre
                dir="ltr"
                className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
              >
                {JSON.stringify(contractSimResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

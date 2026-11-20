import { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import { AlertTriangle, CheckCheck } from 'lucide-react';
import {
  inferNotificationIconCategory,
  resolveNotificationActionRoute,
} from '../../constants/notificationCatalog';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import { fetchNotificationPreferences } from '../../services/notificationService';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/patientService';
import type { Language } from '../../types/medora';
import type { NotificationActionRoute } from '../../types/notifications';
import type {
  PatientNotificationRecord,
  PatientNotificationType,
} from '../../types/patient';
import {
  IN_APP_MANDATORY_WARNING_AR,
  IN_APP_MANDATORY_WARNING_EN,
} from '../shared/NotificationChannelCard';
import { NotificationItemCard } from '../shared/NotificationItemCard';

interface PatientNotificationsSectionProps {
  firebaseUser: User;
  notifications: PatientNotificationRecord[];
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
  onNavigateAction?: (route: NotificationActionRoute) => void;
}

const TYPE_FILTERS: Array<'all' | PatientNotificationType> = [
  'all',
  'appointment',
  'reminder',
  'message',
  'lab_result',
  'announcement',
];

function inferPatientLegacyEventType(notif: PatientNotificationRecord) {
  if (notif.eventType) return notif.eventType;
  if (notif.type === 'lab_result') return 'lab_result_available' as const;
  if (notif.type === 'message') return 'doctor_message_received' as const;
  if (notif.type === 'reminder') return 'appointment_reminder' as const;
  if (notif.type === 'appointment') {
    return notif.relatedType?.includes('lab')
      ? ('lab_order_status_updated' as const)
      : ('appointment_confirmed' as const);
  }
  return 'important_account_update' as const;
}

export function PatientNotificationsSection({
  firebaseUser,
  notifications,
  language,
  onRefreshWorkspace,
  onNavigateAction,
}: PatientNotificationsSectionProps) {
  const pn = PATIENT_TRANSLATIONS[language].notifications;
  const [filterType, setFilterType] = useState<'all' | PatientNotificationType>(
    'all',
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'in_app' | 'whatsapp'>('in_app');

  useEffect(() => {
    let active = true;
    fetchNotificationPreferences(firebaseUser, 'patient')
      .then((prefs) => {
        if (active) setActiveChannel(prefs.preferredChannel);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const visibleList = useMemo(() => {
    return notifications.filter((n) => {
      if (filterType !== 'all' && n.type !== filterType) return false;
      if (unreadOnly && n.isRead) return false;
      return true;
    });
  }, [notifications, filterType, unreadOnly]);

  const handleMarkOne = async (id: string) => {
    setBusyId(id);
    try {
      await markNotificationRead(firebaseUser, id);
      await onRefreshWorkspace();
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(firebaseUser);
      await onRefreshWorkspace();
    } finally {
      setMarkingAll(false);
    }
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {pn.title}
              </h1>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {language === 'ar'
                  ? `غير المقروء: ${unreadCount} · الإجمالي: ${notifications.length}`
                  : `Unread: ${unreadCount} · Total: ${notifications.length}`}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {pn.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setUnreadOnly((prev) => !prev)}
              className={`min-h-[38px] shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-xs font-bold transition-colors cursor-pointer ${
                unreadOnly
                  ? 'border-[#0c3585] bg-blue-50 text-[#0c3585] dark:border-[#f4d378] dark:bg-blue-950/40 dark:text-[#f4d378]'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {language === 'ar'
                ? unreadOnly
                  ? 'غير المقروء فقط'
                  : 'تصفية غير المقروء'
                : unreadOnly
                  ? 'Unread only'
                  : 'Filter unread'}
            </button>
            {hasUnread && (
              <button
                type="button"
                disabled={markingAll}
                onClick={() => void handleMarkAll()}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#0c3585] bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#0a2c6e] disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                <span>{markingAll ? '...' : pn.markAllReadBtn}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setFilterType(tp)}
              className={`min-h-[36px] shrink-0 whitespace-nowrap rounded-xl px-3.5 text-xs font-bold cursor-pointer ${
                filterType === tp
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {tp === 'all' ? pn.allFilter : pn.types[tp]}
            </button>
          ))}
        </div>
      </div>

      {activeChannel === 'in_app' && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {language === 'ar'
              ? IN_APP_MANDATORY_WARNING_AR
              : IN_APP_MANDATORY_WARNING_EN}
          </span>
        </div>
      )}

      {visibleList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
          {pn.noNotifications}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleList.map((notif) => {
            const eventType = inferPatientLegacyEventType(notif);
            const iconCategory =
              notif.iconCategory ||
              inferNotificationIconCategory(
                eventType,
                notif.type,
                notif.relatedType,
              );
            const actionRoute =
              notif.actionRoute ||
              resolveNotificationActionRoute(
                'patient',
                eventType,
                notif.relatedId,
                notif.relatedType,
              );

            return (
              <NotificationItemCard
                key={notif.notificationId}
                notification={{
                  ...notif,
                  eventType,
                  iconCategory,
                  actionRoute,
                }}
                language={language}
                categoryLabel={pn.types[notif.type] || undefined}
                busy={busyId === notif.notificationId}
                onMarkRead={() => void handleMarkOne(notif.notificationId)}
                onNavigate={onNavigateAction}
                navigateLabel={language === 'ar' ? 'عرض التفاصيل' : 'View'}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

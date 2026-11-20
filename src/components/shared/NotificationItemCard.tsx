import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, ExternalLink } from 'lucide-react';
import {
  NOTIFICATION_EVENT_CATALOG,
  inferNotificationIconCategory,
} from '../../constants/notificationCatalog';
import type { Language } from '../../types/medora';
import type {
  NotificationActionRoute,
  NotificationEventType,
  NotificationIconCategory,
} from '../../types/notifications';
import { NotificationBadgeIcon } from './NotificationBadgeIcon';
import {
  NOTIFICATION_VISUAL_LABELS,
  resolveNotificationVisualKind,
  resolveNotificationWorkflowMeta,
  type NotificationVisualKind,
  type NotificationWorkflowState,
} from './notificationVisuals';

export interface NotificationItemViewModel {
  notificationId: string;
  title: string;
  body: string;
  createdAt?: string | null;
  isRead: boolean;
  eventType?: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  visualKind?: NotificationVisualKind;
  workflowState?: NotificationWorkflowState;
  actionRoute?: NotificationActionRoute;
  type?: string;
  relatedType?: string;
  employerName?: string;
}

interface NotificationItemCardProps {
  notification: NotificationItemViewModel;
  language: Language;
  categoryLabel?: string;
  busy?: boolean;
  canNavigate?: boolean;
  navigateLabel?: string;
  onMarkRead?: () => void;
  onNavigate?: (route: NotificationActionRoute) => void;
}

export function NotificationItemCard({
  notification,
  language,
  categoryLabel,
  busy = false,
  canNavigate = true,
  navigateLabel,
  onMarkRead,
  onNavigate,
}: NotificationItemCardProps) {
  const isAr = language === 'ar';
  const [expanded, setExpanded] = useState(false);

  const workflowMeta = resolveNotificationWorkflowMeta({
    eventType: notification.eventType,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    explicitWorkflowState: notification.workflowState,
  });

  const resolvedCategory =
    notification.iconCategory ||
    inferNotificationIconCategory(
      notification.eventType,
      notification.type,
      notification.relatedType,
    );

  const resolvedVisualKind =
    notification.visualKind ||
    resolveNotificationVisualKind({
      eventType: notification.eventType,
      iconCategory: resolvedCategory,
      type: notification.type,
      relatedType: notification.relatedType,
      title: notification.title,
      body: notification.body,
      workflowState: workflowMeta.state,
    });

  const catalogEntry =
    notification.eventType && notification.eventType in NOTIFICATION_EVENT_CATALOG
      ? NOTIFICATION_EVENT_CATALOG[notification.eventType]
      : null;

  const resolvedLabel =
    categoryLabel ||
    (catalogEntry
      ? isAr
        ? catalogEntry.labelAr
        : catalogEntry.labelEn
      : isAr
        ? NOTIFICATION_VISUAL_LABELS[resolvedVisualKind].ar
        : NOTIFICATION_VISUAL_LABELS[resolvedVisualKind].en);

  const formattedTime = notification.createdAt
    ? String(notification.createdAt).slice(0, 16).replace('T', ' ')
    : '';

  const showNavigate =
    Boolean(notification.actionRoute) &&
    Boolean(onNavigate) &&
    canNavigate !== false;

  const NavArrow = isAr ? ArrowLeft : ArrowRight;

  // Independent Read State label
  const readStatusLabel = notification.isRead
    ? isAr
      ? 'تمت القراءة'
      : 'Read'
    : isAr
      ? 'جديد'
      : 'New';

  const handleOpenCard = () => {
    setExpanded((prev) => !prev);
    if (!notification.isRead && onMarkRead) {
      onMarkRead();
    }
  };

  return (
    <article
      className={`rounded-2xl border transition-colors duration-200 ${
        notification.isRead
          ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]'
          : 'border-[#0c3585]/35 bg-blue-50/30 dark:border-[#d9a43b]/45 dark:bg-[#0a1938]'
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Clickable Summary Zone (marks unread as read + smooth expand/collapse) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={handleOpenCard}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenCard();
            }
          }}
          className="flex min-w-0 flex-1 items-start gap-3.5 text-start cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c3585] rounded-xl"
        >
          <NotificationBadgeIcon
            category={resolvedCategory}
            visualKind={resolvedVisualKind}
          />

          <div className="min-w-0 flex-1">
            {/* Unboxed metadata row with independent Read State & Workflow State */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {resolvedLabel}
              </span>

              {notification.employerName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {notification.employerName}
                  </span>
                </>
              )}

              <span aria-hidden="true">·</span>
              <span
                className={
                  notification.isRead
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'font-bold text-[#0c3585] dark:text-[#f4d378]'
                }
              >
                {readStatusLabel}
              </span>

              {workflowMeta.state && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className={`font-bold ${workflowMeta.textClass}`}>
                    {isAr ? workflowMeta.labelAr : workflowMeta.labelEn}
                  </span>
                </>
              )}

              {formattedTime && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-latin tabular-nums" dir="ltr">
                    <Clock className="h-3 w-3 opacity-70" aria-hidden="true" />
                    <span>{formattedTime}</span>
                  </span>
                </>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold leading-snug text-slate-900 dark:text-white">
                {notification.title}
              </h3>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  expanded ? 'rotate-180 text-[#0c3585] dark:text-[#f4d378]' : ''
                }`}
                aria-hidden="true"
              />
            </div>

            {notification.body && (
              <p
                className={`mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300 ${
                  expanded ? '' : 'line-clamp-2'
                }`}
              >
                {notification.body}
              </p>
            )}
          </div>
        </div>

        {/* Direct Real Actions */}
        {(showNavigate || (!notification.isRead && onMarkRead)) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
            {showNavigate && notification.actionRoute && onNavigate && (
              <button
                type="button"
                onClick={() => {
                  if (!notification.isRead && onMarkRead) {
                    onMarkRead();
                  }
                  onNavigate(notification.actionRoute!);
                }}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#0c3585]/25 bg-blue-50/70 px-3.5 text-xs font-bold text-[#0c3585] transition-colors duration-150 hover:bg-[#0c3585] hover:text-white dark:border-blue-800/60 dark:bg-blue-950/35 dark:text-blue-300 dark:hover:bg-[#0c3585] dark:hover:text-white cursor-pointer"
              >
                <span>{navigateLabel || (isAr ? 'فتح الصفحة' : 'Open')}</span>
                <NavArrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            )}

            {!notification.isRead && onMarkRead && (
              <button
                type="button"
                disabled={busy}
                onClick={onMarkRead}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition-colors duration-150 hover:border-[#0c3585] hover:text-[#0c3585] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#f4d378] cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{busy ? '...' : isAr ? 'تحديد كمقروء' : 'Mark read'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Smooth Animated Detail Panel on Open */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                {isAr ? 'حالة القراءة:' : 'Read state:'}{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {readStatusLabel}
                </strong>
              </span>
              {workflowMeta.state && (
                <span>
                  {isAr ? 'حالة الإجراء:' : 'Status:'}{' '}
                  <strong className={workflowMeta.textClass}>
                    {isAr ? workflowMeta.labelAr : workflowMeta.labelEn}
                  </strong>
                </span>
              )}
              {formattedTime && (
                <span className="font-latin tabular-nums" dir="ltr">
                  {formattedTime}
                </span>
              )}
            </div>

            {showNavigate && notification.actionRoute && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate(notification.actionRoute!)}
                className="inline-flex items-center gap-1 font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                <span>{navigateLabel || (isAr ? 'الانتقال إلى القسم المرتبط' : 'Go to linked section')}</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

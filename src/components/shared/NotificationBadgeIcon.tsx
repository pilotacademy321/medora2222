import {
  Calendar,
  Check,
  FileCheck2,
  FileText,
  MessageSquare,
  Pill,
  ShieldAlert,
  Stethoscope,
  Store,
  TestTube2,
  Warehouse,
  XCircle,
} from 'lucide-react';
import type {
  NotificationEventType,
  NotificationIconCategory,
} from '../../types/notifications';
import {
  resolveNotificationVisualKind,
  type NotificationVisualKind,
  type NotificationWorkflowState,
} from './notificationVisuals';

interface NotificationBadgeIconProps {
  category?: NotificationIconCategory;
  visualKind?: NotificationVisualKind;
  eventType?: NotificationEventType | string | null;
  type?: string | null;
  relatedType?: string | null;
  title?: string | null;
  body?: string | null;
  workflowState?: NotificationWorkflowState;
  size?: 'sm' | 'md';
}

const VISUAL_SPEC: Record<
  NotificationVisualKind,
  {
    icon: typeof Calendar;
    boxClass: string;
    iconClass: string;
    hasCornerCheck?: boolean;
  }
> = {
  // المواعيد: أيقونة تقويم، أزرق
  appointment: {
    icon: Calendar,
    boxClass: 'border-blue-200 bg-blue-50/90 dark:border-blue-800/70 dark:bg-blue-950/40',
    iconClass: 'text-blue-600 dark:text-blue-300',
  },
  // الطبيب: أيقونة طبيب، أزرق داكن
  doctor: {
    icon: Stethoscope,
    boxClass: 'border-[#0c3585]/25 bg-[#0c3585]/10 dark:border-sky-800/70 dark:bg-sky-950/45',
    iconClass: 'text-[#0c3585] dark:text-sky-300',
  },
  // التحاليل: أيقونة أنبوب مختبر، بنفسجي
  lab_test: {
    icon: TestTube2,
    boxClass: 'border-violet-200 bg-violet-50/90 dark:border-violet-800/70 dark:bg-violet-950/40',
    iconClass: 'text-violet-600 dark:text-violet-300',
  },
  // النتائج: أيقونة تقرير طبي، أخضر
  lab_result: {
    icon: FileCheck2,
    boxClass: 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/70 dark:bg-emerald-950/40',
    iconClass: 'text-emerald-600 dark:text-emerald-300',
  },
  // الوصفات: أيقونة وصفة طبية، تركوازي
  prescription: {
    icon: FileText,
    boxClass: 'border-teal-200 bg-teal-50/90 dark:border-teal-800/70 dark:bg-teal-950/40',
    iconClass: 'text-teal-600 dark:text-teal-300',
  },
  // الأدوية: أيقونة كبسولة، بنفسجي
  medicine: {
    icon: Pill,
    boxClass: 'border-purple-200 bg-purple-50/90 dark:border-purple-800/70 dark:bg-purple-950/40',
    iconClass: 'text-purple-600 dark:text-purple-300',
  },
  // توفر الدواء: أيقونة دواء مع علامة صح، أخضر
  medicine_available: {
    icon: Pill,
    boxClass: 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/70 dark:bg-emerald-950/40',
    iconClass: 'text-emerald-600 dark:text-emerald-300',
    hasCornerCheck: true,
  },
  // الصيدلية: أيقونة صيدلية، أخضر داكن
  pharmacy: {
    icon: Store,
    boxClass: 'border-emerald-700/25 bg-emerald-900/10 dark:border-emerald-700/60 dark:bg-emerald-950/55',
    iconClass: 'text-emerald-800 dark:text-emerald-300',
  },
  // المذخر: أيقونة مستودع، رمادي مزرق
  wholesaler: {
    icon: Warehouse,
    boxClass: 'border-slate-300 bg-slate-100/90 dark:border-slate-700 dark:bg-slate-800/70',
    iconClass: 'text-slate-600 dark:text-slate-300',
  },
  // الرسائل: أيقونة محادثة، أزرق
  message: {
    icon: MessageSquare,
    boxClass: 'border-sky-200 bg-sky-50/90 dark:border-sky-800/70 dark:bg-sky-950/40',
    iconClass: 'text-sky-600 dark:text-sky-300',
  },
  // التنبيهات الإدارية: أيقونة درع، برتقالي
  admin_alert: {
    icon: ShieldAlert,
    boxClass: 'border-orange-200 bg-orange-50/90 dark:border-orange-800/70 dark:bg-orange-950/40',
    iconClass: 'text-orange-600 dark:text-orange-300',
  },
  // الإلغاء أو الرفض: أيقونة X، أحمر
  cancelled: {
    icon: XCircle,
    boxClass: 'border-rose-200 bg-rose-50/90 dark:border-rose-800/70 dark:bg-rose-950/40',
    iconClass: 'text-rose-600 dark:text-rose-300',
  },
};

export function NotificationBadgeIcon({
  category,
  visualKind,
  eventType,
  type,
  relatedType,
  title,
  body,
  workflowState,
  size = 'md',
}: NotificationBadgeIconProps) {
  const resolvedKind: NotificationVisualKind =
    visualKind ||
    resolveNotificationVisualKind({
      eventType,
      iconCategory: category,
      type,
      relatedType,
      title,
      body,
      workflowState,
    });

  const spec = VISUAL_SPEC[resolvedKind] || VISUAL_SPEC.admin_alert;
  const Icon = spec.icon;
  const boxDims = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl';
  const iconDims = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]';

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center border ${boxDims} ${spec.boxClass}`}
      aria-hidden="true"
    >
      <Icon className={`${iconDims} ${spec.iconClass}`} />
      {spec.hasCornerCheck && (
        <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-emerald-600 text-white dark:border-[#07122a]">
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
      )}
    </div>
  );
}

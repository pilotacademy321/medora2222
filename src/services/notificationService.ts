import type { User } from 'firebase/auth';
import type {
  NotificationAdminOverviewResponse,
  NotificationChannel,
  NotificationEventType,
  NotificationLogRecord,
  NotificationRecipientRole,
  NotificationTemplateRecord,
  RoleInAppNotificationRecord,
  UserNotificationChannelPreferences,
} from '../types/notifications';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchNotificationPreferences(
  firebaseUser: User,
  role?: NotificationRecipientRole,
): Promise<UserNotificationChannelPreferences> {
  const q = role ? `?role=${encodeURIComponent(role)}` : '';
  const res = await fetch(`/api/notifications/preferences${q}`, {
    headers: await authHeaders(firebaseUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'PREFERENCES_FETCH_FAILED');
  return data.preferences as UserNotificationChannelPreferences;
}

export async function updateNotificationPreferences(
  firebaseUser: User,
  payload: {
    preferredChannel: NotificationChannel;
    whatsappConsent: boolean;
    locale?: 'ar' | 'en';
    role?: NotificationRecipientRole;
  },
): Promise<UserNotificationChannelPreferences> {
  const res = await fetch('/api/notifications/preferences', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'PREFERENCES_UPDATE_FAILED');
  return data.preferences as UserNotificationChannelPreferences;
}

export async function fetchRoleInAppNotifications(
  firebaseUser: User,
  role?: NotificationRecipientRole,
): Promise<{
  role: NotificationRecipientRole;
  collection: string;
  notifications: RoleInAppNotificationRecord[];
  unreadCount: number;
}> {
  const q = role ? `?role=${encodeURIComponent(role)}` : '';
  const res = await fetch(`/api/notifications/in-app${q}`, {
    headers: await authHeaders(firebaseUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'IN_APP_LIST_FAILED');
  return data;
}

export async function markRoleInAppNotificationRead(
  firebaseUser: User,
  notificationId: string,
  role?: NotificationRecipientRole,
): Promise<void> {
  const q = role ? `?role=${encodeURIComponent(role)}` : '';
  const res = await fetch(
    `/api/notifications/in-app/${encodeURIComponent(notificationId)}/read${q}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify({ role }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'IN_APP_MARK_READ_FAILED');
}

export async function markAllRoleInAppNotificationsRead(
  firebaseUser: User,
  role?: NotificationRecipientRole,
): Promise<number> {
  const res = await fetch('/api/notifications/in-app/read-all', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'IN_APP_READ_ALL_FAILED');
  return Number(data.markedCount || 0);
}

export async function fetchNotificationHistory(
  firebaseUser: User,
): Promise<NotificationLogRecord[]> {
  const res = await fetch('/api/notifications/history', {
    headers: await authHeaders(firebaseUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'NOTIFICATION_HISTORY_FAILED');
  return (data.logs || []) as NotificationLogRecord[];
}

export async function fetchAdminNotificationsOverview(
  firebaseUser: User,
): Promise<NotificationAdminOverviewResponse> {
  const res = await fetch('/api/admin/notifications/overview', {
    headers: await authHeaders(firebaseUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'ADMIN_NOTIFICATION_OVERVIEW_FAILED');
  return data as NotificationAdminOverviewResponse;
}

export async function updateAdminNotificationTemplate(
  firebaseUser: User,
  templateId: string,
  patch: {
    bodyAr?: string;
    bodyEn?: string;
    enabled?: boolean;
  },
): Promise<NotificationTemplateRecord> {
  const res = await fetch(
    `/api/admin/notifications/templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'TEMPLATE_UPDATE_FAILED');
  return data.template as NotificationTemplateRecord;
}

export async function retryAdminNotificationLog(
  firebaseUser: User,
  logId: string,
): Promise<NotificationLogRecord> {
  const res = await fetch(
    `/api/admin/notifications/logs/${encodeURIComponent(logId)}/retry`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'LOG_RETRY_FAILED');
  return data.log as NotificationLogRecord;
}

export async function cancelAdminNotificationLog(
  firebaseUser: User,
  logId: string,
): Promise<NotificationLogRecord> {
  const res = await fetch(
    `/api/admin/notifications/logs/${encodeURIComponent(logId)}/cancel`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'LOG_CANCEL_FAILED');
  return data.log as NotificationLogRecord;
}

export async function runAdminNotificationSimulation(
  firebaseUser: User,
  payload: {
    channel: NotificationChannel;
    eventType: NotificationEventType;
    recipientRole: NotificationRecipientRole;
    recipientUid?: string;
    phone?: string;
    locale?: 'ar' | 'en';
    simulateFailure?: boolean;
  },
): Promise<{
  ok: boolean;
  channelUsed: NotificationChannel;
  log: NotificationLogRecord | null;
  error?: string;
}> {
  const res = await fetch('/api/admin/notifications/simulate-test', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok && !data?.log) {
    throw new Error(data?.error || 'SIMULATION_FAILED');
  }
  return data;
}

export async function runAdminContractFlowSimulation(
  firebaseUser: User,
  payload: {
    scenario: 'pharmacy_eligibility' | 'wholesaler_cycle';
    locale?: 'ar' | 'en';
  },
): Promise<{
  ok: boolean;
  flowType: 'pharmacy_eligibility' | 'wholesaler_cycle';
  steps: Array<{ step: string; ok: boolean; error?: string; log?: unknown }>;
}> {
  const res = await fetch('/api/admin/notifications/simulate-contract-flow', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ flowType: payload.scenario, locale: payload.locale }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'CONTRACT_FLOW_SIMULATION_FAILED');
  }
  return data;
}


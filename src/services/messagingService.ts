import { type User } from 'firebase/auth';
import type { UploadedDocMeta } from '../types/medora';
import type {
  MedoraPartyRole,
  MedoraThread,
  MedoraThreadCategory,
  MedoraThreadMessage,
} from '../types/commerce';
import { uploadMedoraFile } from './medoraFirestore';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface MessagingRecipientOption {
  uid: string;
  role: MedoraPartyRole;
  name: string;
  subtitle?: string;
  category: MedoraThreadCategory;
}

export async function fetchMessagingRecipients(
  firebaseUser: User,
  role?: MedoraPartyRole,
): Promise<MessagingRecipientOption[]> {
  const qs = new URLSearchParams();
  if (role) qs.set('role', role);
  const res = await fetch(`/api/messages/recipients?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    recipients?: MessagingRecipientOption[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'RECIPIENTS_LOAD_FAILED');
  return body.recipients || [];
}

export async function fetchMessagingThreads(
  firebaseUser: User,
  params?: { role?: MedoraPartyRole; scope?: 'admin' },
): Promise<{
  viewerRole: MedoraPartyRole;
  viewerUid: string;
  threads: MedoraThread[];
  totalUnread: number;
}> {
  const qs = new URLSearchParams();
  if (params?.role) qs.set('role', params.role);
  if (params?.scope) qs.set('scope', params.scope);
  const res = await fetch(`/api/messages/threads?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    viewerRole?: MedoraPartyRole;
    viewerUid?: string;
    threads?: MedoraThread[];
    totalUnread?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'THREADS_LOAD_FAILED');
  return {
    viewerRole: body.viewerRole || params?.role || 'patient',
    viewerUid: body.viewerUid || firebaseUser.uid,
    threads: body.threads || [],
    totalUnread: Number(body.totalUnread || 0),
  };
}

export async function createOrOpenMessagingThread(
  firebaseUser: User,
  payload: {
    senderRole?: MedoraPartyRole;
    category: MedoraThreadCategory;
    recipientUid: string;
    recipientRole: MedoraPartyRole;
    subject?: string;
    body: string;
    attachments?: UploadedDocMeta[];
    transactionRef?: MedoraThread['transactionRef'];
  },
): Promise<{ thread: MedoraThread; message: MedoraThreadMessage }> {
  const res = await fetch('/api/messages/threads', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    thread?: MedoraThread;
    message?: MedoraThreadMessage;
    error?: string;
  };
  if (!res.ok || !body.thread || !body.message) {
    throw new Error(body.error || 'THREAD_CREATE_FAILED');
  }
  return { thread: body.thread, message: body.message };
}

export async function fetchThreadMessages(
  firebaseUser: User,
  threadId: string,
  role?: MedoraPartyRole,
): Promise<{ thread: MedoraThread; messages: MedoraThreadMessage[] }> {
  const qs = new URLSearchParams();
  if (role) qs.set('role', role);
  const res = await fetch(`/api/messages/threads/${encodeURIComponent(threadId)}/messages?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    thread?: MedoraThread;
    messages?: MedoraThreadMessage[];
    error?: string;
  };
  if (!res.ok || !body.thread) throw new Error(body.error || 'THREAD_MESSAGES_FAILED');
  return { thread: body.thread, messages: body.messages || [] };
}

export async function sendThreadMessage(
  firebaseUser: User,
  threadId: string,
  payload: {
    senderRole?: MedoraPartyRole;
    body: string;
    attachments?: UploadedDocMeta[];
  },
): Promise<{ thread: MedoraThread; message: MedoraThreadMessage }> {
  const res = await fetch(`/api/messages/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    thread?: MedoraThread;
    message?: MedoraThreadMessage;
    error?: string;
  };
  if (!res.ok || !body.thread || !body.message) {
    throw new Error(body.error || 'MESSAGE_SEND_FAILED');
  }
  return { thread: body.thread, message: body.message };
}

export async function uploadMessageAttachment(
  firebaseUser: User,
  file: File,
): Promise<UploadedDocMeta> {
  return uploadMedoraFile(firebaseUser, 'message_files', file);
}

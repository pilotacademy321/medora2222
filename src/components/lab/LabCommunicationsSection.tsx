import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Bell,
  Building2,
  CheckCheck,
  FileUp,
  MessageSquare,
  Send,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { Language, UploadedDocMeta } from '../../types/medora';
import type {
  LabMessageRecord,
  LabSectionId,
  LabWorkspaceData,
} from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { resolveNotificationActionRoute } from '../../constants/notificationCatalog';
import {
  createOrOpenLabConversation,
  fetchLabConversationMessages,
  markAllLabNotificationsRead,
  markLabAdminMessagesRead,
  markLabNotificationRead,
  sendLabAdminMessage,
  sendLabConversationMessage,
  uploadLabPrivateFile,
} from '../../services/labService';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';
import { IraqiPhoneVerificationCard } from '../shared/IraqiPhoneVerificationCard';
import { NotificationChannelCard } from '../shared/NotificationChannelCard';
import { NotificationItemCard } from '../shared/NotificationItemCard';
import { MedoraMessagingPanel } from '../shared/MedoraMessagingPanel';

interface LabCommunicationsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canMessage: boolean;
  canAccessSection?: (section: LabSectionId) => boolean;
  onNavigateSection?: (section: LabSectionId) => void;
  onRefresh: () => Promise<void>;
}

type CommsTab = 'notifications' | 'patient_chat' | 'medora_network' | 'admin_thread';

export const LabCommunicationsSection: React.FC<LabCommunicationsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canMessage,
  canAccessSection,
  onNavigateSection,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';
  const isManager = workspace.actorRole === 'lab_manager';

  const [tab, setTab] = useState<CommsTab>(isManager ? 'notifications' : 'patient_chat');

  useEffect(() => {
    if (!isManager && (tab === 'notifications' || tab === 'admin_thread')) {
      setTab('patient_chat');
    }
  }, [isManager, tab]);
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [messages, setMessages] = useState<LabMessageRecord[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftAttachments, setDraftAttachments] = useState<UploadedDocMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pick a linked MEDORA patient to start chat
  const [pickerPatientUid, setPickerPatientUid] = useState('');

  // Admin message form (Manager only)
  const [adminSubject, setAdminSubject] = useState('');
  const [adminBody, setAdminBody] = useState('');

  const linkedPatients = useMemo(
    () => workspace.patients.filter((p) => Boolean(p.linkedPatientUid)),
    [workspace.patients],
  );

  useEffect(() => {
    if (!selectedConvId && workspace.conversations.length > 0) {
      setSelectedConvId(workspace.conversations[0].conversationId);
    }
  }, [workspace.conversations, selectedConvId]);

  useEffect(() => {
    if (tab !== 'patient_chat' || !selectedConvId) return;
    let active = true;
    setLoadingMsgs(true);
    fetchLabConversationMessages(firebaseUser, selectedConvId)
      .then((list) => {
        if (active) setMessages(list);
      })
      .catch(() => {
        if (active) setMessages([]);
      })
      .finally(() => {
        if (active) setLoadingMsgs(false);
      });
    return () => {
      active = false;
    };
  }, [tab, selectedConvId, firebaseUser]);

  useEffect(() => {
    if (
      tab === 'admin_thread' &&
      workspace.actorRole === 'lab_manager' &&
      workspace.adminMessages.some((m) => m.senderRole === 'super_admin' && !m.isReadByLab)
    ) {
      void markLabAdminMessagesRead(firebaseUser).then(() => onRefresh()).catch(() => {});
    }
  }, [tab, workspace.actorRole, workspace.adminMessages, firebaseUser, onRefresh]);

  const handleMarkOneRead = async (id: string) => {
    try {
      await markLabNotificationRead(firebaseUser, id);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllLabNotificationsRead(firebaseUser);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  const handleStartPatientChat = async () => {
    if (!canMessage || !pickerPatientUid) return;
    const pt = linkedPatients.find((p) => p.linkedPatientUid === pickerPatientUid);
    if (!pt || !pt.linkedPatientUid) return;
    setSending(true);
    setErrorMsg('');
    try {
      const conv = await createOrOpenLabConversation(firebaseUser, {
        patientUid: pt.linkedPatientUid,
        patientName: pt.fullName,
        patientPhone: pt.phone,
      });
      await onRefresh();
      setSelectedConvId(conv.conversationId);
      setPickerPatientUid('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSending(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedConvId) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const uploaded = await uploadLabPrivateFile(firebaseUser, 'message_files', file, {
        conversationId: selectedConvId,
      });
      setDraftAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPLOAD_FAILED');
    } finally {
      setUploading(false);
    }
  };

  const handleSendPatientMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMessage || !selectedConvId || (!draftText.trim() && draftAttachments.length === 0)) return;
    setSending(true);
    setErrorMsg('');
    try {
      const msg = await sendLabConversationMessage(firebaseUser, selectedConvId, {
        text: draftText.trim(),
        attachments: draftAttachments,
      });
      setMessages((prev) => [...prev, msg]);
      setDraftText('');
      setDraftAttachments([]);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSending(false);
    }
  };

  const handleSendAdminMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workspace.actorRole !== 'lab_manager' || !adminSubject.trim() || !adminBody.trim()) return;
    setSending(true);
    setErrorMsg('');
    try {
      await sendLabAdminMessage(firebaseUser, {
        subject: adminSubject.trim(),
        body: adminBody.trim(),
      });
      setAdminSubject('');
      setAdminBody('');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.comms.title}</h2>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {isManager && (
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'notifications'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>{lt.comms.tabNotifications}</span>
            {workspace.notifications.some((n) => !n.isRead) && (
              <span className="font-latin tabular-nums rounded bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                {workspace.notifications.filter((n) => !n.isRead).length}
              </span>
            )}
          </button>
        )}

        {canMessage && (
          <button
            type="button"
            onClick={() => setTab('patient_chat')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'patient_chat'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{lt.comms.tabPatientChat}</span>
          </button>
        )}

        {(canMessage || isManager) && (
          <button
            type="button"
            onClick={() => setTab('medora_network')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'medora_network'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>{isAr ? 'الأطباء وشبكة MEDORA' : 'Doctors & MEDORA Network'}</span>
          </button>
        )}

        {isManager && (
          <button
            type="button"
            onClick={() => setTab('admin_thread')}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              tab === 'admin_thread'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{lt.comms.tabAdminThread}</span>
          </button>
        )}
      </div>

      {tab === 'medora_network' && (canMessage || isManager) && (
        <MedoraMessagingPanel
          firebaseUser={firebaseUser}
          lang={lang}
          portalRole="lab"
        />
      )}

      {!isManager && !canMessage && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          {isAr
            ? 'الإشعارات الإدارية للمختبر مخصصة لصاحب المختبر فقط، وحسابك لا يملك صلاحية مراسلة المرضى.'
            : 'Laboratory alerts are restricted to the lab owner, and your account does not have patient messaging permission.'}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: Internal Notifications (Lab Manager Only) */}
      {tab === 'notifications' && isManager && (
        <div className="space-y-4">
          {workspace.actorRole === 'lab_manager' && (
            <div className="space-y-3">
              <IraqiPhoneVerificationCard
                firebaseUser={firebaseUser}
                language={lang}
                currentPhone={workspace.labProfile.professionalPhone || ''}
                compact
              />
              <NotificationChannelCard
                firebaseUser={firebaseUser}
                role="lab"
                language={lang}
                compact
                linkedPhoneOverride={workspace.labProfile.professionalPhone || ''}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#07122a]">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
              {isAr
                ? `غير المقروء: ${workspace.notifications.filter((n) => !n.isRead).length} · الإجمالي: ${workspace.notifications.length}`
                : `Unread: ${workspace.notifications.filter((n) => !n.isRead).length} · Total: ${workspace.notifications.length}`}
            </span>

            {workspace.notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="min-h-[36px] shrink-0 whitespace-nowrap rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-[#0c3585] dark:text-blue-400 inline-flex items-center gap-1.5 cursor-pointer hover:border-[#0c3585]"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{lt.comms.markAllRead}</span>
              </button>
            )}
          </div>

          {workspace.notifications.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-8 text-center text-xs text-slate-500">
              {lt.common.noData}
            </div>
          ) : (
            <div className="space-y-3">
              {workspace.notifications.map((n) => {
                const actionRoute =
                  n.actionRoute ||
                  (n.eventType
                    ? resolveNotificationActionRoute(
                        'lab',
                        n.eventType,
                        n.relatedId,
                        n.relatedType,
                      )
                    : undefined);

                const targetSection = actionRoute?.section as LabSectionId | undefined;
                const canNav =
                  Boolean(actionRoute) &&
                  (actionRoute?.section === 'communications' && actionRoute?.tab === 'patient_chat'
                    ? canMessage
                    : Boolean(
                        onNavigateSection &&
                          targetSection &&
                          (!canAccessSection || canAccessSection(targetSection)),
                      ));

                return (
                  <NotificationItemCard
                    key={n.notificationId}
                    notification={{
                      ...n,
                      actionRoute,
                    }}
                    language={lang}
                    canNavigate={canNav}
                    navigateLabel={isAr ? 'فتح القسم' : 'Open Section'}
                    onMarkRead={() => void handleMarkOneRead(n.notificationId)}
                    onNavigate={(route) => {
                      if (route.section === 'communications' && route.tab === 'patient_chat') {
                        if (canMessage) setTab('patient_chat');
                        return;
                      }
                      onNavigateSection?.(route.section as LabSectionId);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Patient Chat */}
      {tab === 'patient_chat' && canMessage && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-3 space-y-3">
            {linkedPatients.length > 0 && (
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <select
                  value={pickerPatientUid}
                  onChange={(e) => setPickerPatientUid(e.target.value)}
                  className="flex-1 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2.5 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">{lt.comms.startPatientChat}</option>
                  {linkedPatients.map((p) => (
                    <option key={p.patientRecordId} value={p.linkedPatientUid || ''}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!pickerPatientUid || sending}
                  onClick={() => void handleStartPatientChat()}
                  className="min-h-[38px] rounded-xl bg-[#0c3585] text-white px-3 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {workspace.conversations.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">{lt.common.noData}</p>
              ) : (
                workspace.conversations.map((conv) => (
                  <button
                    key={conv.conversationId}
                    type="button"
                    onClick={() => setSelectedConvId(conv.conversationId)}
                    className={`w-full rounded-xl border p-2.5 text-start text-xs transition cursor-pointer ${
                      conv.conversationId === selectedConvId
                        ? 'border-[#0c3585] bg-blue-50/70 dark:bg-blue-950/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {conv.patientName}
                      </span>
                      {conv.unreadByLab > 0 && (
                        <span className="font-latin tabular-nums rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {conv.unreadByLab}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 truncate">{conv.lastMessagePreview || '—'}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] flex flex-col min-h-[420px]">
            {!selectedConvId ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 p-6">
                {lt.common.noData}
              </div>
            ) : (
              <>
                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[380px]">
                  {loadingMsgs ? (
                    <p className="text-center text-xs text-slate-500">...</p>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-xs text-slate-500 py-8">{lt.common.noData}</p>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.messageId}
                        className={`flex ${m.senderRole === 'lab' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-xs space-y-1.5 ${
                            m.senderRole === 'lab'
                              ? 'bg-[#0c3585] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                          }`}
                        >
                          <div className="text-[10px] opacity-75">
                            {m.senderName} · {String(m.createdAt || '').slice(11, 16)}
                          </div>
                          {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
                          {m.attachments?.map((att, idx) => (
                            <ProtectedMediaButton
                              key={idx}
                              firebaseUser={firebaseUser}
                              url={att.url}
                              fileName={att.name}
                              className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-[11px] font-semibold"
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={handleSendPatientMsg}
                  className="border-t border-slate-100 dark:border-slate-800 p-3 space-y-2"
                >
                  {draftAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {draftAttachments.map((att, idx) => (
                        <span
                          key={idx}
                          className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-[11px] font-semibold text-[#0c3585] dark:text-blue-300"
                        >
                          {att.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 inline-flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300 hover:border-[#0c3585]">
                      <FileUp className="h-4 w-4" />
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleUploadAttachment}
                        disabled={uploading}
                        className="sr-only"
                      />
                    </label>
                    <input
                      type="text"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={lt.comms.typeMessage}
                      className="flex-1 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={sending || uploading}
                      className="medora-gold-button min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{lt.comms.send}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Official Super Admin Thread (Lab Manager only) */}
      {tab === 'admin_thread' && workspace.actorRole === 'lab_manager' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-2.5">
            {workspace.adminMessages.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-8 text-center text-xs text-slate-500">
                {lt.common.noData}
              </div>
            ) : (
              workspace.adminMessages.map((msg) => (
                <div
                  key={msg.threadMessageId}
                  className={`rounded-xl border p-4 text-xs space-y-1.5 ${
                    msg.senderRole === 'super_admin'
                      ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{msg.subject}</span>
                    <span className="font-latin tabular-nums text-[11px] text-slate-500">
                      {String(msg.createdAt || '').slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-[#0c3585] dark:text-blue-400">
                    {msg.senderRole === 'super_admin'
                      ? isAr
                        ? 'إدارة منصة MEDORA'
                        : 'MEDORA Super Admin'
                      : msg.senderName}
                  </div>
                  <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{msg.body}</p>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendAdminMsg}
            className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3 text-xs h-fit"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'مراسلة إدارة MEDORA' : 'Message MEDORA Super Admin'}
            </h3>
            <div>
              <label className="block font-semibold mb-1">{lt.comms.adminSubject}</label>
              <input
                required
                value={adminSubject}
                onChange={(e) => setAdminSubject(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{lt.comms.adminBody}</label>
              <textarea
                rows={4}
                required
                value={adminBody}
                onChange={(e) => setAdminBody(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] p-3 text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="medora-gold-button w-full min-h-[42px] rounded-xl font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sending ? lt.common.saving : lt.comms.send}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

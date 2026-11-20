import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  fetchConversationMessages,
  openOrCreateConversation,
  sendDoctorMessage,
  uploadDoctorStorageAsset,
} from '../../services/doctorService';
import type {
  DoctorMessageRecord,
  DoctorWorkspaceData,
} from '../../types/doctor';
import type { Language, UploadedDocMeta } from '../../types/medora';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import { ProtectedMediaButton, ProtectedMediaImage } from '../shared/ProtectedMedia';
import { MedoraMessagingPanel } from '../shared/MedoraMessagingPanel';

interface DoctorMessagesSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

export function DoctorMessagesSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
}: DoctorMessagesSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const mc = dc.messages;
  const [chatMode, setChatMode] = useState<'clinic_patients' | 'medora_entities'>('clinic_patients');

  const canMessage =
    workspace.actorRole === 'doctor' ||
    workspace.permissions.includes('messagePatients');

  const [search, setSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string>(
    () => workspace.conversations[0]?.conversationId || '',
  );
  const [messages, setMessages] = useState<DoctorMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newPatientId, setNewPatientId] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<UploadedDocMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspace.conversations;
    return workspace.conversations.filter(
      (c) =>
        c.patientName.toLowerCase().includes(q) ||
        (c.patientPhone || '').toLowerCase().includes(q),
    );
  }, [workspace.conversations, search]);

  const activeConversation = useMemo(
    () =>
      workspace.conversations.find((c) => c.conversationId === selectedConvId) ||
      null,
    [workspace.conversations, selectedConvId],
  );

  useEffect(() => {
    if (!selectedConvId || !canMessage) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    fetchConversationMessages(firebaseUser, selectedConvId)
      .then((list) => {
        if (active) setMessages(list);
      })
      .catch((err) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : 'Error');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser, selectedConvId, canMessage]);

  if (!canMessage) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        <Lock className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <span>{dc.patients.restrictedRecordsNotice}</span>
      </div>
    );
  }

  const handleStartChat = async () => {
    if (!newPatientId) return;
    setErrorMsg(null);
    try {
      const conv = await openOrCreateConversation(firebaseUser, newPatientId);
      await onRefreshWorkspace();
      setSelectedConvId(conv.conversationId);
      setNewPatientId('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleAttach = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedConvId) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const uploaded: UploadedDocMeta[] = [];
      for (const file of Array.from(files)) {
        const meta = await uploadDoctorStorageAsset(
          firebaseUser,
          'message_files',
          file,
          { conversationId: selectedConvId },
        );
        uploaded.push(meta);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || (!text.trim() && attachments.length === 0)) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const msg = await sendDoctorMessage(firebaseUser, selectedConvId, {
        text: text.trim(),
        attachments,
      });
      setMessages((prev) => [...prev, msg]);
      setText('');
      setAttachments([]);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  if (chatMode === 'medora_entities') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-3">
          <button
            type="button"
            onClick={() => setChatMode('clinic_patients')}
            className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {language === 'ar' ? 'رسائل مرضى العيادة' : 'Clinic Patient Chats'}
          </button>
          <button
            type="button"
            onClick={() => setChatMode('medora_entities')}
            className="h-9 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white cursor-pointer"
          >
            {language === 'ar' ? 'مراسلات الصيدليات والمختبرات والإدارة' : 'Pharmacies, Labs & Admin'}
          </button>
        </div>
        <MedoraMessagingPanel
          firebaseUser={firebaseUser}
          lang={language}
          portalRole="doctor"
          titleAr="مراسلات الطبيب مع الصيدليات والمختبرات والإدارة"
          titleEn="Doctor ↔ Pharmacies, Labs & Admin Messaging"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-3">
        <button
          type="button"
          onClick={() => setChatMode('clinic_patients')}
          className="h-9 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white cursor-pointer"
        >
          {language === 'ar' ? 'رسائل مرضى العيادة' : 'Clinic Patient Chats'}
        </button>
        <button
          type="button"
          onClick={() => setChatMode('medora_entities')}
          className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          {language === 'ar' ? 'مراسلات الصيدليات والمختبرات والإدارة' : 'Pharmacies, Labs & Admin'}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {mc.title}
        </h2>

        {workspace.patients.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={newPatientId}
              onChange={(e) => setNewPatientId(e.target.value)}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">{mc.selectPatient}</option>
              {workspace.patients.map((pt) => (
                <option key={pt.patientRecordId} value={pt.patientRecordId}>
                  {pt.fullName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!newPatientId}
              onClick={handleStartChat}
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1 rounded-xl px-3.5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{mc.newChatBtn}</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid min-h-[540px] grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Conversation List */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mc.searchConversations}
              className="min-h-[38px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-9 pe-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {filteredConversations.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              {mc.noConversations}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {filteredConversations.map((conv) => {
                const active = conv.conversationId === selectedConvId;
                return (
                  <button
                    key={conv.conversationId}
                    type="button"
                    onClick={() => setSelectedConvId(conv.conversationId)}
                    className={`w-full rounded-xl border p-3 text-start transition-colors cursor-pointer ${
                      active
                        ? 'border-[#d9a43b] bg-amber-50/40 dark:bg-[#0b1b3d]'
                        : 'border-slate-100 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {conv.patientName}
                      </span>
                      {conv.unreadByDoctor > 0 && (
                        <span className="rounded-md bg-[#0c3585] px-2 py-0.5 font-latin text-[11px] font-bold text-white tabular-nums">
                          {conv.unreadByDoctor}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {conv.lastMessageText || '—'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Thread View & Composer */}
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a] lg:col-span-8">
          {!activeConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              <MessageSquare className="mb-2 h-8 w-8 opacity-40" />
              <span>{mc.selectConversationPrompt}</span>
            </div>
          ) : (
            <>
              <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeConversation.patientName}
                </h3>
                {activeConversation.patientPhone && (
                  <p className="font-latin text-xs text-slate-500 tabular-nums" dir="ltr">
                    {activeConversation.patientPhone}
                  </p>
                )}
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto p-5 max-h-[400px]">
                {loadingMessages ? (
                  <p className="text-center text-xs text-slate-400">...</p>
                ) : (
                  messages.map((msg) => {
                    const fromClinic = msg.senderRole !== 'patient';
                    return (
                      <div
                        key={msg.messageId}
                        className={`flex ${fromClinic ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                            fromClinic
                              ? 'bg-[#0c3585] text-white'
                              : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                          }`}
                        >
                          <p className="text-[11px] font-bold opacity-80">
                            {msg.senderName}
                          </p>
                          {msg.text && <p className="mt-1 whitespace-pre-wrap">{msg.text}</p>}
                          {msg.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {msg.attachments.map((att, idx) =>
                                att.mimeType.startsWith('image/') ? (
                                  <ProtectedMediaButton
                                    key={idx}
                                    firebaseUser={firebaseUser}
                                    url={att.url}
                                    fileName={att.name}
                                    className="block cursor-pointer"
                                  >
                                    <ProtectedMediaImage
                                      firebaseUser={firebaseUser}
                                      url={att.url}
                                      alt={att.name}
                                      className="max-h-40 rounded-lg border border-white/20 object-cover"
                                    />
                                  </ProtectedMediaButton>
                                ) : (
                                  <ProtectedMediaButton
                                    key={idx}
                                    firebaseUser={firebaseUser}
                                    url={att.url}
                                    fileName={att.name}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-xs underline cursor-pointer"
                                  />
                                ),
                              )}
                            </div>
                          )}
                          <p className="mt-1 font-latin text-[10px] opacity-70 tabular-nums" dir="ltr">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={handleSend}
                className="border-t border-slate-100 p-4 dark:border-slate-800"
              >
                {attachments.length > 0 && (
                  <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {attachments.map((a) => a.name).join(' · ')}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <label
                    title={mc.attachFileBtn}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-300"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      className="sr-only"
                      onChange={(e) => void handleAttach(e.target.files)}
                    />
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={mc.typeMessagePlaceholder}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={sending || uploading || (!text.trim() && attachments.length === 0)}
                    className="medora-gold-button inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{mc.sendBtn}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  MessageSquarePlus,
  Paperclip,
  Send,
} from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import {
  fetchPatientLabMessages,
  fetchPatientMessages,
  openOrCreatePatientConversation,
  openOrCreatePatientLabConversation,
  sendPatientLabMessage,
  sendPatientMessage,
  uploadPatientStorageAsset,
} from '../../services/patientService';
import type { DoctorMessageRecord, PublicDoctorCard } from '../../types/doctor';
import type { LabConversationRecord, LabMessageRecord } from '../../types/lab';
import type { Language, UploadedDocMeta } from '../../types/medora';
import type { LabDirectoryCard, PatientWorkspaceData } from '../../types/patient';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import {
  ProtectedMediaButton,
  ProtectedMediaImage,
} from '../shared/ProtectedMedia';
import { MedoraMessagingPanel } from '../shared/MedoraMessagingPanel';

interface PatientMessagesSectionProps {
  firebaseUser: User;
  conversations: PatientWorkspaceData['conversations'];
  labConversations?: LabConversationRecord[];
  labs?: LabDirectoryCard[];
  initialChannel?: 'doctors' | 'labs' | 'pharmacies';
  initialLabConversationId?: string;
  doctors: PublicDoctorCard[];
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

export function PatientMessagesSection({
  firebaseUser,
  conversations,
  labConversations = [],
  labs = [],
  initialChannel = 'doctors',
  initialLabConversationId,
  doctors,
  language,
  onRefreshWorkspace,
}: PatientMessagesSectionProps) {
  const pm = PATIENT_TRANSLATIONS[language].messages;
  const isAr = language === 'ar';
  const [channel, setChannel] = useState<'doctors' | 'labs' | 'pharmacies'>(initialChannel);
  const [selectedConvId, setSelectedConvId] = useState<string>(
    conversations[0]?.conversationId || '',
  );
  const [selectedLabConvId, setSelectedLabConvId] = useState<string>(
    initialLabConversationId || labConversations[0]?.conversationId || '',
  );
  const [selectedLabUid, setSelectedLabUid] = useState('');
  const [labMessages, setLabMessages] = useState<LabMessageRecord[]>([]);
  const [selectedDoctorUid, setSelectedDoctorUid] = useState('');
  const [messages, setMessages] = useState<DoctorMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<UploadedDocMeta[]>(
    [],
  );
  const [uploadingFile, setUploadingFile] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagingDoctors = useMemo(
    () => doctors.filter((d) => d.allowPatientMessages !== false),
    [doctors],
  );

  useEffect(() => {
    if (!selectedConvId && conversations.length > 0) {
      setSelectedConvId(conversations[0].conversationId);
    }
  }, [conversations, selectedConvId]);

  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    fetchPatientMessages(firebaseUser, selectedConvId)
      .then((list) => {
        if (!active) return;
        setMessages(list);
        void onRefreshWorkspace();
      })
      .catch((err) => {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'MESSAGES_FAILED');
        }
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser, selectedConvId, onRefreshWorkspace]);

  const handleStartChat = async () => {
    if (!selectedDoctorUid) return;
    setErrorMsg(null);
    try {
      const res = await openOrCreatePatientConversation(
        firebaseUser,
        selectedDoctorUid,
      );
      setSelectedDoctorUid('');
      await onRefreshWorkspace();
      setSelectedConvId(res.conversation.conversationId);
      setMessages(res.messages || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CHAT_OPEN_FAILED');
    }
  };

  const handleAttachFile = async (file: File | undefined) => {
    if (!file || !selectedConvId) return;
    setUploadingFile(true);
    setErrorMsg(null);
    try {
      const meta = await uploadPatientStorageAsset(
        firebaseUser,
        'message_files',
        file,
        { conversationId: selectedConvId },
      );
      setPendingAttachments((prev) => [...prev, meta]);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedConvId) return;
    if (!text.trim() && pendingAttachments.length === 0) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const sent = await sendPatientMessage(firebaseUser, selectedConvId, {
        text: text.trim(),
        attachments: pendingAttachments,
      });
      setMessages((prev) => [...prev, sent]);
      setText('');
      setPendingAttachments([]);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SEND_FAILED');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (initialChannel) setChannel(initialChannel);
  }, [initialChannel]);

  useEffect(() => {
    if (initialLabConversationId) setSelectedLabConvId(initialLabConversationId);
  }, [initialLabConversationId]);

  useEffect(() => {
    if (!selectedLabConvId && labConversations.length > 0) {
      setSelectedLabConvId(labConversations[0].conversationId);
    }
  }, [labConversations, selectedLabConvId]);

  useEffect(() => {
    if (channel !== 'labs' || !selectedLabConvId) {
      return;
    }
    let active = true;
    setLoadingMessages(true);
    fetchPatientLabMessages(firebaseUser, selectedLabConvId)
      .then((list) => {
        if (!active) return;
        setLabMessages(list);
      })
      .catch((err) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : 'MESSAGES_FAILED');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [channel, firebaseUser, selectedLabConvId]);

  const activeConversation = conversations.find(
    (c) => c.conversationId === selectedConvId,
  );
  const activeLabConversation = labConversations.find(
    (c) => c.conversationId === selectedLabConvId,
  );

  const handleStartLabChat = async () => {
    if (!selectedLabUid) return;
    setErrorMsg(null);
    try {
      const conv = await openOrCreatePatientLabConversation(firebaseUser, selectedLabUid);
      setSelectedLabUid('');
      await onRefreshWorkspace();
      setSelectedLabConvId(conv.conversationId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CHAT_OPEN_FAILED');
    }
  };

  const handleAttachLabFile = async (file: File | undefined) => {
    if (!file || !selectedLabConvId) return;
    setUploadingFile(true);
    setErrorMsg(null);
    try {
      const meta = await uploadPatientStorageAsset(firebaseUser, 'message_files', file, {
        conversationId: selectedLabConvId,
      });
      setPendingAttachments((prev) => [...prev, meta]);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendLab = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLabConvId) return;
    if (!text.trim() && pendingAttachments.length === 0) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const sent = await sendPatientLabMessage(firebaseUser, selectedLabConvId, {
        text: text.trim(),
        attachments: pendingAttachments,
      });
      setLabMessages((prev) => [...prev, sent]);
      setText('');
      setPendingAttachments([]);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SEND_FAILED');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {pm.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {pm.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChannel('doctors')}
            className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
              channel === 'doctors'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {isAr ? 'الأطباء' : 'Doctors'}
          </button>
          <button
            type="button"
            onClick={() => setChannel('labs')}
            className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
              channel === 'labs'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {isAr ? 'المختبرات الطبية' : 'Laboratories'}
          </button>
          <button
            type="button"
            onClick={() => setChannel('pharmacies')}
            className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
              channel === 'pharmacies'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {isAr ? 'الصيدليات والشبكة' : 'Pharmacies & Network'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {channel === 'pharmacies' ? (
        <MedoraMessagingPanel
          firebaseUser={firebaseUser}
          lang={language}
          portalRole="patient"
        />
      ) : channel === 'labs' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <MessageSquarePlus className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                <span>{isAr ? 'بدء محادثة مع مختبر' : 'Start Chat with Lab'}</span>
              </p>
              <div className="space-y-2">
                <select
                  value={selectedLabUid}
                  onChange={(e) => setSelectedLabUid(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{isAr ? '— اختر المختبر —' : '— Select Lab —'}</option>
                  {labs.map((l) => (
                    <option key={l.labUid} value={l.labUid}>
                      {l.labNameAr}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedLabUid}
                  onClick={() => void handleStartLabChat()}
                  className="medora-gold-button min-h-[38px] w-full rounded-xl text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  {pm.startChatBtn}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-1.5 dark:border-slate-800 dark:bg-[#07122a]">
              {labConversations.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500">{pm.noConversations}</p>
              ) : (
                labConversations.map((conv) => {
                  const active = conv.conversationId === selectedLabConvId;
                  return (
                    <button
                      key={conv.conversationId}
                      type="button"
                      onClick={() => setSelectedLabConvId(conv.conversationId)}
                      className={`flex w-full items-start justify-between gap-2 rounded-xl p-3 text-start transition-colors cursor-pointer ${
                        active ? 'bg-[#0c3585] text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{conv.labNameAr}</p>
                        <p className={`mt-0.5 truncate text-[11px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                          {conv.lastMessagePreview || '—'}
                        </p>
                      </div>
                      {(conv.unreadByPatient || 0) > 0 && (
                        <span className="shrink-0 rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917]">
                          {conv.unreadByPatient}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-[460px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-8">
            {!activeLabConversation ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
                {pm.selectConversationPrompt}
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeLabConversation.labNameAr}
                  </h2>
                </div>
                <div className="my-4 flex-1 space-y-3 overflow-y-auto max-h-[380px] pe-1">
                  {loadingMessages ? (
                    <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ) : (
                    labMessages.map((msg) => {
                      const isPatient = msg.senderRole === 'patient';
                      return (
                        <div key={msg.messageId} className={`flex flex-col ${isPatient ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                              isPatient
                                ? 'bg-[#0c3585] text-white'
                                : 'border border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                            {msg.attachments?.map((att, idx) => (
                              <ProtectedMediaButton
                                key={`${msg.messageId}-att-${idx}`}
                                firebaseUser={firebaseUser}
                                url={att.url}
                                fileName={att.name}
                                label={att.name}
                                className="mt-1.5 flex items-center gap-1.5 text-xs font-bold underline cursor-pointer"
                              />
                            ))}
                          </div>
                          <span className="mt-1 font-latin text-[10px] text-slate-400 tabular-nums">
                            {msg.senderName} · {String(msg.createdAt || '').slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendLab} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pendingAttachments.map((att, idx) => (
                        <span key={idx} className="rounded-lg border px-2 py-1 text-xs">{att.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="flex h-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                      <Paperclip className="me-1.5 h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*,.heic,.heif,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          void handleAttachLabFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={pm.messagePlaceholder}
                      className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={sending || uploadingFile}
                      className="medora-gold-button inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      <span>{sending ? '...' : pm.sendBtn}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Conversations & Start Chat */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <MessageSquarePlus
                className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]"
                aria-hidden="true"
              />
              <span>{pm.newChatTitle}</span>
            </p>
            {messagingDoctors.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pm.noDoctorsAccepting}
              </p>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedDoctorUid}
                  onChange={(e) => setSelectedDoctorUid(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{pm.selectDoctorPlaceholder}</option>
                  {messagingDoctors.map((doc) => (
                    <option key={doc.doctorUid} value={doc.doctorUid}>
                      {doc.fullName} · {doc.clinicName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedDoctorUid}
                  onClick={() => void handleStartChat()}
                  className="medora-gold-button min-h-[38px] w-full rounded-xl text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  {pm.startChatBtn}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-1.5 dark:border-slate-800 dark:bg-[#07122a]">
            {conversations.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {pm.noConversations}
              </p>
            ) : (
              conversations.map((conv) => {
                const active = conv.conversationId === selectedConvId;
                return (
                  <button
                    key={conv.conversationId}
                    type="button"
                    onClick={() => setSelectedConvId(conv.conversationId)}
                    className={`flex w-full items-start justify-between gap-2 rounded-xl p-3 text-start transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0c3585] text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {conv.doctorAvatarUrl ? (
                        <img
                          src={conv.doctorAvatarUrl}
                          alt={conv.doctorName || 'Doctor'}
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 shrink-0 rounded-full border border-[#d9a43b]/40 object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]'
                          }`}
                        >
                          {(conv.doctorName || conv.clinicName || 'D').trim().charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">
                          {conv.doctorName || conv.clinicName || conv.doctorUid}
                        </p>
                        <p
                          className={`mt-0.5 truncate text-[11px] ${
                            active
                              ? 'text-slate-200'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {conv.lastMessageText || '—'}
                        </p>
                      </div>
                    </div>
                    {(conv.unreadByPatient || 0) > 0 && (
                      <span className="shrink-0 rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
                        {conv.unreadByPatient}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex min-h-[460px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-8">
          {!activeConversation ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {pm.selectConversationPrompt}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                {activeConversation.doctorAvatarUrl ? (
                  <img
                    src={activeConversation.doctorAvatarUrl}
                    alt={activeConversation.doctorName || 'Doctor'}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 shrink-0 rounded-full border border-[#d9a43b]/40 object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0c3585]/10 text-xs font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                    {(activeConversation.doctorName || activeConversation.clinicName || 'D')
                      .trim()
                      .charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {activeConversation.doctorName || activeConversation.clinicName}
                  </h2>
                  {activeConversation.clinicName && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {activeConversation.clinicName}
                    </p>
                  )}
                </div>
              </div>

              <div className="my-4 flex-1 space-y-3 overflow-y-auto max-h-[380px] pe-1">
                {loadingMessages ? (
                  <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                ) : (
                  messages.map((msg) => {
                    const isPatient = msg.senderRole === 'patient';
                    return (
                      <div
                        key={msg.messageId}
                        className={`flex flex-col ${
                          isPatient ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                            isPatient
                              ? 'bg-[#0c3585] text-white'
                              : 'border border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                          {msg.attachments?.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {msg.attachments.map((att, idx) => {
                                const isImg =
                                  (att.mimeType || '').startsWith('image/') ||
                                  /\.(jpe?g|png|webp)$/i.test(att.name || '');
                                return isImg ? (
                                  <div key={`${msg.messageId}-att-${idx}`} className="space-y-1">
                                    <ProtectedMediaImage
                                      firebaseUser={firebaseUser}
                                      url={att.url}
                                      alt={att.name}
                                      className="max-h-48 rounded-xl border border-white/15 object-contain"
                                    />
                                    <ProtectedMediaButton
                                      firebaseUser={firebaseUser}
                                      url={att.url}
                                      fileName={att.name}
                                      label={att.name}
                                      className={`inline-flex items-center gap-1 text-[11px] font-bold underline cursor-pointer ${
                                        isPatient
                                          ? 'text-white/90'
                                          : 'text-[#0c3585] dark:text-[#f4d378]'
                                      }`}
                                    />
                                  </div>
                                ) : (
                                  <ProtectedMediaButton
                                    key={`${msg.messageId}-att-${idx}`}
                                    firebaseUser={firebaseUser}
                                    url={att.url}
                                    fileName={att.name}
                                    label={att.name}
                                    className={`flex items-center gap-1.5 text-xs font-bold underline cursor-pointer ${
                                      isPatient
                                        ? 'text-white'
                                        : 'text-[#0c3585] dark:text-[#f4d378]'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <span className="mt-1 font-latin text-[10px] text-slate-400 tabular-nums">
                          {msg.senderName} · {msg.createdAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleSend} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingAttachments.map((att, idx) => (
                      <span
                        key={`${att.url}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {att.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="flex h-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                    <Paperclip className="me-1.5 h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {uploadingFile ? '...' : pm.attachFileBtn}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        void handleAttachFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={pm.messagePlaceholder}
                    className="min-h-[42px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={
                      sending || (!text.trim() && pendingAttachments.length === 0)
                    }
                    className="medora-gold-button inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>{sending ? '...' : pm.sendBtn}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

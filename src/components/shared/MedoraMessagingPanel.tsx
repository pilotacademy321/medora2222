import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import type { Language, UploadedDocMeta } from '../../types/medora';
import type {
  MedoraPartyRole,
  MedoraThread,
  MedoraThreadCategory,
  MedoraThreadMessage,
} from '../../types/commerce';
import {
  createOrOpenMessagingThread,
  fetchMessagingRecipients,
  fetchMessagingThreads,
  fetchThreadMessages,
  sendThreadMessage,
  uploadMessageAttachment,
  type MessagingRecipientOption,
} from '../../services/messagingService';

interface MedoraMessagingPanelProps {
  firebaseUser: User;
  lang: Language;
  portalRole: MedoraPartyRole;
  isAdminMonitor?: boolean;
  titleAr?: string;
  titleEn?: string;
  onUnreadCountChange?: (count: number) => void;
}

const ROLE_LABELS: Record<MedoraPartyRole, { ar: string; en: string }> = {
  patient: { ar: 'مراجع', en: 'Patient' },
  doctor: { ar: 'طبيب', en: 'Doctor' },
  pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
  wholesaler: { ar: 'مذخر أدوية', en: 'Wholesaler' },
  lab: { ar: 'مختبر', en: 'Lab' },
  super_admin: { ar: 'الإدارة العامة', en: 'Super Admin' },
};

const CATEGORY_LABELS: Record<MedoraThreadCategory, { ar: string; en: string }> = {
  patient_doctor: { ar: 'مراجع ↔ طبيب', en: 'Patient ↔ Doctor' },
  patient_pharmacy: { ar: 'مراجع ↔ صيدلية', en: 'Patient ↔ Pharmacy' },
  doctor_pharmacy: { ar: 'طبيب ↔ صيدلية', en: 'Doctor ↔ Pharmacy' },
  pharmacy_wholesaler: { ar: 'صيدلية ↔ مذخر', en: 'Pharmacy ↔ Wholesaler' },
  lab_doctor: { ar: 'مختبر ↔ طبيب', en: 'Lab ↔ Doctor' },
  patient_lab: { ar: 'مراجع ↔ مختبر', en: 'Patient ↔ Lab' },
  entity_admin: { ar: 'تواصل إداري مركزي', en: 'Central Platform Support' },
};

export const MedoraMessagingPanel: React.FC<MedoraMessagingPanelProps> = ({
  firebaseUser,
  lang,
  portalRole,
  isAdminMonitor = false,
  titleAr,
  titleEn,
  onUnreadCountChange,
}) => {
  const isAr = lang === 'ar';
  const [threads, setThreads] = useState<MedoraThread[]>([]);
  const [viewerUid, setViewerUid] = useState<string>(firebaseUser.uid);
  const [recipients, setRecipients] = useState<MessagingRecipientOption[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>('');
  const [messages, setMessages] = useState<MedoraThreadMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<UploadedDocMeta[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [selectedRecipientKey, setSelectedRecipientKey] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    setErrorMsg(null);
    try {
      const [thrData, recData] = await Promise.all([
        fetchMessagingThreads(firebaseUser, {
          role: portalRole,
          ...(isAdminMonitor ? { scope: 'admin' as const } : {}),
        }),
        fetchMessagingRecipients(firebaseUser, portalRole).catch(() => []),
      ]);
      setThreads(thrData.threads);
      setViewerUid(thrData.viewerUid);
      setRecipients(recData);
      onUnreadCountChange?.(thrData.totalUnread);
      if (!activeThreadId && thrData.threads.length > 0) {
        setActiveThreadId(thrData.threads[0].threadId);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'FAILED_TO_LOAD_THREADS');
    } finally {
      setLoadingThreads(false);
    }
  }, [activeThreadId, firebaseUser, isAdminMonitor, onUnreadCountChange, portalRole]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!threadId) return;
      setLoadingMessages(true);
      try {
        const res = await fetchThreadMessages(firebaseUser, threadId, portalRole);
        setMessages(res.messages);
        setThreads((prev) =>
          prev.map((t) => (t.threadId === threadId ? res.thread : t)),
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'FAILED_TO_LOAD_MESSAGES');
      } finally {
        setLoadingMessages(false);
      }
    },
    [firebaseUser, portalRole],
  );

  useEffect(() => {
    if (activeThreadId) {
      void loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const filteredThreads = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const names = (t.participants || []).map((p) => p.name).join(' ');
      return [t.subject, t.lastMessageText, names, t.transactionRef?.number || '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [searchQ, threads]);

  const activeThread = useMemo(
    () => threads.find((t) => t.threadId === activeThreadId) || null,
    [activeThreadId, threads],
  );

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingFile(true);
    setErrorMsg(null);
    try {
      const meta = await uploadMessageAttachment(firebaseUser, file);
      setComposerAttachments((prev) => [...prev.slice(0, 4), meta]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPLOAD_FAILED');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread) return;
    const text = composerText.trim();
    if (!text && composerAttachments.length === 0) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await sendThreadMessage(firebaseUser, activeThread.threadId, {
        senderRole: portalRole,
        body: text,
        attachments: composerAttachments,
      });
      setMessages((prev) => [...prev, res.message]);
      setThreads((prev) =>
        prev.map((t) => (t.threadId === activeThread.threadId ? res.thread : t)),
      );
      setComposerText('');
      setComposerAttachments([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'MESSAGE_SEND_FAILED');
    } finally {
      setSending(false);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = recipients.find((r) => `${r.uid}_${r.category}` === selectedRecipientKey);
    if (!target || !newBody.trim()) return;
    setCreatingThread(true);
    setErrorMsg(null);
    try {
      const res = await createOrOpenMessagingThread(firebaseUser, {
        senderRole: portalRole,
        category: target.category,
        recipientUid: target.uid,
        recipientRole: target.role,
        subject: newSubject.trim() || target.name,
        body: newBody.trim(),
      });
      setThreads((prev) => [
        res.thread,
        ...prev.filter((t) => t.threadId !== res.thread.threadId),
      ]);
      setActiveThreadId(res.thread.threadId);
      setMessages([res.message]);
      setNewModalOpen(false);
      setNewSubject('');
      setNewBody('');
      setSelectedRecipientKey('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'THREAD_CREATE_FAILED');
    } finally {
      setCreatingThread(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 dark:bg-[#d9a43b]/15 text-[#0c3585] dark:text-[#f4d378]">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? titleAr || 'مركز المراسلات الموحّد — MEDORA' : titleEn || 'MEDORA Unified Messaging'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'محادثات فورية مؤمّنة ومربوطة بالصلاحيات والطلبات والمرفقات.'
                : 'Permission-enforced clinical & commercial conversations with attachments.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadThreads()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingThreads ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="medora-gold-button inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {isAr ? 'محادثة جديدة' : 'New Message'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Threads Sidebar */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-hidden flex flex-col min-h-[460px] max-h-[620px]">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={isAr ? 'بحث في المحادثات...' : 'Search conversations...'}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 ps-9 pe-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3585]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
            {loadingThreads && threads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#0c3585]" />
                {isAr ? 'جاري تحميل المحادثات...' : 'Loading conversations...'}
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {isAr ? 'لا توجد محادثات مطابقة حالياً.' : 'No conversations found yet.'}
              </div>
            ) : (
              filteredThreads.map((t) => {
                const otherParticipants = (t.participants || []).filter((p) => p.uid !== viewerUid);
                const headline =
                  otherParticipants.length > 0
                    ? otherParticipants.map((p) => p.name).join(' · ')
                    : t.subject;
                const unread = Number((t.unreadCountByUid || {})[viewerUid] || 0);
                const selected = t.threadId === activeThreadId;
                const catLabel = CATEGORY_LABELS[t.category];
                return (
                  <button
                    key={t.threadId}
                    type="button"
                    onClick={() => setActiveThreadId(t.threadId)}
                    className={`w-full text-start p-3.5 transition cursor-pointer ${
                      selected
                        ? 'bg-[#0c3585]/10 dark:bg-[#0c3585]/30 border-s-4 border-[#d9a43b]'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {headline}
                      </p>
                      {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-[#d9a43b] px-2 py-0.5 text-[10px] font-bold text-[#040917]">
                          {unread}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium text-[#0c3585] dark:text-[#f4d378] truncate">
                      {catLabel ? (isAr ? catLabel.ar : catLabel.en) : t.category}
                      {t.transactionRef?.number ? ` · #${t.transactionRef.number}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {t.lastMessageText}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active Conversation Pane */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] flex flex-col min-h-[460px] max-h-[620px]">
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {isAr ? 'اختر محادثة أو ابدأ مراسلة جديدة' : 'Select a conversation or start a new one'}
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeThread.participants.map((p) => p.name).join(' ↔ ')}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeThread.subject}
                    {activeThread.transactionRef?.number
                      ? ` · ${isAr ? 'مرجع' : 'Ref'}: ${activeThread.transactionRef.number}`
                      : ''}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {CATEGORY_LABELS[activeThread.category]
                    ? isAr
                      ? CATEGORY_LABELS[activeThread.category].ar
                      : CATEGORY_LABELS[activeThread.category].en
                    : activeThread.category}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 dark:bg-[#040a1a]/60">
                {loadingMessages ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#0c3585]" />
                    {isAr ? 'جاري تحميل الرسائل...' : 'Loading messages...'}
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.senderUid === viewerUid;
                    return (
                      <div
                        key={m.messageId}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isMine
                              ? 'bg-[#0c3585] text-white'
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <span
                              className={`text-[10px] font-bold ${
                                isMine ? 'text-[#f4d378]' : 'text-[#0c3585] dark:text-[#f4d378]'
                              }`}
                            >
                              {m.senderName} ({isAr ? ROLE_LABELS[m.senderRole]?.ar : ROLE_LABELS[m.senderRole]?.en})
                            </span>
                            <span className={`text-[10px] ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                              {String(m.createdAt || '').slice(11, 16)}
                            </span>
                          </div>
                          {m.body && (
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.body}</p>
                          )}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {m.attachments.map((att, idx) => (
                                <a
                                  key={`${att.url}_${idx}`}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                                    isMine
                                      ? 'bg-white/10 text-white hover:bg-white/20'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                                  }`}
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{att.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2"
              >
                {composerAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {composerAttachments.map((att, idx) => (
                      <span
                        key={`${att.url}_${idx}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-200"
                      >
                        <FileText className="h-3 w-3" />
                        <span className="max-w-[140px] truncate">{att.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setComposerAttachments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-rose-500 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleAttachFile}
                  />
                  <button
                    type="button"
                    disabled={uploadingFile || sending}
                    onClick={() => fileInputRef.current?.click()}
                    title={isAr ? 'إرفاق ملف أو صورة' : 'Attach image or PDF'}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {uploadingFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="text"
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={isAr ? 'اكتب رسالتك هنا...' : 'Write your message...'}
                    className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0c3585]"
                  />
                  <button
                    type="submit"
                    disabled={sending || (!composerText.trim() && composerAttachments.length === 0)}
                    className="medora-gold-button inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {isAr ? 'إرسال' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <form
            onSubmit={handleCreateThread}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'بدء محادثة جديدة' : 'Start New Conversation'}
              </h3>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'الطرف المستلم (المسموح حسب الصلاحية)' : 'Recipient'}
              </label>
              <select
                required
                value={selectedRecipientKey}
                onChange={(e) => setSelectedRecipientKey(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-white"
              >
                <option value="">{isAr ? '-- اختر جهة التواصل --' : '-- Select Recipient --'}</option>
                {recipients.map((r) => (
                  <option key={`${r.uid}_${r.category}`} value={`${r.uid}_${r.category}`}>
                    {r.name} ({isAr ? ROLE_LABELS[r.role]?.ar : ROLE_LABELS[r.role]?.en})
                    {r.subtitle ? ` — ${r.subtitle}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'موضوع المحادثة' : 'Subject'}
              </label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder={isAr ? 'مثال: استفسار حول تجهيز طلب...' : 'e.g. Order inquiry...'}
                className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isAr ? 'نص الرسالة' : 'Message'}
              </label>
              <textarea
                required
                rows={3}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder={isAr ? 'اكتب رسالتك...' : 'Write your message...'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={creatingThread || !selectedRecipientKey || !newBody.trim()}
                className="medora-gold-button inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {creatingThread && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isAr ? 'إرسال وفتح المحادثة' : 'Send & Open'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

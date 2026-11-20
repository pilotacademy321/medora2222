import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  FlaskConical,
  Maximize2,
  Paperclip,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  createHaneenConversation,
  deleteHaneenConversation,
  fetchHaneenBootstrap,
  sendHaneenChatMessageStream,
  updateHaneenConsent,
} from '../../services/haneenService';
import type {
  HaneenBootstrapResponse,
  HaneenCitation,
  HaneenConversation,
  HaneenDetailLevel,
  HaneenExtractedLabReport,
  HaneenLabComparisonStatus,
  HaneenMessage,
  HaneenUploadedAttachment,
} from '../../types/haneen';
import type { Language } from '../../types/medora';
import type { PatientWorkspaceData } from '../../types/patient';
import { HaneenAvatar, HaneenSpeakingIndicator } from './HaneenAvatar';

const MAX_UPLOAD_FILES = 4;
const MAX_PDF_BYTES = 3.5 * 1024 * 1024;
const MAX_RAW_IMAGE_BYTES = 12 * 1024 * 1024;
const COMPRESS_IMAGE_THRESHOLD_BYTES = 2.2 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function normalizeClientMimeType(file: File): string {
  const raw = (file.type || '').toLowerCase().split(';')[0].trim();
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  if (ALLOWED_UPLOAD_MIME_TYPES.has(raw)) return raw;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return raw;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

async function prepareAttachmentForVision(file: File): Promise<HaneenUploadedAttachment> {
  const mimeType = normalizeClientMimeType(file);
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new Error('UNSUPPORTED_TYPE');
  }
  if (mimeType === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error('PDF_TOO_LARGE');
    }
    const dataUrl = await readBlobAsDataUrl(file);
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { base64Data, mimeType, fileName: file.name };
  }

  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  if (file.size <= COMPRESS_IMAGE_THRESHOLD_BYTES || typeof document === 'undefined') {
    const dataUrl = await readBlobAsDataUrl(file);
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { base64Data, mimeType, fileName: file.name };
  }

  // Compress large camera photos cleanly while keeping crisp lab-text resolution (up to 2048px)
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
      el.src = objectUrl;
    });
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const dataUrl = await readBlobAsDataUrl(file);
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      return { base64Data, mimeType, fileName: file.name };
    }
    ctx.drawImage(img, 0, 0, width, height);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    if (dataUrl.length > 4.6 * 1024 * 1024) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.74);
    }
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return {
      base64Data,
      mimeType: 'image/jpeg',
      fileName: file.name,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getComparisonBadgeMeta(
  status: HaneenLabComparisonStatus,
  isAr: boolean,
): { label: string; className: string } {
  switch (status) {
    case 'within_range':
      return {
        label: isAr ? 'ضمن المجال المطبوع' : 'Within Range',
        className:
          'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/60 dark:text-emerald-200',
      };
    case 'above_range':
      return {
        label: isAr ? 'أعلى من المجال' : 'Above Range',
        className:
          'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700/70 dark:bg-rose-950/60 dark:text-rose-200',
      };
    case 'below_range':
      return {
        label: isAr ? 'أقل من المجال' : 'Below Range',
        className:
          'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/60 dark:text-amber-200',
      };
    case 'qualitative':
      return {
        label: isAr ? 'نتيجة نوعية' : 'Qualitative',
        className:
          'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700/70 dark:bg-violet-950/60 dark:text-violet-200',
      };
    case 'unreadable':
      return {
        label: isAr ? 'غير مقروء' : 'Unreadable',
        className:
          'border-slate-300 bg-slate-200 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
      };
    default:
      return {
        label: isAr ? 'غير محدد' : 'Undetermined',
        className:
          'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      };
  }
}

function ExtractedLabReportCard({
  report,
  isAr,
}: {
  report: HaneenExtractedLabReport;
  isAr: boolean;
}) {
  if (!report.rows || report.rows.length === 0) return null;

  const labName = report.reportHeader?.labName;
  const reportDate = report.reportHeader?.reportDate;

  return (
    <div className="mb-3.5 overflow-hidden rounded-xl border border-[#0c3585]/20 bg-white shadow-xs dark:border-[#d9a43b]/30 dark:bg-[#061028]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-[#09183a]">
        <div className="flex flex-wrap items-center gap-2 font-bold text-[#0c3585] dark:text-[#f4d378]">
          <FlaskConical className="h-4 w-4 shrink-0" />
          <span>
            {isAr ? 'النتائج المستخرجة من التقرير المرفق' : 'Extracted Lab Report Table'}
          </span>
          {labName && (
            <span className="font-normal text-slate-600 dark:text-slate-300">
              · {labName}
            </span>
          )}
          {reportDate && (
            <span className="font-latin font-normal text-slate-600 dark:text-slate-300" dir="ltr">
              · {reportDate}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          {report.pagesDetected > 1 && (
            <span className="rounded-md bg-slate-200/80 px-2 py-0.5 dark:bg-slate-800">
              {isAr ? `${report.pagesDetected} صفحات` : `${report.pagesDetected} pages`}
            </span>
          )}
        </div>
      </div>

      {report.hasCriticalFlag && (
        <div className="flex items-start gap-2 border-b border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
          <span>
            {isAr
              ? 'تنبيه مهم: التقرير يحتوي على مؤشر حرج (Critical). يُنصح بمراجعة الطبيب أو الطوارئ فوراً.'
              : 'Urgent Notice: A Critical flag is printed on this report. Contact your doctor or urgent care immediately.'}
          </span>
        </div>
      )}

      {(report.imageClarity === 'partially_unclear' || report.clarityNoteAr || (report.nonReadableNotes && report.nonReadableNotes.length > 0)) && (
        <div className="border-b border-amber-200 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100">
          {report.clarityNoteAr ||
            report.nonReadableNotes?.join(' · ') ||
            (isAr
              ? 'بعض الحقول في الصورة لم تكن واضحة تماماً، وما تم تخمين أي رقم غير مقروء.'
              : 'Some fields were partially unclear and were not guessed.')}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] border-collapse text-xs sm:text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/80 text-start font-bold text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
              <th className="px-3 py-2 text-start">{isAr ? 'التحليل' : 'Test'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'النتيجة' : 'Value'}</th>
              <th className="px-3 py-2 text-start">{isAr ? 'الوحدة' : 'Unit'}</th>
              <th className="px-3 py-2 text-start">
                {isAr ? 'المجال المرجعي المطبوع' : 'Printed Reference'}
              </th>
              <th className="px-3 py-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
            {report.rows.map((row, idx) => {
              const badge = getComparisonBadgeMeta(row.comparisonStatus, isAr);
              const displayLabel =
                row.shortName && !row.testName.includes(row.shortName)
                  ? `${row.testName} (${row.shortName})`
                  : row.testName;
              return (
                <tr
                  key={`${row.testName}_${idx}`}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2 font-bold text-slate-950 dark:text-white">
                    {displayLabel}
                  </td>
                  <td
                    className="px-3 py-2 font-latin font-extrabold text-slate-950 tabular-nums dark:text-white"
                    dir="ltr"
                  >
                    {row.value === 'unreadable'
                      ? isAr
                        ? 'غير مقروء'
                        : 'Unreadable'
                      : row.value}
                  </td>
                  <td
                    className="px-3 py-2 font-latin text-slate-700 dark:text-slate-300"
                    dir="ltr"
                  >
                    {row.unit === 'not_printed' ? (isAr ? '—' : '—') : row.unit}
                  </td>
                  <td
                    className="px-3 py-2 font-latin text-slate-700 dark:text-slate-300"
                    dir="ltr"
                  >
                    {row.referenceRange === 'not_printed'
                      ? isAr
                        ? 'غير مطبوع بالتقرير'
                        : 'Not printed'
                      : row.referenceRange}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {row.labFlag && (
                        <span className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-latin text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          {row.labFlag}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderInlineBoldSegments(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-extrabold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?[\s:|-]+\|[\s:|-]*$/.test(trimmed) && trimmed.includes('-');
}

function parsePipeCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((c) => c.trim());
}

function FormattedAssistantMessage({
  text,
  hideTables,
}: {
  text: string;
  hideTables: boolean;
}) {
  const lines = text.split(/\r?\n/);
  const blocks: Array<
    | { type: 'text'; lines: string[] }
    | { type: 'table'; headers: string[]; rows: string[][] }
  > = [];

  let i = 0;
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: 'text', lines: textBuffer });
      textBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    if (line.trim().startsWith('|') && isMarkdownTableSeparator(nextLine)) {
      flushText();
      const headers = parsePipeCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!isMarkdownTableSeparator(lines[i])) {
          rows.push(parsePipeCells(lines[i]));
        }
        i += 1;
      }
      if (!hideTables && headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }
    textBuffer.push(line);
    i += 1;
  }
  flushText();

  return (
    <div className="space-y-2.5 text-slate-950 dark:text-white">
      {blocks.map((block, bIdx) => {
        if (block.type === 'table') {
          return (
            <div
              key={bIdx}
              className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#061028]"
            >
              <table className="w-full min-w-[460px] border-collapse text-xs sm:text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-start font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 text-start">
                        {renderInlineBoldSegments(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {block.rows.map((r, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                      {block.headers.map((_, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-slate-800 dark:text-slate-100">
                          {renderInlineBoldSegments(r[cIdx] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const joined = block.lines.join('\n').trim();
        if (!joined) return null;
        return (
          <div key={bIdx} className="whitespace-pre-wrap">
            {renderInlineBoldSegments(joined)}
          </div>
        );
      })}
    </div>
  );
}

interface PatientHaneenSectionProps {
  firebaseUser: User;
  workspace: PatientWorkspaceData;
  language: Language;
  initialResultId?: string | null;
  onConsumedInitialResult?: () => void;
  compactModal?: boolean;
  onExpandFull?: () => void;
}

const QUICK_PROMPTS_AR = [
  {
    label: 'شنو يعني الهيموغلوبين؟',
    prompt: 'بالتقرير مكتوب الهيموغلوبين نازل، شنو يعني هذا؟',
  },
  {
    label: 'نتيجة التحليل طالعة H مرتفعة',
    prompt: 'نتيجة التحليل طالعة H مرتفعة، شنو يعني؟',
  },
  {
    label: 'تقرير الرنين كاتب انزلاق غضروفي',
    prompt: 'تقرير الرنين كاتب انزلاق غضروفي خفيف، شنو يعني؟',
  },
  {
    label: 'فهم السكر التراكمي HbA1c ببساطة',
    prompt: 'شنو فحص HbA1c وشلون يختلف عن فحص السكر العادي؟',
  },
  {
    label: 'تحليل الإدرار (البول) والتحضير للتحاليل',
    prompt: 'شنو يبيّن تحليل الإدرار العام وهل الأكل والصيام يأثرون على التحليل؟',
  },
  {
    label: 'مبادئ الأكل الصحي المتوازن (WHO)',
    prompt: 'شنو هي المبادئ العامة للأكل الصحي المتوازن حسب منظمة الصحة العالمية؟',
  },
];

const QUICK_PROMPTS_EN = [
  {
    label: 'Say Hello to Haneen',
    prompt: 'Hello Haneen',
  },
  {
    label: 'Understand CBC Blood Test',
    prompt: 'What are the main components of a Complete Blood Count (CBC) test and what do they measure?',
  },
  {
    label: 'What is HbA1c?',
    prompt: 'What is the HbA1c test and how does it differ from a daily blood glucose reading?',
  },
  {
    label: 'Reference Ranges & Units',
    prompt: 'What does a lab reference range mean, and does an out-of-range number always mean a disease?',
  },
  {
    label: 'Lab Test Preparation & Fasting',
    prompt: 'How should I prepare for lab tests and what factors like fasting affect results?',
  },
  {
    label: 'WHO Healthy Diet Principles',
    prompt: 'What are the general healthy diet principles recommended by the World Health Organization?',
  },
];

function dedupeMessagesById(list: HaneenMessage[]): HaneenMessage[] {
  const seen = new Set<string>();
  const out: HaneenMessage[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (!item?.messageId || seen.has(item.messageId)) continue;
    seen.add(item.messageId);
    out.push(item);
  }
  out.reverse();
  return out;
}

export function PatientHaneenSection({
  firebaseUser,
  workspace,
  language,
  initialResultId,
  onConsumedInitialResult,
  compactModal = false,
  onExpandFull,
}: PatientHaneenSectionProps) {
  const isAr = language === 'ar';
  const prefersReducedMotion = useReducedMotion();

  const [bootstrap, setBootstrap] = useState<HaneenBootstrapResponse | null>(null);
  const [conversations, setConversations] = useState<HaneenConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [messages, setMessages] = useState<HaneenMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [togglingConsent, setTogglingConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [selectedResultId, setSelectedResultId] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [uploadedAttachments, setUploadedAttachments] = useState<HaneenUploadedAttachment[]>([]);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadWorkspace = useCallback(
    async (convId?: string) => {
      setErrorMsg(null);
      try {
        const data = await fetchHaneenBootstrap(firebaseUser, convId);
        setBootstrap(data);
        setConversations(data.conversations);
        setActiveConvId(data.activeConversationId || '');
        setMessages(dedupeMessagesById(data.messages));
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : isAr
              ? 'تعذر تحميل مساحة حنين الذكية.'
              : 'Unable to load HANEEN AI workspace.',
        );
      }
    },
    [firebaseUser, isAr],
  );

  useEffect(() => {
    setLoading(true);
    void loadWorkspace().finally(() => setLoading(false));
  }, [loadWorkspace]);

  useEffect(() => {
    if (initialResultId) {
      setSelectedResultId(initialResultId);
      setInputText(
        isAr
          ? 'ممكن توضيح قيم هذه النتيجة المخبرية والمدى المرجعي المطبوع بكلام عراقي بسيط.'
          : 'Please explain the values and printed reference ranges of this lab result in simple terms.',
      );
      onConsumedInitialResult?.();
    }
  }, [initialResultId, isAr, onConsumedInitialResult]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const activeConversation = conversations.find((c) => c.conversationId === activeConvId) || null;
  const consentGiven = Boolean(activeConversation?.consentGiven);

  const handleSelectConversation = async (convId: string) => {
    setSelectedResultId('');
    setSelectedFileId('');
    setUploadedAttachments([]);
    await loadWorkspace(convId);
  };

  const handleNewConversation = async () => {
    setErrorMsg(null);
    try {
      const conv = await createHaneenConversation(
        firebaseUser,
        isAr ? 'محادثة تثقيفية جديدة' : 'New Haneen Chat',
      );
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv.conversationId);
      setMessages([]);
      setSelectedResultId('');
      setSelectedFileId('');
      setUploadedAttachments([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CREATE_FAILED');
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeConvId) return;
    setErrorMsg(null);
    try {
      await deleteHaneenConversation(firebaseUser, activeConvId);
      setSelectedResultId('');
      setSelectedFileId('');
      setUploadedAttachments([]);
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'DELETE_FAILED');
    }
  };

  const handleToggleConsent = async () => {
    if (!activeConvId) return;
    setTogglingConsent(true);
    setErrorMsg(null);
    const nextConsent = !consentGiven;
    try {
      const updated = await updateHaneenConsent(firebaseUser, activeConvId, {
        consentGiven: nextConsent,
        sharedResultIds: nextConsent && selectedResultId ? [selectedResultId] : [],
        sharedFileIds: nextConsent && selectedFileId ? [selectedFileId] : [],
      });
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === updated.conversationId ? updated : c)),
      );
      if (!nextConsent) {
        setSelectedResultId('');
        setSelectedFileId('');
        setUploadedAttachments([]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CONSENT_UPDATE_FAILED');
    } finally {
      setTogglingConsent(false);
    }
  };

  const handleChooseFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);

    const remainingSlots = MAX_UPLOAD_FILES - uploadedAttachments.length;
    if (remainingSlots <= 0) {
      setErrorMsg(
        isAr
          ? `الحد الأقصى هو ${MAX_UPLOAD_FILES} صور أو ملفات في الرسالة الواحدة.`
          : `Maximum ${MAX_UPLOAD_FILES} files per message.`,
      );
      return;
    }

    const picked = Array.from(fileList).slice(0, remainingSlots);
    setPreparingAttachments(true);
    try {
      const nextItems: HaneenUploadedAttachment[] = [];
      for (const file of picked) {
        try {
          const prepared = await prepareAttachmentForVision(file);
          nextItems.push(prepared);
        } catch (err) {
          const code = err instanceof Error ? err.message : 'PREPARE_FAILED';
          if (code === 'UNSUPPORTED_TYPE') {
            setErrorMsg(
              isAr
                ? 'يُسمح فقط برفع صور التقارير (JPG/PNG/WebP) أو ملفات PDF.'
                : 'Only JPG/PNG/WebP images or PDF reports are supported.',
            );
          } else if (code === 'PDF_TOO_LARGE') {
            setErrorMsg(
              isAr
                ? 'حجم ملف PDF يتجاوز 3.5 ميغابايت.'
                : 'PDF file exceeds 3.5 MB limit.',
            );
          } else {
            setErrorMsg(
              isAr
                ? 'تعذر تجهيز أحد الملفات المرفقة أو يتجاوز حجمه الحد المسموح.'
                : 'Unable to prepare attached file or size exceeds limit.',
            );
          }
        }
      }
      if (nextItems.length > 0) {
        setUploadedAttachments((prev) => [...prev, ...nextItems].slice(0, MAX_UPLOAD_FILES));
      }
    } finally {
      setPreparingAttachments(false);
    }
  };

  const handleSend = async (
    e?: FormEvent,
    overridePrompt?: string,
    overrideDetailLevel?: HaneenDetailLevel,
  ) => {
    if (e) e.preventDefault();
    const messageToSend = (overridePrompt ?? inputText).trim();
    if (
      !activeConvId ||
      (!messageToSend && !selectedResultId && !selectedFileId && uploadedAttachments.length === 0)
    ) {
      return;
    }

    if ((selectedResultId || selectedFileId || uploadedAttachments.length > 0) && !consentGiven) {
      setErrorMsg(
        isAr
          ? 'يرجى تفعيل مفتاح الموافقة الصريحة أعلاه أولاً للسماح لحنين بالاطلاع على النتيجة أو الملف المرفق.'
          : 'Please enable the explicit consent toggle above before attaching any lab result or medical file.',
      );
      return;
    }

    const attachmentsToSend = uploadedAttachments;
    const resultIdToSend = selectedResultId;
    const fileIdToSend = selectedFileId;
    const nowTag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticId = `optimistic_${nowTag}`;
    const streamMsgId = `optimistic_ai_${nowTag}`;
    const optimisticText =
      messageToSend ||
      (isAr ? 'ممكن توضيح هذا التقرير بكلام عراقي بسيط.' : 'Please explain this report in simple terms.');

    const optimisticUserMsg: HaneenMessage = {
      messageId: optimisticId,
      conversationId: activeConvId,
      patientUid: firebaseUser.uid,
      role: 'user',
      text: optimisticText,
      attachedReportSummary:
        attachmentsToSend.length > 0
          ? {
              kind:
                attachmentsToSend[0].mimeType === 'application/pdf'
                  ? 'medical_file'
                  : 'uploaded_image',
              label:
                attachmentsToSend.length === 1
                  ? attachmentsToSend[0].fileName
                  : isAr
                    ? `${attachmentsToSend.length} ملفات/صور مرفقة (${attachmentsToSend
                        .map((f) => f.fileName)
                        .join('، ')})`
                    : `${attachmentsToSend.length} files attached (${attachmentsToSend
                        .map((f) => f.fileName)
                        .join(', ')})`,
              attachmentsCount: attachmentsToSend.length,
            }
          : resultIdToSend
            ? {
                kind: 'lab_result',
                label: isAr ? 'نتيجة مختبرية مرفقة' : 'Attached Lab Result',
              }
            : fileIdToSend
              ? {
                  kind: 'medical_file',
                  label: isAr ? 'ملف طبي مرفق' : 'Attached Medical File',
                }
              : null,
      citations: [],
      createdAt: new Date().toISOString(),
    };

    // Optimistic instant display in feed & crisp input clear
    setMessages((prev) => dedupeMessagesById([...prev, optimisticUserMsg]));
    if (!overridePrompt) setInputText('');
    setUploadedAttachments([]);
    setSending(true);
    setErrorMsg(null);

    try {
      const res = await sendHaneenChatMessageStream(
        firebaseUser,
        {
          conversationId: activeConvId,
          message: messageToSend,
          ...(overrideDetailLevel ? { detailLevel: overrideDetailLevel } : {}),
          ...(resultIdToSend ? { attachedResultId: resultIdToSend } : {}),
          ...(fileIdToSend ? { attachedFileId: fileIdToSend } : {}),
          ...(attachmentsToSend.length > 0
            ? { uploadedAttachments: attachmentsToSend }
            : {}),
        },
        {
          onMeta: (meta) => {
            setMessages((prev) =>
              dedupeMessagesById([
                ...prev.filter(
                  (m) =>
                    m.messageId !== optimisticId &&
                    m.messageId !== streamMsgId &&
                    m.messageId !== meta.userMessage.messageId,
                ),
                meta.userMessage,
                {
                  messageId: streamMsgId,
                  conversationId: activeConvId,
                  patientUid: firebaseUser.uid,
                  role: 'assistant',
                  text: '',
                  extractedReport: meta.extractedReport ?? null,
                  isEmergency: meta.isEmergency,
                  isRefusal: meta.isRefusal,
                  isFastReply: meta.isFastReply,
                  isCached: meta.isCached,
                  detailLevel: meta.detailLevel,
                  citations: meta.citations || [],
                  createdAt: new Date().toISOString(),
                },
              ]),
            );
          },
          onChunk: (accumulatedText) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === streamMsgId ? { ...m, text: accumulatedText } : m,
              ),
            );
          },
        },
      );

      setMessages((prev) =>
        dedupeMessagesById([
          ...prev.filter(
            (m) =>
              m.messageId !== optimisticId &&
              m.messageId !== streamMsgId &&
              m.messageId !== res.userMessage.messageId &&
              m.messageId !== res.assistantMessage.messageId,
          ),
          res.userMessage,
          res.assistantMessage,
        ]),
      );
      setConversations((prev) =>
        prev.map((c) => (c.conversationId === res.conversation.conversationId ? res.conversation : c)),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.filter((m) => m.messageId !== optimisticId && m.messageId !== streamMsgId),
      );
      if (!overridePrompt && messageToSend) setInputText(messageToSend);
      if (attachmentsToSend.length > 0) setUploadedAttachments(attachmentsToSend);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر إرسال الرسالة إلى حنين.'
            : 'Unable to send message to Haneen.',
      );
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        {isAr ? 'جاري تجهيز حنين الذكية HANEEN AI...' : 'Loading HANEEN AI assistant...'}
      </div>
    );
  }

  const publishedResults = workspace.publishedLabResults || [];
  const personalFiles = workspace.medicalFiles || [];
  const sourcesMetadata: HaneenCitation[] = bootstrap?.sourcesMetadata || [];
  const isEnabled = bootstrap?.settings.enabled !== false;
  const allowUpload = bootstrap?.settings.allowReportAttachment !== false;

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={compactModal ? 'space-y-4' : 'space-y-5'}
    >
      {/* Persistent Medical Disclaimer & Header */}
      <section className="rounded-2xl border border-[#0c3585]/20 bg-white p-4 shadow-sm dark:border-[#d9a43b]/25 dark:bg-[#07122a] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <HaneenAvatar
              size={compactModal ? 'md' : 'lg'}
              isSpeakingOrTyping={sending}
              language={language}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className={`font-extrabold text-slate-950 dark:text-white ${
                    compactModal ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
                  }`}
                >
                  {isAr ? 'حنين الذكية — المساعد التثقيفي للمريض' : 'HANEEN AI — Patient Health Assistant'}
                </h1>
                <span className="rounded-md border border-[#d9a43b]/40 bg-[#d9a43b]/15 px-2.5 py-0.5 text-xs font-bold text-[#9a6b16] dark:text-[#f4d378]">
                  {isAr ? 'للمريض فقط' : 'Patient Portal Only'}
                </span>
                {sending && <HaneenSpeakingIndicator language={language} />}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                {isAr
                  ? 'تشرح نتائج التحاليل وتقارير الأشعة والمصطلحات الطبية باللهجة العراقية البسيطة استناداً إلى مصادر MedlinePlus ومنظمة الصحة العالمية وMSD وRadiologyInfo.'
                  : 'Explains your lab results, radiology report terms, and medical concepts in simple language based on MedlinePlus, WHO, MSD, and RadiologyInfo.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onExpandFull && (
              <button
                type="button"
                onClick={onExpandFull}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-violet-400/50 bg-violet-500/10 px-3.5 text-sm font-bold text-violet-800 hover:bg-violet-500/20 dark:border-violet-400/40 dark:text-[#f4d378] cursor-pointer"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                <span>{isAr ? 'فتح الصفحة الكاملة' : 'Full View'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSourcesModal(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <BookOpen className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <span>
                {isAr
                  ? `المصادر المعتمدة (${sourcesMetadata.length})`
                  : `Verified Sources (${sourcesMetadata.length})`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handleNewConversation()}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#040917] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isAr ? 'محادثة جديدة' : 'New Chat'}</span>
            </button>
          </div>
        </div>

        {/* Fixed Educational Medical Disclaimer */}
        <div
          role="note"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300/80 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-50"
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="font-bold">
              {isAr
                ? 'تنبيه طبي مهم: حنين مساعد تثقيفي ذكي وليست طبيباً ولا تُصدر تشخيصاً أو وصفة دوائية.'
                : 'Important Medical Disclaimer: HANEEN AI is an educational assistant, not a doctor, and does not provide diagnoses or prescriptions.'}
            </p>
            {!compactModal && (
              <p className="mt-0.5 opacity-95">
                {isAr
                  ? 'في حالات الطوارئ الحادة (مثل ألم الصدر الشديد أو ضيق التنفس المفاجئ أو علامات السكتة الدماغية) لازم التوجه فوراً إلى أقرب قسم طوارئ.'
                  : 'For severe emergencies (severe chest pain, sudden breathing difficulty, stroke signs), go to the nearest emergency room immediately.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {!isEnabled && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {isAr
            ? 'خدمة حنين الذكية متوقفة مؤقتاً من إدارة المنصة. يرجى المحاولة لاحقاً.'
            : 'HANEEN AI is temporarily paused by platform administration.'}
        </div>
      )}

      {/* Main Layout: Conversation History & Consent + Chat Area */}
      <div className={compactModal ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-5 lg:grid-cols-12'}>
        {/* Left / Start Panel: Conversations + Explicit Consent & Report Picker */}
        <aside className={compactModal ? 'space-y-3' : 'space-y-4 lg:col-span-4'}>
          {/* Consent Control Box */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {consentGiven ? (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                )}
                <div>
                  <h2 className="text-base font-bold text-slate-950 dark:text-white">
                    {isAr ? 'موافقة مشاركة التحاليل' : 'Medical Record Consent'}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200 sm:text-[13px]">
                    {isAr
                      ? 'ما تطلع حنين على أي نتائج أو ملفات طبية إلا بعد تفعيل الموافقة الصريحة لهذه المحادثة.'
                      : 'Haneen never reads your lab results or medical files unless you explicitly enable consent for this thread.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={togglingConsent || !activeConvId}
                onClick={() => void handleToggleConsent()}
                aria-pressed={consentGiven}
                className={`min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-bold transition-colors cursor-pointer sm:text-sm ${
                  consentGiven
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-slate-300 bg-slate-100 text-slate-900 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                }`}
              >
                {consentGiven
                  ? isAr
                    ? 'مفعّلة (إيقاف)'
                    : 'Granted (Revoke)'
                  : isAr
                    ? 'منح الموافقة'
                    : 'Grant Consent'}
              </button>
            </div>

            {consentGiven ? (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    {isAr ? 'إرفاق نتيجة من MEDORA LAB (اختياري)' : 'Attach MEDORA LAB Result (Optional)'}
                  </label>
                  <select
                    value={selectedResultId}
                    onChange={(e) => setSelectedResultId(e.target.value)}
                    className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-[#040d21] dark:text-white"
                  >
                    <option value="">
                      {isAr ? '— بدون نتيجة مخبرية محددة —' : '— None selected —'}
                    </option>
                    {publishedResults.map((r) => (
                      <option key={r.resultId} value={r.resultId}>
                        {r.labNameAr} · {r.reportNumber} ({(r.approvedAt || r.createdAt || '').slice(0, 10)})
                      </option>
                    ))}
                  </select>
                </div>

                {personalFiles.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isAr ? 'أو ملف من السجل الطبي المرفوع' : 'Or Personal Uploaded Medical File'}
                    </label>
                    <select
                      value={selectedFileId}
                      onChange={(e) => setSelectedFileId(e.target.value)}
                      className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 dark:border-slate-700 dark:bg-[#040d21] dark:text-white"
                    >
                      <option value="">
                        {isAr ? '— بدون ملف مرفوع —' : '— None selected —'}
                      </option>
                      {personalFiles.map((f) => (
                        <option key={f.fileId} value={f.fileId}>
                          {f.title} ({f.documentDate})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {allowUpload && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        void handleChooseFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      disabled={preparingAttachments}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#0c3585]/50 bg-[#0c3585]/5 px-3 text-sm font-bold text-[#0c3585] hover:bg-[#0c3585]/10 disabled:opacity-60 dark:border-[#d9a43b]/50 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span>
                        {preparingAttachments
                          ? isAr
                            ? 'جاري تجهيز الملفات...'
                            : 'Preparing files...'
                          : uploadedAttachments.length > 0
                            ? isAr
                              ? `تم إرفاق ${uploadedAttachments.length} (إضافة المزيد حتى ${MAX_UPLOAD_FILES})`
                              : `${uploadedAttachments.length} attached (add up to ${MAX_UPLOAD_FILES})`
                            : isAr
                              ? 'رفع صورة تحليل أو PDF للقراءة (حتى 4 صفحات)'
                              : 'Upload Lab Image or PDF (Up to 4 pages)'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 rounded-lg bg-slate-100 px-3.5 py-2.5 text-xs leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:text-[13px]">
                {isAr
                  ? 'الوصول إلى التحاليل والملفات مغلق حالياً. ممكن طرح أي سؤال تثقيفي عام أو منح الموافقة لإرفاق تقرير.'
                  : 'Access to your lab records is locked. Ask general questions freely or grant consent to attach a report.'}
              </p>
            )}
          </section>

          {/* Conversations History (hidden in compact quick modal to keep chat spacious) */}
          {!compactModal && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {isAr ? 'المحادثات مع حنين' : 'My Haneen Conversations'}
                </h2>
                {activeConvId && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteConversation()}
                    title={isAr ? 'مسح المحادثة الحالية' : 'Clear Current Chat'}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'مسح المحادثة' : 'Clear'}</span>
                  </button>
                )}
              </div>
              <div className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto">
                {conversations.map((conv) => {
                  const isActive = conv.conversationId === activeConvId;
                  return (
                    <button
                      key={conv.conversationId}
                      type="button"
                      onClick={() => void handleSelectConversation(conv.conversationId)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-start text-sm transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#0c3585] font-bold text-white'
                          : 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-900'
                      }`}
                    >
                      <span className="truncate">{conv.title}</span>
                      <span className="font-latin text-xs opacity-85 tabular-nums">
                        {conv.messageCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </aside>

        {/* Right / Main Chat Workspace */}
        <section
          className={`flex flex-col justify-between rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#07122a] ${
            compactModal ? 'min-h-[380px]' : 'min-h-[540px] lg:col-span-8'
          }`}
        >
          {/* Messages Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? (
              <div className="mx-auto max-w-xl py-6 text-center sm:py-8">
                <HaneenAvatar
                  size="xl"
                  language={language}
                  className="mx-auto"
                />
                <h2 className="mt-4 text-lg font-bold text-slate-950 dark:text-white sm:text-xl">
                  {isAr
                    ? 'هلا والله! آني حنين، المساعد التثقيفي في MEDORA'
                    : 'Hello! I am Haneen, your MEDORA Health Assistant'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base">
                  {isAr
                    ? 'ممكن كتابة السؤال الطبي، أو لصق نتيجة التحليل، أو اختيار أحد المواضيع السريعة أدناه حتى نشرحها ببساطة:'
                    : 'Type your health question, paste a lab result, or choose a quick topic below and I will explain it clearly:'}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(isAr ? QUICK_PROMPTS_AR : QUICK_PROMPTS_EN).map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={sending || !isEnabled}
                      onClick={() => void handleSend(undefined, q.prompt)}
                      className="rounded-xl border border-slate-300 bg-slate-50 p-3.5 text-start text-sm font-semibold leading-relaxed text-slate-900 transition-colors hover:border-[#0c3585] hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-[#d9a43b] cursor-pointer sm:text-[15px]"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, msgIndex) => {
                const isUser = msg.role === 'user';
                const isLatestMessage = msgIndex === messages.length - 1;
                const isLatestAssistant =
                  !isUser &&
                  isLatestMessage &&
                  !msg.isEmergency &&
                  !msg.isRefusal &&
                  Boolean(msg.detailLevel);
                const isCurrentlyStreamingBubble = !isUser && isLatestMessage && sending;

                return (
                  <div
                    key={msg.messageId}
                    className={`flex items-start gap-2.5 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <HaneenAvatar
                        size="sm"
                        isSpeakingOrTyping={isCurrentlyStreamingBubble}
                        language={language}
                        className="mt-1"
                      />
                    )}
                    <article
                      className={`max-w-[85%] rounded-2xl px-4.5 py-4 text-base leading-[1.85] font-medium sm:max-w-[80%] sm:text-[17px] ${
                        isUser
                          ? 'bg-[#0c3585] text-white shadow-sm'
                          : msg.isEmergency
                            ? 'border-2 border-rose-500 bg-rose-50 text-rose-950 dark:border-rose-500 dark:bg-rose-950/80 dark:text-white'
                            : msg.isRefusal
                              ? 'border border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/65 dark:text-white'
                              : 'border border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-[#0d1c3d] dark:text-white'
                      }`}
                    >
                      {!isUser && (
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold sm:text-[13px]">
                          {msg.isEmergency ? (
                            <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="h-4 w-4" />
                              {isAr ? 'تنبيه طوارئ فوري' : 'URGENT EMERGENCY NOTICE'}
                            </span>
                          ) : msg.isRefusal ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                              <ShieldAlert className="h-4 w-4" />
                              {isAr ? 'حدود السلامة الطبية' : 'Medical Safety Boundary'}
                            </span>
                          ) : (
                            <span className="text-[#0c3585] dark:text-[#f4d378]">
                              {isAr ? 'حنين الذكية' : 'HANEEN AI'}
                            </span>
                          )}
                          {isCurrentlyStreamingBubble && (
                            <HaneenSpeakingIndicator language={language} />
                          )}
                        </div>
                      )}

                      {msg.attachedReportSummary && (
                        <div
                          className={`mb-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ${
                            isUser
                              ? 'bg-white/15 text-white'
                              : 'bg-slate-200/80 text-slate-950 dark:bg-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {msg.attachedReportSummary.kind === 'lab_result' ? (
                            <FlaskConical className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          <span>{msg.attachedReportSummary.label}</span>
                        </div>
                      )}

                      {!isUser && msg.extractedReport && msg.extractedReport.rows.length > 0 && (
                        <ExtractedLabReportCard report={msg.extractedReport} isAr={isAr} />
                      )}

                      {isUser ? (
                        <div className="whitespace-pre-wrap text-white">
                          {msg.text}
                        </div>
                      ) : msg.text ? (
                        <FormattedAssistantMessage
                          text={msg.text}
                          hideTables={Boolean(msg.extractedReport?.rows?.length)}
                        />
                      ) : sending ? (
                        <div className="text-slate-600 dark:text-slate-300">
                          {isAr ? 'جاري القراءة والتحليل...' : 'Reading & analyzing...'}
                        </div>
                      ) : null}

                      {isLatestAssistant && !sending && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/70">
                          {msg.detailLevel === 'brief' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSend(
                                    undefined,
                                    isAr ? 'ممكن توضيح أكثر بكلمات بسيطة' : 'Explain more simply',
                                    'standard',
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-[#f4d378] cursor-pointer sm:text-sm"
                              >
                                {isAr ? 'توضيح أكثر' : 'Explain more'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSend(
                                    undefined,
                                    isAr ? 'ممكن شرح بالتفصيل الكامل' : 'Give full detailed explanation',
                                    'detailed',
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer sm:text-sm"
                              >
                                {isAr ? 'شرح مفصل' : 'Detailed explanation'}
                              </button>
                            </>
                          )}
                          {msg.detailLevel === 'standard' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSend(
                                    undefined,
                                    isAr ? 'ممكن شرح بالتفصيل الكامل' : 'Give full detailed explanation',
                                    'detailed',
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-[#f4d378] cursor-pointer sm:text-sm"
                              >
                                {isAr ? 'شرح مفصل أكثر' : 'Full details'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSend(
                                    undefined,
                                    isAr ? 'ممكن تلخيص الجواب باختصار شديد' : 'Summarize briefly',
                                    'brief',
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer sm:text-sm"
                              >
                                {isAr ? 'تلخيص باختصار' : 'Keep it brief'}
                              </button>
                            </>
                          )}
                          {msg.detailLevel === 'detailed' && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleSend(
                                  undefined,
                                  isAr ? 'ممكن تلخيص الجواب بنقاط قصيرة' : 'Summarize briefly',
                                  'brief',
                                )
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer sm:text-sm"
                            >
                              {isAr ? 'ملخص بنقاط سريعة' : 'Quick summary'}
                            </button>
                          )}
                        </div>
                      )}

                    </article>
                  </div>
                );
              })
            )}

            {sending && !messages.some((m) => m.messageId.startsWith('optimistic_ai_')) && (
              <div className="flex items-start justify-start gap-2.5 sm:gap-3">
                <HaneenAvatar
                  size="sm"
                  isSpeakingOrTyping
                  language={language}
                  className="mt-1"
                />
                <div className="rounded-2xl border border-violet-300/60 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-violet-500/35 dark:bg-slate-900/70 dark:text-slate-200">
                  <HaneenSpeakingIndicator language={language} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Error Notice */}
          {errorMsg && (
            <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Selected Attachment Indicator & Composer */}
          <form
            onSubmit={(e) => void handleSend(e)}
            className="border-t border-slate-200 p-3.5 dark:border-slate-800 sm:p-4"
          >
            {(selectedResultId || selectedFileId || uploadedAttachments.length > 0) && (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
                {uploadedAttachments.map((att, idx) => (
                  <span
                    key={`${att.fileName}_${idx}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="max-w-[200px] truncate">{att.fileName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setUploadedAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={isAr ? 'إزالة الملف' : 'Remove file'}
                      className="ms-1 cursor-pointer opacity-75 hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {(selectedResultId || selectedFileId) && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {selectedResultId
                        ? isAr
                          ? 'نتيجة مختبرية مرفقة بالموافقة'
                          : 'Consented Lab Result Attached'
                        : isAr
                          ? 'ملف طبي مرفق بالموافقة'
                          : 'Consented Medical File Attached'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedResultId('');
                        setSelectedFileId('');
                      }}
                      className="ms-1 cursor-pointer opacity-75 hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              {allowUpload && consentGiven && (
                <button
                  type="button"
                  disabled={!isEnabled || sending || preparingAttachments}
                  onClick={() => fileInputRef.current?.click()}
                  title={isAr ? 'إرفاق صورة تقرير تحليل أو PDF' : 'Attach lab image or PDF'}
                  aria-label={isAr ? 'إرفاق صورة تقرير تحليل أو PDF' : 'Attach lab image or PDF'}
                  className="inline-flex min-h-[54px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-[#0c3585] hover:border-[#0c3585] hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:bg-[#040d21] dark:text-[#f4d378] cursor-pointer"
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              )}
              <textarea
                rows={2}
                value={inputText}
                disabled={!isEnabled || sending}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  isAr
                    ? 'ممكن كتابة السؤال هنا أو إرفاق صورة تقرير التحاليل (بعد تفعيل الموافقة)...'
                    : 'Ask Haneen or attach a lab report image (after granting consent)...'
                }
                className="min-h-[54px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium leading-relaxed text-slate-950 placeholder:text-slate-500 focus:border-[#0c3585] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-[#040d21] dark:text-white dark:placeholder:text-slate-400 dark:focus:border-[#f4d378] dark:focus:bg-[#081533]"
              />
              <button
                type="submit"
                disabled={
                  !isEnabled ||
                  sending ||
                  preparingAttachments ||
                  (!inputText.trim() &&
                    !selectedResultId &&
                    !selectedFileId &&
                    uploadedAttachments.length === 0)
                }
                className="medora-gold-button inline-flex min-h-[54px] shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">{isAr ? 'إرسال' : 'Send'}</span>
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Verified Sources Drawer/Modal */}
      {showSourcesModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowSourcesModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr ? 'المصادر الطبية المعتمدة لحنين الذكية' : 'Verified HANEEN AI Medical Sources'}
              </h2>
              <button
                type="button"
                onClick={() => setShowSourcesModal(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {sourcesMetadata.map((src) => (
                <div
                  key={src.sourceId}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#0c3585] dark:text-[#f4d378]">
                      {src.authority}
                    </span>
                    <span className="font-latin text-xs text-slate-600 dark:text-slate-300">
                      v{src.version} · {src.lastReviewedAt}
                    </span>
                  </div>
                  <p className="mt-1.5 text-base font-bold text-slate-950 dark:text-white">
                    {src.titleAr}
                  </p>
                  <a
                    href={src.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 font-latin text-sm text-[#0c3585] hover:underline dark:text-[#f4d378]"
                    dir="ltr"
                  >
                    <span className="truncate">{src.sourceUrl}</span>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

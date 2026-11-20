import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Edit3,
  ExternalLink,
  History,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  createAdminHaneenSource,
  createAdminHaneenTopic,
  fetchAdminHaneenLibrary,
  fetchAdminHaneenOverview,
  reviewAdminHaneenTopic,
  updateAdminHaneenRegisteredSource,
  updateAdminHaneenSettings,
  updateAdminHaneenSource,
  updateAdminHaneenSpecialty,
  updateAdminHaneenTopic,
} from '../../services/haneenService';
import type {
  HaneenAdminLibraryResponse,
  HaneenAdminOverviewResponse,
  HaneenCompletenessStatus,
  HaneenDialectMode,
  HaneenKnowledgeSource,
  HaneenKnowledgeTopic,
  HaneenLibraryDomain,
  HaneenTopicReviewStatus,
} from '../../types/haneen';
import type { Language } from '../../types/medora';

interface AdminHaneenSectionProps {
  firebaseUser: User;
  language: Language;
}

type AdminHaneenTab = 'overview' | 'topics' | 'specialties' | 'sources';

const INPUT_CLASS =
  'mt-1 min-h-[38px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-950 placeholder:text-slate-400 focus:border-[#0c3585] focus:outline-none dark:border-slate-700 dark:bg-[#040d21] dark:text-white dark:placeholder:text-slate-500';

const TEXTAREA_CLASS =
  'mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs leading-relaxed text-slate-950 placeholder:text-slate-400 focus:border-[#0c3585] focus:outline-none dark:border-slate-700 dark:bg-[#040d21] dark:text-white dark:placeholder:text-slate-500';

function reviewStatusLabelAr(status: HaneenTopicReviewStatus): string {
  if (status === 'approved') return 'معتمد للمرضى';
  if (status === 'under_review') return 'قيد المراجعة التخصصية';
  if (status === 'retired') return 'متقاعد / معطل';
  return 'مسودة';
}

function completenessLabelAr(status: HaneenCompletenessStatus): string {
  if (status === 'populated') return 'مكتمل تأسيسياً';
  if (status === 'intro_only') return 'مدخل تعريفي';
  return 'ناقص — بحاجة بناء';
}

function domainLabelAr(domain: HaneenLibraryDomain): string {
  if (domain === 'labs') return 'المختبرات';
  if (domain === 'imaging') return 'الأشعة والتصوير';
  return 'التخصصات السريرية';
}

export function AdminHaneenSection({
  firebaseUser,
  language,
}: AdminHaneenSectionProps) {
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<AdminHaneenTab>('overview');
  const [overview, setOverview] = useState<HaneenAdminOverviewResponse | null>(null);
  const [library, setLibrary] = useState<HaneenAdminLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings form state
  const [enabled, setEnabled] = useState(true);
  const [dialectMode, setDialectMode] = useState<HaneenDialectMode>('iraqi_polite');
  const [rateLimitPerHour, setRateLimitPerHour] = useState(30);
  const [maxHistoryMessages, setMaxHistoryMessages] = useState(16);
  const [retentionDays, setRetentionDays] = useState(90);
  const [allowReportAttachment, setAllowReportAttachment] = useState(true);
  const [emergencyInstructionAr, setEmergencyInstructionAr] = useState('');

  // Filters
  const [topicStatusFilter, setTopicStatusFilter] = useState<'all' | HaneenTopicReviewStatus>('all');
  const [topicDomainFilter, setTopicDomainFilter] = useState<'all' | HaneenLibraryDomain>('all');
  const [topicSearch, setTopicSearch] = useState('');
  const [specDomainFilter, setSpecDomainFilter] = useState<'all' | HaneenLibraryDomain>('all');

  // Legacy source modal
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<HaneenKnowledgeSource | null>(null);
  const [srcTitleAr, setSrcTitleAr] = useState('');
  const [srcTitleEn, setSrcTitleEn] = useState('');
  const [srcAuthority, setSrcAuthority] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcPublishedAt, setSrcPublishedAt] = useState('');
  const [srcLastReviewedAt, setSrcLastReviewedAt] = useState('');
  const [srcVersion, setSrcVersion] = useState('1.0.0');
  const [srcEnabled, setSrcEnabled] = useState(true);
  const [srcKeywords, setSrcKeywords] = useState('');
  const [srcContent, setSrcContent] = useState('');

  // Structured Topic modal (Schema 08)
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<HaneenKnowledgeTopic | null>(null);
  const [tTitleAr, setTTitleAr] = useState('');
  const [tDomain, setTDomain] = useState<HaneenLibraryDomain>('clinical');
  const [tMainSpec, setTMainSpec] = useState('');
  const [tSubSpec, setTSubSpec] = useState('');
  const [tType, setTType] = useState('مرض / شرح طبي');
  const [tSimpleExp, setTSimpleExp] = useState('');
  const [tWhatItMeans, setTWhatItMeans] = useState('');
  const [tNeedToKnow, setTNeedToKnow] = useState('');
  const [tSymptoms, setTSymptoms] = useState('');
  const [tTests, setTTests] = useState('');
  const [tPrep, setTPrep] = useState('');
  const [tWhenDoctor, setTWhenDoctor] = useState('');
  const [tEmergency, setTEmergency] = useState('');
  const [tCannotInfer, setTCannotInfer] = useState('');
  const [tSourceName, setTSourceName] = useState('');
  const [tSourceUrl, setTSourceUrl] = useState('');
  const [tKeywords, setTKeywords] = useState('');
  const [tInitialStatus, setTInitialStatus] = useState<'draft' | 'under_review'>('under_review');

  // Review / Approve modal (strict reviewer requirement)
  const [reviewingTopic, setReviewingTopic] = useState<HaneenKnowledgeTopic | null>(null);
  const [reviewStatus, setReviewStatus] = useState<HaneenTopicReviewStatus>('approved');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [historyTopic, setHistoryTopic] = useState<HaneenKnowledgeTopic | null>(null);

  const loadData = useCallback(async () => {
    setErrorMsg(null);
    try {
      const [ov, lib] = await Promise.all([
        fetchAdminHaneenOverview(firebaseUser),
        fetchAdminHaneenLibrary(firebaseUser),
      ]);
      setOverview(ov);
      setLibrary(lib);
      setEnabled(ov.settings.enabled);
      setDialectMode(ov.settings.dialectMode);
      setRateLimitPerHour(ov.settings.rateLimitPerHour);
      setMaxHistoryMessages(ov.settings.maxHistoryMessages);
      setRetentionDays(ov.settings.retentionDays);
      setAllowReportAttachment(ov.settings.allowReportAttachment);
      setEmergencyInstructionAr(ov.settings.emergencyInstructionAr);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل لوحة إدارة حنين الذكية.'
            : 'Unable to load HANEEN AI admin governance data.',
      );
    }
  }, [firebaseUser, isAr]);

  useEffect(() => {
    setLoading(true);
    void loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setNotice(null);
    setErrorMsg(null);
    try {
      await updateAdminHaneenSettings(firebaseUser, {
        enabled,
        dialectMode,
        rateLimitPerHour: Number(rateLimitPerHour),
        maxHistoryMessages: Number(maxHistoryMessages),
        retentionDays: Number(retentionDays),
        allowReportAttachment,
        emergencyInstructionAr,
      });
      await loadData();
      setNotice(
        isAr
          ? 'تم حفظ إعدادات التشغيل والسلامة لحنين الذكية بنجاح.'
          : 'HANEEN AI operational & safety settings saved.',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SETTINGS_SAVE_FAILED');
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreateTopicModal = () => {
    setEditingTopic(null);
    setTTitleAr('');
    setTDomain('clinical');
    setTMainSpec('الباطنية العامة');
    setTSubSpec('');
    setTType('موضوع طبي');
    setTSimpleExp('');
    setTWhatItMeans('');
    setTNeedToKnow('');
    setTSymptoms('');
    setTTests('');
    setTPrep('');
    setTWhenDoctor('راجع طبيبك عند استمرار الأعراض أو ظهور علامات جديدة.');
    setTEmergency('');
    setTCannotInfer('الشرح تثقيفي مبسط ولا يغني عن فحص الطبيب.');
    setTSourceName('MSD Manual Consumer Arabic');
    setTSourceUrl('https://www.msdmanuals.com/ar/home');
    setTKeywords('');
    setTInitialStatus('under_review');
    setTopicModalOpen(true);
  };

  const openEditTopicModal = (topic: HaneenKnowledgeTopic) => {
    setEditingTopic(topic);
    setTTitleAr(topic.titleAr);
    setTDomain(topic.domain);
    setTMainSpec(topic.mainSpecialty);
    setTSubSpec(topic.subSpecialty);
    setTType(topic.topicType);
    setTSimpleExp(topic.simpleExplanation);
    setTWhatItMeans(topic.whatItMeans);
    setTNeedToKnow(topic.patientNeedToKnow);
    setTSymptoms(topic.relatedSymptoms.join('، '));
    setTTests(topic.relatedTests.join('، '));
    setTPrep(topic.preparation);
    setTWhenDoctor(topic.whenToSeeDoctor);
    setTEmergency(topic.emergencySigns.join('، '));
    setTCannotInfer(topic.whatCannotBeInferred);
    setTSourceName(topic.sourceName);
    setTSourceUrl(topic.sourceUrl);
    setTKeywords(topic.keywords.join(', '));
    setTopicModalOpen(true);
  };

  const splitArabicList = (raw: string): string[] =>
    raw
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSaveTopic = async (e: FormEvent) => {
    e.preventDefault();
    setSavingTopic(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      if (editingTopic) {
        await updateAdminHaneenTopic(firebaseUser, editingTopic.topicId, {
          titleAr: tTitleAr,
          domain: tDomain,
          mainSpecialty: tMainSpec,
          subSpecialty: tSubSpec,
          topicType: tType,
          simpleExplanation: tSimpleExp,
          whatItMeans: tWhatItMeans,
          patientNeedToKnow: tNeedToKnow,
          relatedSymptoms: splitArabicList(tSymptoms),
          relatedTests: splitArabicList(tTests),
          preparation: tPrep,
          whenToSeeDoctor: tWhenDoctor,
          emergencySigns: splitArabicList(tEmergency),
          whatCannotBeInferred: tCannotInfer,
          sourceName: tSourceName,
          sourceUrl: tSourceUrl,
          keywords: splitArabicList(tKeywords),
          changeNote: 'تحديث محتوى الموضوع من لوحة الإدارة',
        });
        setNotice(isAr ? 'تم تحديث بيانات الموضوع وتسجيل الإصدار.' : 'Topic updated.');
      } else {
        await createAdminHaneenTopic(firebaseUser, {
          titleAr: tTitleAr,
          domain: tDomain,
          mainSpecialty: tMainSpec,
          subSpecialty: tSubSpec || tMainSpec,
          topicType: tType,
          simpleExplanation: tSimpleExp,
          whatItMeans: tWhatItMeans,
          patientNeedToKnow: tNeedToKnow,
          relatedSymptoms: splitArabicList(tSymptoms),
          relatedTests: splitArabicList(tTests),
          preparation: tPrep,
          whenToSeeDoctor: tWhenDoctor,
          emergencySigns: splitArabicList(tEmergency),
          whatCannotBeInferred: tCannotInfer,
          sourceName: tSourceName,
          sourceUrl: tSourceUrl,
          keywords: splitArabicList(tKeywords),
          initialStatus: tInitialStatus,
        });
        setNotice(
          isAr
            ? 'تمت إضافة الموضوع بحالة مسودة/قيد المراجعة — لن يظهر للمرضى قبل اعتماده من مراجع مختص.'
            : 'Topic created in draft/under-review state awaiting specialist approval.',
        );
      }
      setTopicModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'TOPIC_SAVE_FAILED');
    } finally {
      setSavingTopic(false);
    }
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewingTopic) return;
    setSavingTopic(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      await reviewAdminHaneenTopic(firebaseUser, reviewingTopic.topicId, {
        status: reviewStatus,
        reviewerName,
        changeNote: reviewNote,
      });
      setReviewingTopic(null);
      setReviewerName('');
      setReviewNote('');
      await loadData();
      setNotice(
        isAr
          ? 'تم تحديث حالة اعتماد الموضوع بنجاح في سجل المراجعة.'
          : 'Topic review status updated.',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'TOPIC_REVIEW_FAILED');
    } finally {
      setSavingTopic(false);
    }
  };

  const openCreateSourceModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingSource(null);
    setSrcTitleAr('');
    setSrcTitleEn('');
    setSrcAuthority('MedlinePlus / WHO');
    setSrcUrl('https://medlineplus.gov/');
    setSrcPublishedAt(today);
    setSrcLastReviewedAt(today);
    setSrcVersion('1.0.0');
    setSrcEnabled(true);
    setSrcKeywords('');
    setSrcContent('');
    setSourceModalOpen(true);
  };

  const openEditSourceModal = (src: HaneenKnowledgeSource) => {
    setEditingSource(src);
    setSrcTitleAr(src.titleAr);
    setSrcTitleEn(src.titleEn);
    setSrcAuthority(src.authority);
    setSrcUrl(src.sourceUrl);
    setSrcPublishedAt(src.publishedAt);
    setSrcLastReviewedAt(src.lastReviewedAt);
    setSrcVersion(src.version);
    setSrcEnabled(src.enabled);
    setSrcKeywords((src.keywords || []).join(', '));
    setSrcContent(src.content);
    setSourceModalOpen(true);
  };

  const handleSaveSource = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSource(true);
    setErrorMsg(null);
    setNotice(null);
    const keywordsArr = srcKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      if (editingSource) {
        await updateAdminHaneenSource(firebaseUser, editingSource.sourceId, {
          titleAr: srcTitleAr,
          titleEn: srcTitleEn,
          authority: srcAuthority,
          sourceUrl: srcUrl,
          publishedAt: srcPublishedAt,
          lastReviewedAt: srcLastReviewedAt,
          version: srcVersion,
          enabled: srcEnabled,
          keywords: keywordsArr,
          content: srcContent,
        });
        setNotice(isAr ? 'تم تحديث المصدر المعرفي وإصداره بنجاح.' : 'Knowledge source updated.');
      } else {
        await createAdminHaneenSource(firebaseUser, {
          titleAr: srcTitleAr,
          titleEn: srcTitleEn,
          authority: srcAuthority,
          sourceUrl: srcUrl,
          publishedAt: srcPublishedAt,
          lastReviewedAt: srcLastReviewedAt,
          version: srcVersion,
          enabled: srcEnabled,
          keywords: keywordsArr,
          content: srcContent,
        });
        setNotice(isAr ? 'تمت إضافة المصدر المعرفي الجديد بنجاح.' : 'Knowledge source added.');
      }
      setSourceModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SOURCE_SAVE_FAILED');
    } finally {
      setSavingSource(false);
    }
  };

  const handleToggleSourceEnabled = async (src: HaneenKnowledgeSource) => {
    setErrorMsg(null);
    try {
      await updateAdminHaneenSource(firebaseUser, src.sourceId, {
        enabled: !src.enabled,
      });
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'TOGGLE_SOURCE_FAILED');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        {isAr ? 'جاري تحميل حوكمة ومكتبة حنين الذكية...' : 'Loading HANEEN AI Governance...'}
      </div>
    );
  }

  const telemetry = overview?.telemetry;
  const sources = overview?.sources || [];
  const topics = library?.topics || [];
  const specialties = library?.specialties || [];
  const registeredSources = library?.registeredSources || [];
  const roadmap = library?.roadmapSummary;

  const filteredTopics = topics.filter((t) => {
    if (topicStatusFilter !== 'all' && t.status !== topicStatusFilter) return false;
    if (topicDomainFilter !== 'all' && t.domain !== topicDomainFilter) return false;
    if (topicSearch.trim()) {
      const q = topicSearch.trim().toLowerCase();
      return (
        t.titleAr.toLowerCase().includes(q) ||
        t.mainSpecialty.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredSpecialties = specialties.filter(
    (s) => specDomainFilter === 'all' || s.domain === specDomainFilter,
  );

  return (
    <div className="space-y-6">
      {/* Privacy Guarantee Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/70 px-5 py-3.5 text-xs text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <span className="font-semibold">
            {isAr
              ? 'حماية خصوصية المرضى: هذه اللوحة تعرض مؤشرات تقنية مجمّعة وإدارة مكتبة المعرفة فقط — ولا تتيح للإدارة الاطلاع على محادثات المرضى أو تحاليلهم الخاصة.'
              : 'Patient Privacy Enforced: Aggregate metrics and medical library governance only — never patient chats or private medical records.'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-400/50 bg-white px-3 text-xs font-bold text-emerald-900 dark:bg-slate-900 dark:text-emerald-200 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{isAr ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>{notice}</span>
          </span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Aggregate Technical & Library KPIs */}
      {telemetry && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'حالة Gemini API' : 'Gemini API'}
            </p>
            <p
              className={`mt-1.5 text-sm font-extrabold ${
                telemetry.geminiConfigured
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {telemetry.geminiConfigured ? (isAr ? 'مفعّل' : 'Configured') : isAr ? 'غير مضبوط' : 'Missing'}
            </p>
            <p className="mt-0.5 font-latin text-[10px] text-slate-500" dir="ltr">
              {telemetry.modelName}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي الاستفسارات' : 'Total Queries'}
            </p>
            <p className="mt-1.5 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {telemetry.totalQuestions}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'طوارئ / منع وصفات' : 'Safety Gates'}
            </p>
            <p className="mt-1.5 font-latin text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {telemetry.emergencyRedirects} / {telemetry.safetyRefusals}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'جودة الاسترجاع (نجاح/نقص)' : 'Retrieval Hit / Miss'}
            </p>
            <p className="mt-1.5 font-latin text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {telemetry.retrievalHits} / {telemetry.retrievalMisses}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'مواضيع المكتبة المعتمدة' : 'Approved Topics'}
            </p>
            <p className="mt-1.5 font-latin text-2xl font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
              {telemetry.approvedTopicsCount} / {telemetry.totalTopicsCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'متوسط الاستجابة' : 'Avg Latency'}
            </p>
            <p className="mt-1.5 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {telemetry.avgLatencyMs} ms
            </p>
          </div>
        </section>
      )}

      {/* Navigation Tabs */}
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#07122a]">
        {(
          [
            { id: 'overview', labelAr: 'الإعدادات ومؤشرات الجودة', icon: Settings },
            { id: 'topics', labelAr: `مواضيع المكتبة والمراجعة (${topics.length})`, icon: ClipboardCheck },
            { id: 'specialties', labelAr: `التخصصات وخارطة النقص (${specialties.length})`, icon: Layers },
            { id: 'sources', labelAr: 'سجل المصادر المعتمدة والمحتوى', icon: Database },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0c3585] text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.labelAr}</span>
            </button>
          );
        })}
      </nav>

      {/* TAB 1: Settings + Retrieval Quality & Technical Errors */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <form
            onSubmit={(e) => void handleSaveSettings(e)}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a] xl:col-span-5"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Settings className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'إعدادات التشغيل والحدود' : 'Operational Controls'}
              </h2>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white cursor-pointer">
              <span>{isAr ? 'تفعيل حنين الذكية للمرضى' : 'Enable HANEEN AI in Patient Portal'}</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white cursor-pointer">
              <span>{isAr ? 'السماح بإرفاق صور التقارير' : 'Allow Report Image/PDF Uploads'}</span>
              <input
                type="checkbox"
                checked={allowReportAttachment}
                onChange={(e) => setAllowReportAttachment(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'اللهجة / الأسلوب' : 'Language Style'}
                </label>
                <select
                  value={dialectMode}
                  onChange={(e) => setDialectMode(e.target.value as HaneenDialectMode)}
                  className={INPUT_CLASS}
                >
                  <option value="iraqi_polite">عراقية بيضاء مهذبة ومبسطة</option>
                  <option value="msa_simple">عربية فصحى مبسطة</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'الحد بالساعة للمريض' : 'Rate Limit / Hour'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={rateLimitPerHour}
                  onChange={(e) => setRateLimitPerHour(Number(e.target.value))}
                  className={`${INPUT_CLASS} font-latin`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'طول الذاكرة (رسائل)' : 'Context History Limit'}
                </label>
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={maxHistoryMessages}
                  onChange={(e) => setMaxHistoryMessages(Number(e.target.value))}
                  className={`${INPUT_CLASS} font-latin`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? 'مدة الاحتفاظ (أيام)' : 'Retention (Days)'}
                </label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className={`${INPUT_CLASS} font-latin`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {isAr ? 'نص توجيه الطوارئ المعتمد' : 'Approved Emergency Guidance Text'}
              </label>
              <textarea
                rows={3}
                value={emergencyInstructionAr}
                onChange={(e) => setEmergencyInstructionAr(e.target.value)}
                className={TEXTAREA_CLASS}
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="medora-gold-button inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات التشغيلية'}</span>
            </button>
          </form>

          <div className="space-y-6 xl:col-span-7">
            {/* Missed / Unmatched Topic Telemetry (Zero-PII) */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    استفسارات لم تجد موضوعاً مطابقاً في المكتبة (مجهّلة الهوية)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    تُزال الأرقام والإيميلات تلقائياً — تُستخدم لتحديد أولويات بناء مواضيع جديدة.
                  </p>
                </div>
              </div>
              {!telemetry || telemetry.recentMissedQueries.length === 0 ? (
                <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد فجوات استرجاع مسجلة حالياً.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                  {telemetry.recentMissedQueries.map((m, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {m.queryTopic}
                      </span>
                      <span className="shrink-0 font-latin text-[11px] text-slate-500" dir="ltr">
                        {m.timestamp.slice(0, 16).replace('T', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Aggregate Non-PII Technical Errors Log */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <Activity className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  سجل الأخطاء التقنية (بدون أي بيانات شخصية)
                </h2>
              </div>
              {!telemetry || telemetry.recentTechnicalErrors.length === 0 ? (
                <p className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                  لا توجد أخطاء تقنية مسجلة.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                      <tr>
                        <th className="py-2 text-start">التوقيت</th>
                        <th className="py-2 text-start">المرحلة</th>
                        <th className="py-2 text-start">رمز الخطأ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {telemetry.recentTechnicalErrors.map((err, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-latin text-slate-800 dark:text-slate-200" dir="ltr">
                            {err.timestamp}
                          </td>
                          <td className="py-2 font-latin text-slate-800 dark:text-slate-200">{err.stage}</td>
                          <td className="py-2 font-latin text-rose-600 dark:text-rose-400">
                            {err.code}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: Structured Knowledge Library Topics & Medical Review Gate */}
      {activeTab === 'topics' && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                إدارة مواضيع المكتبة الطبية الشاملة وبوابة الاعتماد (Schema 08)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                أي موضوع جديد يبدأ كمسودة أو قيد المراجعة ولا يظهر للمريض إلا بعد اعتماده من مراجع طبي مع حفظ المرجع الرسمي.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateTopicModal}
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة موضوع طبي جديد</span>
            </button>
          </div>

          {roadmap && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">معتمد للمرضى</p>
                <p className="font-latin text-xl font-extrabold text-emerald-900 dark:text-emerald-100">{roadmap.approvedTopics}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">قيد المراجعة</p>
                <p className="font-latin text-xl font-extrabold text-amber-900 dark:text-amber-100">{roadmap.underReviewTopics}</p>
              </div>
              <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">مسودة</p>
                <p className="font-latin text-xl font-extrabold text-slate-900 dark:text-white">{roadmap.draftTopics}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">متقاعد / معطل</p>
                <p className="font-latin text-xl font-extrabold text-rose-900 dark:text-rose-100">{roadmap.retiredTopics}</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              placeholder="بحث بالعنوان أو التخصص أو الكلمات المفتاحية..."
              className={INPUT_CLASS}
            />
            <select
              value={topicDomainFilter}
              onChange={(e) => setTopicDomainFilter(e.target.value as 'all' | HaneenLibraryDomain)}
              className={INPUT_CLASS}
            >
              <option value="all">كل المجالات</option>
              <option value="labs">المختبرات والتحاليل</option>
              <option value="imaging">الأشعة والتصوير</option>
              <option value="clinical">التخصصات السريرية والتثقيف</option>
            </select>
            <select
              value={topicStatusFilter}
              onChange={(e) => setTopicStatusFilter(e.target.value as 'all' | HaneenTopicReviewStatus)}
              className={INPUT_CLASS}
            >
              <option value="all">كل حالات المراجعة</option>
              <option value="approved">معتمد للمرضى</option>
              <option value="under_review">قيد المراجعة التخصصية</option>
              <option value="draft">مسودة</option>
              <option value="retired">متقاعد / معطل</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredTopics.map((topic) => (
              <div
                key={topic.topicId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          topic.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : topic.status === 'under_review'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                              : topic.status === 'retired'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {reviewStatusLabelAr(topic.status)}
                      </span>
                      <span className="rounded bg-[#0c3585]/10 px-2 py-0.5 text-[10px] font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                        {domainLabelAr(topic.domain)} · {topic.mainSpecialty}
                      </span>
                      <span className="font-latin text-[11px] text-slate-500">
                        v{topic.version} · {topic.updatedAt}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                      {topic.titleAr}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {topic.simpleExplanation}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>المرجع: {topic.sourceName}</span>
                      {topic.reviewerName && <span>المراجع: {topic.reviewerName}</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditTopicModal(topic)}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewingTopic(topic);
                        setReviewStatus(topic.status === 'approved' ? 'retired' : 'approved');
                        setReviewerName(topic.reviewerName || '');
                        setReviewNote('');
                      }}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-emerald-400/60 bg-emerald-50 px-2.5 text-xs font-bold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200 cursor-pointer"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      <span>مراجعة / اعتماد</span>
                    </button>
                    {topic.history && topic.history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHistoryTopic(topic)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <History className="h-3.5 w-3.5" />
                        <span>السجل</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: Specialties Coverage & Honest Gap Roadmap (Files 01 & 12) */}
      {activeTab === 'specialties' && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                خارطة التخصصات الطبية وحالة الاكتمال الصادقة (ملف 01 و 12)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                تعرض حالة التغطية الحقيقية لكل تخصص: مكتمل تأسيسياً، مدخل تعريفي، أو ناقص بحاجة بناء دون الادعاء باكتمل الموسوعة.
              </p>
            </div>
            <select
              value={specDomainFilter}
              onChange={(e) => setSpecDomainFilter(e.target.value as 'all' | HaneenLibraryDomain)}
              className="min-h-[36px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-950 dark:border-slate-700 dark:bg-[#040d21] dark:text-white"
            >
              <option value="all">جميع التخصصات ({specialties.length})</option>
              <option value="labs">المختبرات</option>
              <option value="imaging">الأشعة والتصوير</option>
              <option value="clinical">التخصصات السريرية</option>
            </select>
          </div>

          {roadmap && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">مكتمل تأسيسياً</p>
                <p className="font-latin text-xl font-extrabold text-emerald-900 dark:text-emerald-100">{roadmap.populatedSpecialties}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">مدخل تعريفي فقط</p>
                <p className="font-latin text-xl font-extrabold text-amber-900 dark:text-amber-100">{roadmap.introOnlySpecialties}</p>
              </div>
              <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
                <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">ناقص — بحاجة بناء</p>
                <p className="font-latin text-xl font-extrabold text-rose-900 dark:text-rose-100">{roadmap.missingSpecialties}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredSpecialties.map((spec) => (
              <div
                key={spec.specialtyId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#0c3585]/10 px-2 py-0.5 font-latin text-[10px] font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                      {spec.code} · {spec.roadmapPriority}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        spec.completeness === 'populated'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : spec.completeness === 'intro_only'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {completenessLabelAr(spec.completeness)}
                    </span>
                  </div>
                  <select
                    value={spec.completeness}
                    onChange={(e) =>
                      void updateAdminHaneenSpecialty(firebaseUser, spec.specialtyId, {
                        completeness: e.target.value as HaneenCompletenessStatus,
                      }).then(loadData)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="populated">مكتمل تأسيسياً</option>
                    <option value="intro_only">مدخل تعريفي</option>
                    <option value="missing">ناقص — بحاجة بناء</option>
                  </select>
                </div>
                <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                  {spec.titleAr}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {spec.mainGroupAr}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {spec.subBranchesAr.map((b, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-white px-2 py-0.5 text-[10px] text-slate-700 border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 4: Registered Verified Sources (09) & Legacy Foundation Files (01-04) */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {/* Verified External Sources Registry (File 09) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                سجل المصادر الطبية المعتمدة وقواعد حقوق النشر (ملف 09)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                يُمنع نسخ الموسوعات الخارجية كاملة ويُمنع قبول الروابط العشوائية أو ويكيبيديا أو المنتديات.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {registeredSources.map((reg) => (
                <div
                  key={reg.registryId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                      {reg.authority} ({reg.language})
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!reg.patientFacingAllowed && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                          للاستخدام الداخلي فقط
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void updateAdminHaneenRegisteredSource(firebaseUser, reg.registryId, {
                            active: !reg.active,
                          }).then(loadData)
                        }
                        className={`rounded px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                          reg.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {reg.active ? 'مفعّل' : 'معطّل'}
                      </button>
                    </div>
                  </div>
                  <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">{reg.name}</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{reg.specialtyFocus}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{reg.licenseNotes}</p>
                  <a
                    href={reg.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="mt-1.5 inline-flex items-center gap-1 font-latin text-[11px] text-[#0c3585] hover:underline dark:text-[#f4d378]"
                  >
                    <span>{reg.baseUrl}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          {/* Core Seeded Knowledge Files (01-04 + Custom) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    ملفات المعرفة التأسيسية 01–04 وإصداراتها
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    مع التحقق الصارم من موثوقية روابط المصادر المضافة.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openCreateSourceModal}
                className="medora-gold-button inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-[#040917] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة ملف معرفي</span>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {sources.map((src) => (
                <div
                  key={src.sourceId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#0c3585]/10 px-2 py-0.5 font-latin text-[11px] font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                          #{src.code} · v{src.version}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {src.authority}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            src.enabled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {src.enabled ? 'مفعّل' : 'معطّل'}
                        </span>
                      </div>
                      <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                        {src.titleAr}
                      </h3>
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-latin text-[11px] text-[#0c3585] hover:underline dark:text-[#f4d378]"
                        dir="ltr"
                      >
                        <span>{src.sourceUrl}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditSourceModal(src)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>تعديل / تحديث</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleSourceEnabled(src)}
                        className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        {src.enabled ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Create / Edit Knowledge Topic Modal (Schema 08) */}
      {topicModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setTopicModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSaveTopic(e)}
            className="max-h-[90dvh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-[#d9a43b]" />
                <span>{editingTopic ? 'تعديل موضوع في المكتبة' : 'إضافة موضوع طبي جديد (مسودة / مراجعة)'}</span>
              </h2>
              <button type="button" onClick={() => setTopicModalOpen(false)} className="rounded-lg p-1 text-slate-500 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">عنوان الموضوع بالعربية *</label>
                <input type="text" required value={tTitleAr} onChange={(e) => setTTitleAr(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">المجال *</label>
                <select value={tDomain} onChange={(e) => setTDomain(e.target.value as HaneenLibraryDomain)} className={INPUT_CLASS}>
                  <option value="labs">المختبرات</option>
                  <option value="imaging">الأشعة والتصوير</option>
                  <option value="clinical">التخصصات السريرية</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">التخصص الرئيسي *</label>
                <input type="text" required value={tMainSpec} onChange={(e) => setTMainSpec(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">التخصص الفرعي</label>
                <input type="text" value={tSubSpec} onChange={(e) => setTSubSpec(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">نوع الموضوع</label>
                <input type="text" value={tType} onChange={(e) => setTType(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">اسم المصدر الطبي *</label>
                <input type="text" required value={tSourceName} onChange={(e) => setTSourceName(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">رابط المصدر الرسمي (HTTPS) *</label>
                <input type="url" required dir="ltr" value={tSourceUrl} onChange={(e) => setTSourceUrl(e.target.value)} className={`${INPUT_CLASS} font-latin`} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الشرح البسيط باللهجة العراقية البيضاء *</label>
              <textarea rows={3} required value={tSimpleExp} onChange={(e) => setTSimpleExp(e.target.value)} className={TEXTAREA_CLASS} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">ماذا يعني ذلك وما الذي يؤثر عليه *</label>
              <textarea rows={3} required value={tWhatItMeans} onChange={(e) => setTWhatItMeans(e.target.value)} className={TEXTAREA_CLASS} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الأعراض المرتبطة (بفاصلة)</label>
                <input type="text" value={tSymptoms} onChange={(e) => setTSymptoms(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الفحوصات ذات الصلة (بفاصلة)</label>
                <input type="text" value={tTests} onChange={(e) => setTTests(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">علامات الطوارئ (بفاصلة)</label>
                <input type="text" value={tEmergency} onChange={(e) => setTEmergency(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الكلمات المفتاحية (بفاصلة)</label>
                <input type="text" value={tKeywords} onChange={(e) => setTKeywords(e.target.value)} className={INPUT_CLASS} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">متى يراجع الطبيب</label>
                <input type="text" value={tWhenDoctor} onChange={(e) => setTWhenDoctor(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">ما لا يمكن استنتاجه</label>
                <input type="text" value={tCannotInfer} onChange={(e) => setTCannotInfer(e.target.value)} className={INPUT_CLASS} />
              </div>
            </div>
            {!editingTopic && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الحالة الابتدائية (لا يُعتمد تلقائياً)</label>
                <select value={tInitialStatus} onChange={(e) => setTInitialStatus(e.target.value as 'draft' | 'under_review')} className={INPUT_CLASS}>
                  <option value="under_review">قيد المراجعة التخصصية (under_review)</option>
                  <option value="draft">مسودة (draft)</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setTopicModalOpen(false)} className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer">إلغاء</button>
              <button type="submit" disabled={savingTopic} className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer">
                <Save className="h-3.5 w-3.5" />
                <span>{savingTopic ? 'جاري الحفظ...' : 'حفظ الموضوع'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Specialist Review / Approve / Retire Modal */}
      {reviewingTopic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setReviewingTopic(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSubmitReview(e)}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                اعتماد أو تقاعد الموضوع الطبي
              </h2>
              <button type="button" onClick={() => setReviewingTopic(null)} className="text-slate-500 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">{reviewingTopic.titleAr}</p>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">القرار / الحالة</label>
              <select
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as HaneenTopicReviewStatus)}
                className={INPUT_CLASS}
              >
                <option value="approved">اعتماد ونشر للمرضى (approved)</option>
                <option value="under_review">إبقاء قيد المراجعة (under_review)</option>
                <option value="draft">إرجاع لمسودة (draft)</option>
                <option value="retired">تعطيل / إحالة للتقاعد (retired)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                اسم المراجع الطبي المختص {reviewStatus === 'approved' ? '*' : ''}
              </label>
              <input
                type="text"
                required={reviewStatus === 'approved'}
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="مثال: د. أحمد الحسيني — استشاري باطنية"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">ملاحظة المراجعة والتغيير</label>
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReviewingTopic(null)} className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer">إلغاء</button>
              <button type="submit" disabled={savingTopic} className="medora-gold-button min-h-[38px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer">
                حفظ قرار المراجعة
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Version History Modal */}
      {historyTopic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setHistoryTopic(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">سجل الإصدارات والمراجعات</h2>
              <button type="button" onClick={() => setHistoryTopic(null)} className="text-slate-500 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2.5">
              {(historyTopic.history || []).map((h, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between font-bold">
                    <span className="font-latin">v{h.version} · {reviewStatusLabelAr(h.status)}</span>
                    <span className="font-latin text-[11px] text-slate-500">{h.updatedAt.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">{h.changeNote}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Knowledge Source Modal */}
      {sourceModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setSourceModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSaveSource(e)}
            className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-[#d9a43b]" />
                <span>{editingSource ? 'تعديل وتحديث مصدر المعرفة' : 'إضافة مصدر معرفي جديد'}</span>
              </h2>
              <button type="button" onClick={() => setSourceModalOpen(false)} className="rounded-lg p-1 text-slate-500 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">العنوان بالعربية *</label>
                <input type="text" required value={srcTitleAr} onChange={(e) => setSrcTitleAr(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الجهة المصدرية *</label>
                <input type="text" required value={srcAuthority} onChange={(e) => setSrcAuthority(e.target.value)} className={INPUT_CLASS} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">رابط المصدر الأصلي (HTTPS) *</label>
                <input type="url" required dir="ltr" value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} className={`${INPUT_CLASS} font-latin`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">تاريخ النشر / التحديث</label>
                <input type="text" value={srcPublishedAt} onChange={(e) => setSrcPublishedAt(e.target.value)} className={`${INPUT_CLASS} font-latin`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">آخر مراجعة</label>
                <input type="text" value={srcLastReviewedAt} onChange={(e) => setSrcLastReviewedAt(e.target.value)} className={`${INPUT_CLASS} font-latin`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">رقم الإصدار *</label>
                <input type="text" required value={srcVersion} onChange={(e) => setSrcVersion(e.target.value)} className={`${INPUT_CLASS} font-latin`} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">الكلمات المفتاحية</label>
                <input type="text" value={srcKeywords} onChange={(e) => setSrcKeywords(e.target.value)} className={INPUT_CLASS} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">محتوى الملف المعرفي *</label>
              <textarea rows={8} required value={srcContent} onChange={(e) => setSrcContent(e.target.value)} className={TEXTAREA_CLASS} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setSourceModalOpen(false)} className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer">إلغاء</button>
              <button type="submit" disabled={savingSource} className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer">
                <Save className="h-3.5 w-3.5" />
                <span>{savingSource ? 'جاري الحفظ...' : 'حفظ المصدر'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

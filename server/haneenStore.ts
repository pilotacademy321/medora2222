import fs from 'node:fs';
import path from 'node:path';
import { type Firestore } from 'firebase-admin/firestore';
import type {
  HaneenAdminLibraryResponse,
  HaneenAdminTelemetry,
  HaneenCompletenessStatus,
  HaneenConversation,
  HaneenDialectMode,
  HaneenGlossaryEntry,
  HaneenKnowledgeSource,
  HaneenKnowledgeTopic,
  HaneenLibraryDomain,
  HaneenMessage,
  HaneenMissedQueryLog,
  HaneenRegisteredSource,
  HaneenSettings,
  HaneenSpecialtyNode,
  HaneenTechnicalErrorLog,
  HaneenTopicReviewStatus,
} from '../src/types/haneen.ts';
import { loadDefaultKnowledgeSources } from './haneenKnowledge.ts';
import {
  computeLibraryRoadmapSummary,
  loadDefaultGlossaryEntries,
  loadDefaultKnowledgeTopics,
  loadDefaultRegisteredSources,
  loadDefaultSpecialties,
  validateTrustedSourceUrl,
} from './haneenLibrary.ts';

interface PersistedTelemetryState {
  totalQuestions: number;
  emergencyRedirects: number;
  safetyRefusals: number;
  errorCount: number;
  latencySumMs: number;
  latencySamples: number;
  retrievalHits: number;
  retrievalMisses: number;
  recentMissedQueries: HaneenMissedQueryLog[];
  recentTechnicalErrors: HaneenTechnicalErrorLog[];
}

interface HaneenStoreState {
  sources: HaneenKnowledgeSource[];
  specialties: HaneenSpecialtyNode[];
  topics: HaneenKnowledgeTopic[];
  registeredSources: HaneenRegisteredSource[];
  glossary: HaneenGlossaryEntry[];
  settings: HaneenSettings;
  conversations: Record<string, HaneenConversation>;
  messagesByConversation: Record<string, HaneenMessage[]>;
  rateBuckets: Record<string, number[]>;
  telemetry: PersistedTelemetryState;
}

const DEFAULT_SETTINGS: HaneenSettings = {
  enabled: true,
  rateLimitPerHour: 30,
  maxHistoryMessages: 16,
  dialectMode: 'iraqi_polite',
  allowReportAttachment: true,
  retentionDays: 90,
  emergencyInstructionAr:
    'تنويه طوارئ: إذا اكو ألم شديد بالصدر أو ضيق حاد بالتنفس أو علامات سكتة دماغية أو نزيف حاد أو فقدان وعي أو تحسس شديد مع تورم باللسان أو الحلق أو أفكار إيذاء النفس، لازم التوجه فوراً لأقرب قسم طوارئ أو طلب المساعدة الطبية الطارئة بدون أي تأخير.',
  emergencyInstructionEn:
    'Emergency Notice: If you experience severe chest pain, acute breathing difficulty, stroke signs, severe bleeding, loss of consciousness, severe allergic swelling, or self-harm thoughts, seek emergency medical care or go to the nearest emergency room immediately.',
  updatedAt: new Date().toISOString(),
};

function createInitialState(): HaneenStoreState {
  return {
    sources: loadDefaultKnowledgeSources(),
    specialties: loadDefaultSpecialties(),
    topics: loadDefaultKnowledgeTopics(),
    registeredSources: loadDefaultRegisteredSources(),
    glossary: loadDefaultGlossaryEntries(),
    settings: { ...DEFAULT_SETTINGS },
    conversations: {},
    messagesByConversation: {},
    rateBuckets: {},
    telemetry: {
      totalQuestions: 0,
      emergencyRedirects: 0,
      safetyRefusals: 0,
      errorCount: 0,
      latencySumMs: 0,
      latencySamples: 0,
      retrievalHits: 0,
      retrievalMisses: 0,
      recentMissedQueries: [],
      recentTechnicalErrors: [],
    },
  };
}

function sanitizeQueryTopicForTelemetry(raw: string): string {
  // Strip any phone numbers, lab numbers, emails, or long IDs to enforce zero-PII monitoring
  return raw
    .replace(/\S+@\S+/g, '[email]')
    .replace(/\d+(?:[.,:/-]\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 75);
}

function bumpPatchVersion(version: string): string {
  const parts = version.split('.').map((p) => Number(p));
  if (parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0)) {
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
  return `${version || '1.0.0'}-rev`;
}

export interface HaneenStoreDeps {
  filePath?: string;
  getAdminDb?: () => Firestore | null;
  isFirestoreAdminReady?: () => boolean;
}

export class HaneenStore {
  private readonly filePath: string;
  private readonly getAdminDb?: () => Firestore | null;
  private readonly isFirestoreAdminReady?: () => boolean;
  private state: HaneenStoreState;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private isSaving = false;
  private pendingSave = false;
  private disposed = false;

  constructor(deps: HaneenStoreDeps = {}) {
    this.filePath =
      deps.filePath || path.resolve(process.cwd(), '.medora-data', 'haneen-store.json');
    this.getAdminDb = deps.getAdminDb;
    this.isFirestoreAdminReady = deps.isFirestoreAdminReady;
    this.state = this.loadFromDisk();
  }

  getKnowledgeVersionStamp(): string {
    const srcStamp = this.state.sources
      .map((s) => `${s.sourceId}:${s.enabled ? 1 : 0}:${s.version}:${s.updatedAt}`)
      .join('|');
    const topicStamp = this.state.topics
      .filter((t) => t.status === 'approved')
      .map((t) => `${t.topicId}:${t.version}:${t.updatedAt}`)
      .join('|');
    return `${this.state.settings.dialectMode}:${this.state.settings.updatedAt}::${srcStamp}::${topicStamp}`;
  }

  dispose(): void {
    this.disposed = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private loadFromDisk(): HaneenStoreState {
    const defaults = createInitialState();
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<HaneenStoreState>;

        const existingSources = Array.isArray(parsed.sources) ? parsed.sources : [];
        const existingSrcById = new Map(existingSources.map((s) => [s.sourceId, s]));
        const mergedSources: HaneenKnowledgeSource[] = defaults.sources.map((seed) => {
          const saved = existingSrcById.get(seed.sourceId);
          if (!saved) return seed;
          return {
            ...seed,
            ...saved,
            content: saved.content && saved.content.trim().length > 0 ? saved.content : seed.content,
            keywords:
              Array.isArray(saved.keywords) && saved.keywords.length > 0
                ? saved.keywords
                : seed.keywords,
          };
        });
        for (const saved of existingSources) {
          if (!mergedSources.some((m) => m.sourceId === saved.sourceId)) {
            mergedSources.push(saved);
          }
        }

        const existingSpecs = Array.isArray(parsed.specialties) ? parsed.specialties : [];
        const specById = new Map(existingSpecs.map((s) => [s.specialtyId, s]));
        const mergedSpecs: HaneenSpecialtyNode[] = defaults.specialties.map(
          (seed) => specById.get(seed.specialtyId) || seed,
        );
        for (const saved of existingSpecs) {
          if (!mergedSpecs.some((s) => s.specialtyId === saved.specialtyId)) {
            mergedSpecs.push(saved);
          }
        }

        let needsPersist = false;
        const existingTopics = Array.isArray(parsed.topics) ? parsed.topics : [];
        const topicById = new Map(existingTopics.map((t) => [t.topicId, t]));
        const mergedTopics: HaneenKnowledgeTopic[] = defaults.topics.map((seed) => {
          const saved = topicById.get(seed.topicId);
          if (!saved) {
            needsPersist = true;
            return seed;
          }
          if (
            (saved.version === '1.0.0' || saved.version === '0.9.0') &&
            saved.version !== seed.version
          ) {
            needsPersist = true;
            return seed;
          }
          return saved;
        });
        for (const saved of existingTopics) {
          if (!mergedTopics.some((t) => t.topicId === saved.topicId)) {
            mergedTopics.push(saved);
          }
        }

        const existingReg = Array.isArray(parsed.registeredSources) ? parsed.registeredSources : [];
        const regById = new Map(existingReg.map((r) => [r.registryId, r]));
        const mergedReg: HaneenRegisteredSource[] = defaults.registeredSources.map(
          (seed) => regById.get(seed.registryId) || seed,
        );
        for (const saved of existingReg) {
          if (!mergedReg.some((r) => r.registryId === saved.registryId)) {
            mergedReg.push(saved);
          }
        }

        const existingGlossary = Array.isArray(parsed.glossary) ? parsed.glossary : [];
        const glossaryById = new Map(existingGlossary.map((g) => [g.glossaryId, g]));
        const mergedGlossary: HaneenGlossaryEntry[] = defaults.glossary.map((seed) => {
          const saved = glossaryById.get(seed.glossaryId);
          if (saved && saved.simpleMeaningAr !== seed.simpleMeaningAr) {
            needsPersist = true;
          }
          return seed;
        });
        for (const saved of existingGlossary) {
          if (!mergedGlossary.some((g) => g.glossaryId === saved.glossaryId)) {
            mergedGlossary.push(saved);
          }
        }

        const savedEmergencyAr = parsed.settings?.emergencyInstructionAr || '';
        const shouldUpgradeEmergencyAr =
          !savedEmergencyAr || savedEmergencyAr.includes('إذا كنت تعاني');
        if (shouldUpgradeEmergencyAr) {
          needsPersist = true;
        }

        const mergedState: HaneenStoreState = {
          sources: mergedSources,
          specialties: mergedSpecs,
          topics: mergedTopics,
          registeredSources: mergedReg,
          glossary: mergedGlossary,
          settings: {
            ...defaults.settings,
            ...(parsed.settings || {}),
            ...(shouldUpgradeEmergencyAr
              ? {
                  emergencyInstructionAr: defaults.settings.emergencyInstructionAr,
                  updatedAt: defaults.settings.updatedAt,
                }
              : {}),
          },
          conversations: parsed.conversations || {},
          messagesByConversation: parsed.messagesByConversation || {},
          rateBuckets: parsed.rateBuckets || {},
          telemetry: {
            ...defaults.telemetry,
            ...(parsed.telemetry || {}),
            recentMissedQueries: Array.isArray(parsed.telemetry?.recentMissedQueries)
              ? parsed.telemetry.recentMissedQueries.slice(0, 20)
              : [],
            recentTechnicalErrors: Array.isArray(parsed.telemetry?.recentTechnicalErrors)
              ? parsed.telemetry.recentTechnicalErrors.slice(0, 30)
              : [],
          },
        };
        if (needsPersist) {
          this.saveToDisk(mergedState);
        }
        return mergedState;
      }
    } catch (err) {
      console.warn('[MEDORA][HANEEN] Failed to load store file, initializing defaults:', err);
    }
    this.saveToDisk(defaults);
    return defaults;
  }

  private saveToDisk(targetState: HaneenStoreState = this.state): void {
    if (this.disposed) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(targetState, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[MEDORA][HANEEN] Failed to persist store to disk:', err);
    }
  }

  private scheduleSave(): void {
    if (this.disposed) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushAsync();
    }, 25);
    this.saveTimer.unref?.();
  }

  private async flushAsync(): Promise<void> {
    if (this.disposed) return;
    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    this.isSaving = true;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      if (!this.disposed) {
        await fs.promises.writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[MEDORA][HANEEN] Failed to persist store to disk:', err);
    } finally {
      this.isSaving = false;
      if (this.pendingSave && !this.disposed) {
        this.pendingSave = false;
        this.scheduleSave();
      }
    }
  }

  private async mirrorDocToFirestore(collectionPath: string, docId: string, data: unknown): Promise<void> {
    const db = this.getAdminDb?.();
    if (!db || !this.isFirestoreAdminReady?.()) return;
    try {
      await db.doc(`${collectionPath}/${docId}`).set(data as Record<string, unknown>, { merge: true });
    } catch {
      // Non-fatal mirror; disk store guarantees continuity
    }
  }

  private async deleteDocFromFirestore(collectionPath: string, docId: string): Promise<void> {
    const db = this.getAdminDb?.();
    if (!db || !this.isFirestoreAdminReady?.()) return;
    try {
      await db.doc(`${collectionPath}/${docId}`).delete();
    } catch {
      // Non-fatal
    }
  }

  getKnowledgeSources(): HaneenKnowledgeSource[] {
    return this.state.sources.map((s) => ({ ...s }));
  }

  getSpecialties(): HaneenSpecialtyNode[] {
    return this.state.specialties.map((s) => ({ ...s, subBranchesAr: [...s.subBranchesAr] }));
  }

  getTopics(): HaneenKnowledgeTopic[] {
    return this.state.topics.map((t) => ({
      ...t,
      relatedSymptoms: [...t.relatedSymptoms],
      relatedTests: [...t.relatedTests],
      emergencySigns: [...t.emergencySigns],
      keywords: [...t.keywords],
      history: t.history ? [...t.history] : [],
    }));
  }

  getApprovedTopics(): HaneenKnowledgeTopic[] {
    return this.state.topics.filter((t) => t.status === 'approved').map((t) => ({ ...t }));
  }

  getRegisteredSources(): HaneenRegisteredSource[] {
    return this.state.registeredSources.map((r) => ({ ...r }));
  }

  getGlossaryEntries(): HaneenGlossaryEntry[] {
    return this.state.glossary.map((g) => ({ ...g, aliases: [...g.aliases] }));
  }

  getAdminLibrarySnapshot(): HaneenAdminLibraryResponse {
    const specialties = this.getSpecialties();
    const topics = this.getTopics();
    return {
      specialties,
      topics,
      registeredSources: this.getRegisteredSources(),
      glossary: this.getGlossaryEntries(),
      roadmapSummary: computeLibraryRoadmapSummary(specialties, topics),
    };
  }

  async addKnowledgeSource(input: {
    titleAr: string;
    titleEn?: string;
    authority: string;
    sourceUrl: string;
    publishedAt: string;
    lastReviewedAt?: string;
    version: string;
    enabled?: boolean;
    keywords?: string[];
    content: string;
  }): Promise<HaneenKnowledgeSource> {
    const urlCheck = validateTrustedSourceUrl(input.sourceUrl);
    if (!urlCheck.ok) {
      throw new Error(urlCheck.reason);
    }

    const nowIso = new Date().toISOString();
    const nextCode = String(this.state.sources.length + 1).padStart(2, '0');
    const sourceId = `haneen_src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newSource: HaneenKnowledgeSource = {
      sourceId,
      code: nextCode,
      titleAr: input.titleAr.trim(),
      titleEn: (input.titleEn || input.titleAr).trim(),
      authority: input.authority.trim(),
      sourceUrl: input.sourceUrl.trim(),
      publishedAt: input.publishedAt.trim() || nowIso.slice(0, 10),
      lastReviewedAt: (input.lastReviewedAt || input.publishedAt || nowIso.slice(0, 10)).trim(),
      version: input.version.trim() || '1.0.0',
      enabled: input.enabled !== false,
      keywords: Array.isArray(input.keywords)
        ? input.keywords.map((k) => k.trim()).filter(Boolean)
        : [],
      content: input.content.trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.state.sources.push(newSource);
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_knowledge_sources', sourceId, newSource);
    return { ...newSource };
  }

  async updateKnowledgeSource(
    sourceId: string,
    patch: Partial<{
      titleAr: string;
      titleEn: string;
      authority: string;
      sourceUrl: string;
      publishedAt: string;
      lastReviewedAt: string;
      version: string;
      enabled: boolean;
      keywords: string[];
      content: string;
    }>,
  ): Promise<HaneenKnowledgeSource | null> {
    const idx = this.state.sources.findIndex((s) => s.sourceId === sourceId);
    if (idx === -1) return null;
    if (typeof patch.sourceUrl === 'string' && patch.sourceUrl.trim()) {
      const urlCheck = validateTrustedSourceUrl(patch.sourceUrl);
      if (!urlCheck.ok) throw new Error(urlCheck.reason);
    }

    const prev = this.state.sources[idx];
    const nowIso = new Date().toISOString();

    const updated: HaneenKnowledgeSource = {
      ...prev,
      ...(typeof patch.titleAr === 'string' && patch.titleAr.trim()
        ? { titleAr: patch.titleAr.trim() }
        : {}),
      ...(typeof patch.titleEn === 'string' && patch.titleEn.trim()
        ? { titleEn: patch.titleEn.trim() }
        : {}),
      ...(typeof patch.authority === 'string' && patch.authority.trim()
        ? { authority: patch.authority.trim() }
        : {}),
      ...(typeof patch.sourceUrl === 'string' && patch.sourceUrl.trim()
        ? { sourceUrl: patch.sourceUrl.trim() }
        : {}),
      ...(typeof patch.publishedAt === 'string' && patch.publishedAt.trim()
        ? { publishedAt: patch.publishedAt.trim() }
        : {}),
      ...(typeof patch.lastReviewedAt === 'string' && patch.lastReviewedAt.trim()
        ? { lastReviewedAt: patch.lastReviewedAt.trim() }
        : {}),
      ...(typeof patch.version === 'string' && patch.version.trim()
        ? { version: patch.version.trim() }
        : {}),
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
      ...(Array.isArray(patch.keywords)
        ? { keywords: patch.keywords.map((k) => k.trim()).filter(Boolean) }
        : {}),
      ...(typeof patch.content === 'string' && patch.content.trim()
        ? { content: patch.content.trim() }
        : {}),
      updatedAt: nowIso,
    };

    this.state.sources[idx] = updated;
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_knowledge_sources', sourceId, updated);
    return { ...updated };
  }

  // Knowledge Library Topics (Schema 08 + Strict Review Gate)
  async createKnowledgeTopic(
    input: {
      titleAr: string;
      mainSpecialty: string;
      subSpecialty?: string;
      domain: HaneenLibraryDomain;
      topicType?: string;
      ageGroup?: string;
      audience?: string;
      simpleExplanation: string;
      whatItMeans: string;
      patientNeedToKnow?: string;
      relatedSymptoms?: string[];
      relatedTests?: string[];
      preparation?: string;
      whenToSeeDoctor?: string;
      emergencySigns?: string[];
      whatCannotBeInferred?: string;
      sourceId?: string;
      sourceName: string;
      sourceUrl: string;
      publisher?: string;
      publishedOrUpdatedAt?: string;
      licenseOrRights?: string;
      keywords?: string[];
      initialStatus?: 'draft' | 'under_review';
    },
    actorEmail: string,
  ): Promise<HaneenKnowledgeTopic> {
    const urlCheck = validateTrustedSourceUrl(input.sourceUrl);
    if (!urlCheck.ok) {
      throw new Error(urlCheck.reason);
    }

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const topicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // Governance rule: newly added topics NEVER auto-approve!
    const status: HaneenTopicReviewStatus =
      input.initialStatus === 'under_review' ? 'under_review' : 'draft';

    const topic: HaneenKnowledgeTopic = {
      topicId,
      titleAr: input.titleAr.trim(),
      mainSpecialty: input.mainSpecialty.trim(),
      subSpecialty: (input.subSpecialty || input.mainSpecialty).trim(),
      domain: input.domain,
      topicType: (input.topicType || 'موضوع طبي').trim(),
      ageGroup: (input.ageGroup || 'جميع الأعمار').trim(),
      audience: (input.audience || 'المريض').trim(),
      simpleExplanation: input.simpleExplanation.trim(),
      whatItMeans: input.whatItMeans.trim(),
      patientNeedToKnow: (input.patientNeedToKnow || '').trim(),
      relatedSymptoms: (input.relatedSymptoms || []).map((s) => s.trim()).filter(Boolean),
      relatedTests: (input.relatedTests || []).map((s) => s.trim()).filter(Boolean),
      preparation: (input.preparation || '').trim(),
      whenToSeeDoctor: (input.whenToSeeDoctor || 'راجع الطبيب لتقييم الحالة مع الفحص السريري.').trim(),
      emergencySigns: (input.emergencySigns || []).map((s) => s.trim()).filter(Boolean),
      whatCannotBeInferred: (
        input.whatCannotBeInferred ||
        'المعلومات تثقيفية مبسطة ولا تغني عن الفحص والتشخيص الطبي المباشر.'
      ).trim(),
      sourceId: (input.sourceId || 'custom_verified').trim(),
      sourceName: input.sourceName.trim(),
      sourceUrl: input.sourceUrl.trim(),
      publisher: (input.publisher || input.sourceName).trim(),
      publishedOrUpdatedAt: (input.publishedOrUpdatedAt || today).trim(),
      accessedAt: today,
      licenseOrRights: (input.licenseOrRights || 'تلخيص تثقيفي مبسط مع حفظ المرجع').trim(),
      reviewerName: '',
      reviewedAt: '',
      status,
      version: '0.1.0',
      updatedAt: today,
      keywords: (input.keywords || []).map((k) => k.trim()).filter(Boolean),
      history: [
        {
          version: '0.1.0',
          updatedAt: nowIso,
          updatedBy: actorEmail,
          status,
          changeNote: 'إنشاء موضوع جديد بانتظار المراجعة التخصصية',
        },
      ],
    };

    this.state.topics.unshift(topic);
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_library_topics', topicId, topic);
    return { ...topic };
  }

  async updateKnowledgeTopic(
    topicId: string,
    patch: Partial<HaneenKnowledgeTopic>,
    actorEmail: string,
    changeNote = 'تحديث محتوى الموضوع',
  ): Promise<HaneenKnowledgeTopic | null> {
    const idx = this.state.topics.findIndex((t) => t.topicId === topicId);
    if (idx === -1) return null;

    const prev = this.state.topics[idx];
    const nextUrl = typeof patch.sourceUrl === 'string' && patch.sourceUrl.trim() ? patch.sourceUrl.trim() : prev.sourceUrl;
    const urlCheck = validateTrustedSourceUrl(nextUrl);
    if (!urlCheck.ok) {
      throw new Error(urlCheck.reason);
    }

    const nextStatus: HaneenTopicReviewStatus = patch.status || prev.status;
    const nextReviewer =
      typeof patch.reviewerName === 'string' ? patch.reviewerName.trim() : prev.reviewerName;

    if (nextStatus === 'approved' && (!nextReviewer || nextReviewer.length < 3)) {
      throw new Error('REVIEWER_REQUIRED_FOR_APPROVAL');
    }

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const nextVersion =
      typeof patch.version === 'string' && patch.version.trim()
        ? patch.version.trim()
        : bumpPatchVersion(prev.version);

    const historyEntry = {
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actorEmail,
      status: nextStatus,
      changeNote,
    };

    const updated: HaneenKnowledgeTopic = {
      ...prev,
      ...patch,
      topicId: prev.topicId,
      sourceUrl: nextUrl,
      reviewerName: nextReviewer,
      reviewedAt:
        nextStatus === 'approved'
          ? (typeof patch.reviewedAt === 'string' && patch.reviewedAt.trim()) || prev.reviewedAt || today
          : prev.reviewedAt,
      status: nextStatus,
      version: nextVersion,
      updatedAt: today,
      history: [historyEntry, ...(prev.history || [])].slice(0, 15),
    };

    this.state.topics[idx] = updated;
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_library_topics', topicId, updated);
    return { ...updated };
  }

  async reviewKnowledgeTopic(
    topicId: string,
    input: {
      status: HaneenTopicReviewStatus;
      reviewerName?: string;
      changeNote?: string;
    },
    actorEmail: string,
  ): Promise<HaneenKnowledgeTopic | null> {
    const idx = this.state.topics.findIndex((t) => t.topicId === topicId);
    if (idx === -1) return null;
    const prev = this.state.topics[idx];
    const reviewer = (input.reviewerName || prev.reviewerName || '').trim();
    if (input.status === 'approved' && reviewer.length < 3) {
      throw new Error('REVIEWER_REQUIRED_FOR_APPROVAL');
    }

    const urlCheck = validateTrustedSourceUrl(prev.sourceUrl);
    if (input.status === 'approved' && !urlCheck.ok) {
      throw new Error(urlCheck.reason);
    }

    const today = new Date().toISOString().slice(0, 10);
    return this.updateKnowledgeTopic(
      topicId,
      {
        status: input.status,
        reviewerName: reviewer,
        reviewedAt: input.status === 'approved' ? today : prev.reviewedAt,
        version: input.status === 'approved' && prev.version.startsWith('0.') ? '1.0.0' : bumpPatchVersion(prev.version),
      },
      actorEmail,
      input.changeNote ||
        (input.status === 'approved'
          ? `اعتماد طبي من المراجع: ${reviewer}`
          : input.status === 'retired'
            ? 'تعطيل/إحالة الموضوع للتقاعد'
            : `تغيير حالة المراجعة إلى ${input.status}`),
    );
  }

  async updateSpecialtyNode(
    specialtyId: string,
    patch: Partial<{ enabled: boolean; completeness: HaneenCompletenessStatus; notesAr: string }>,
  ): Promise<HaneenSpecialtyNode | null> {
    const idx = this.state.specialties.findIndex((s) => s.specialtyId === specialtyId);
    if (idx === -1) return null;
    const prev = this.state.specialties[idx];
    const updated: HaneenSpecialtyNode = {
      ...prev,
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
      ...(patch.completeness === 'populated' ||
      patch.completeness === 'intro_only' ||
      patch.completeness === 'missing'
        ? { completeness: patch.completeness }
        : {}),
      ...(typeof patch.notesAr === 'string' ? { notesAr: patch.notesAr.trim() } : {}),
    };
    this.state.specialties[idx] = updated;
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_library_specialties', specialtyId, updated);
    return { ...updated };
  }

  async updateRegisteredSource(
    registryId: string,
    patch: Partial<{ active: boolean; patientFacingAllowed: boolean; notes: string }>,
  ): Promise<HaneenRegisteredSource | null> {
    const idx = this.state.registeredSources.findIndex((r) => r.registryId === registryId);
    if (idx === -1) return null;
    const prev = this.state.registeredSources[idx];
    const updated: HaneenRegisteredSource = {
      ...prev,
      ...(typeof patch.active === 'boolean' ? { active: patch.active } : {}),
      ...(typeof patch.patientFacingAllowed === 'boolean'
        ? { patientFacingAllowed: patch.patientFacingAllowed }
        : {}),
      ...(typeof patch.notes === 'string' ? { notes: patch.notes.trim() } : {}),
    };
    this.state.registeredSources[idx] = updated;
    this.saveToDisk();
    return { ...updated };
  }

  getSettings(): HaneenSettings {
    return { ...this.state.settings };
  }

  async updateSettings(
    patch: Partial<{
      enabled: boolean;
      rateLimitPerHour: number;
      maxHistoryMessages: number;
      dialectMode: HaneenDialectMode;
      allowReportAttachment: boolean;
      retentionDays: number;
      emergencyInstructionAr: string;
      emergencyInstructionEn: string;
    }>,
  ): Promise<HaneenSettings> {
    const next: HaneenSettings = {
      ...this.state.settings,
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
      ...(typeof patch.rateLimitPerHour === 'number' && Number.isFinite(patch.rateLimitPerHour)
        ? { rateLimitPerHour: Math.max(1, Math.min(200, Math.round(patch.rateLimitPerHour))) }
        : {}),
      ...(typeof patch.maxHistoryMessages === 'number' && Number.isFinite(patch.maxHistoryMessages)
        ? { maxHistoryMessages: Math.max(4, Math.min(40, Math.round(patch.maxHistoryMessages))) }
        : {}),
      ...(patch.dialectMode === 'iraqi_polite' || patch.dialectMode === 'msa_simple'
        ? { dialectMode: patch.dialectMode }
        : {}),
      ...(typeof patch.allowReportAttachment === 'boolean'
        ? { allowReportAttachment: patch.allowReportAttachment }
        : {}),
      ...(typeof patch.retentionDays === 'number' && Number.isFinite(patch.retentionDays)
        ? { retentionDays: Math.max(7, Math.min(365, Math.round(patch.retentionDays))) }
        : {}),
      ...(typeof patch.emergencyInstructionAr === 'string' && patch.emergencyInstructionAr.trim()
        ? { emergencyInstructionAr: patch.emergencyInstructionAr.trim().slice(0, 600) }
        : {}),
      ...(typeof patch.emergencyInstructionEn === 'string' && patch.emergencyInstructionEn.trim()
        ? { emergencyInstructionEn: patch.emergencyInstructionEn.trim().slice(0, 600) }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    this.state.settings = next;
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_settings', 'default', next);
    return { ...next };
  }

  listPatientConversations(patientUid: string): HaneenConversation[] {
    return Object.values(this.state.conversations)
      .filter((c) => c.patientUid === patientUid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({ ...c }));
  }

  getConversationForPatient(
    conversationId: string,
    patientUid: string,
  ):
    | { ok: true; conversation: HaneenConversation }
    | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' } {
    const conv = this.state.conversations[conversationId];
    if (!conv) {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (conv.patientUid !== patientUid) {
      return { ok: false, reason: 'FORBIDDEN' };
    }
    return { ok: true, conversation: { ...conv } };
  }

  createConversation(patientUid: string, title = 'محادثة تثقيفية جديدة'): HaneenConversation {
    const nowIso = new Date().toISOString();
    const conversationId = `hconv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const conv: HaneenConversation = {
      conversationId,
      patientUid,
      title: title.trim().slice(0, 100) || 'محادثة تثقيفية جديدة',
      consentGiven: false,
      consentUpdatedAt: null,
      sharedResultIds: [],
      sharedFileIds: [],
      messageCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.state.conversations[conversationId] = conv;
    this.state.messagesByConversation[conversationId] = [];
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_conversations', conversationId, conv);
    return { ...conv };
  }

  updateConversationConsent(
    conversationId: string,
    patientUid: string,
    patch: {
      consentGiven: boolean;
      sharedResultIds?: string[];
      sharedFileIds?: string[];
    },
  ):
    | { ok: true; conversation: HaneenConversation }
    | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' } {
    const existing = this.state.conversations[conversationId];
    if (!existing) return { ok: false, reason: 'NOT_FOUND' };
    if (existing.patientUid !== patientUid) return { ok: false, reason: 'FORBIDDEN' };

    const nowIso = new Date().toISOString();
    const updated: HaneenConversation = {
      ...existing,
      consentGiven: Boolean(patch.consentGiven),
      consentUpdatedAt: nowIso,
      sharedResultIds: patch.consentGiven
        ? Array.isArray(patch.sharedResultIds)
          ? patch.sharedResultIds
          : existing.sharedResultIds
        : [],
      sharedFileIds: patch.consentGiven
        ? Array.isArray(patch.sharedFileIds)
          ? patch.sharedFileIds
          : existing.sharedFileIds
        : [],
      updatedAt: nowIso,
    };
    this.state.conversations[conversationId] = updated;
    this.saveToDisk();
    void this.mirrorDocToFirestore('haneen_conversations', conversationId, updated);
    return { ok: true, conversation: { ...updated } };
  }

  deleteConversationForPatient(
    conversationId: string,
    patientUid: string,
  ): { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' } {
    const existing = this.state.conversations[conversationId];
    if (!existing) return { ok: false, reason: 'NOT_FOUND' };
    if (existing.patientUid !== patientUid) return { ok: false, reason: 'FORBIDDEN' };

    const msgs = this.state.messagesByConversation[conversationId] || [];
    for (const msg of msgs) {
      void this.deleteDocFromFirestore('haneen_messages', msg.messageId);
    }
    delete this.state.conversations[conversationId];
    delete this.state.messagesByConversation[conversationId];
    this.saveToDisk();
    void this.deleteDocFromFirestore('haneen_conversations', conversationId);
    return { ok: true };
  }

  getMessagesForConversation(
    conversationId: string,
    patientUid: string,
  ):
    | { ok: true; messages: HaneenMessage[] }
    | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' } {
    const conv = this.state.conversations[conversationId];
    if (!conv) return { ok: false, reason: 'NOT_FOUND' };
    if (conv.patientUid !== patientUid) return { ok: false, reason: 'FORBIDDEN' };
    const msgs = this.state.messagesByConversation[conversationId] || [];
    return { ok: true, messages: msgs.map((m) => ({ ...m })) };
  }

  appendMessage(
    message: Omit<HaneenMessage, 'messageId' | 'createdAt'>,
    autoTitleCandidate?: string,
  ): { message: HaneenMessage; conversation: HaneenConversation } {
    const nowIso = new Date().toISOString();
    const messageId = `hmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullMsg: HaneenMessage = {
      ...message,
      messageId,
      createdAt: nowIso,
    };
    const existingList = this.state.messagesByConversation[message.conversationId] || [];
    existingList.push(fullMsg);
    this.state.messagesByConversation[message.conversationId] = existingList;

    const conv = this.state.conversations[message.conversationId];
    if (conv) {
      conv.messageCount = existingList.length;
      conv.updatedAt = nowIso;
      if (
        autoTitleCandidate &&
        (conv.title === 'محادثة تثقيفية جديدة' || conv.title === 'New Haneen Chat')
      ) {
        conv.title = autoTitleCandidate.trim().slice(0, 60) || conv.title;
      }
      this.state.conversations[message.conversationId] = conv;
      void this.mirrorDocToFirestore('haneen_conversations', conv.conversationId, conv);
    }

    this.scheduleSave();
    void this.mirrorDocToFirestore('haneen_messages', messageId, fullMsg);
    return {
      message: { ...fullMsg },
      conversation: conv ? { ...conv } : this.createConversation(message.patientUid),
    };
  }

  checkAndConsumeRateLimit(patientUid: string, limitPerHour: number): {
    allowed: boolean;
    remaining: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const prev = (this.state.rateBuckets[patientUid] || []).filter((ts) => ts > oneHourAgo);
    if (prev.length >= limitPerHour) {
      this.state.rateBuckets[patientUid] = prev;
      this.scheduleSave();
      return { allowed: false, remaining: 0 };
    }
    prev.push(now);
    this.state.rateBuckets[patientUid] = prev;
    this.scheduleSave();
    return { allowed: true, remaining: Math.max(0, limitPerHour - prev.length) };
  }

  recordTelemetry(event: {
    isEmergency?: boolean;
    isRefusal?: boolean;
    latencyMs?: number;
    errorCode?: string;
    errorStage?: string;
    retrievalHit?: boolean;
    missedQueryRaw?: string;
  }): void {
    const t = this.state.telemetry;
    t.totalQuestions += 1;
    if (event.isEmergency) t.emergencyRedirects += 1;
    if (event.isRefusal) t.safetyRefusals += 1;
    if (event.retrievalHit === true) {
      t.retrievalHits += 1;
    } else if (event.retrievalHit === false) {
      t.retrievalMisses += 1;
      if (event.missedQueryRaw) {
        const sanitized = sanitizeQueryTopicForTelemetry(event.missedQueryRaw);
        if (sanitized.length >= 4) {
          t.recentMissedQueries = [
            { timestamp: new Date().toISOString(), queryTopic: sanitized },
            ...t.recentMissedQueries,
          ].slice(0, 15);
        }
      }
    }
    if (typeof event.latencyMs === 'number' && Number.isFinite(event.latencyMs)) {
      t.latencySumMs += Math.max(0, Math.round(event.latencyMs));
      t.latencySamples += 1;
    }
    if (event.errorCode) {
      t.errorCount += 1;
      t.recentTechnicalErrors = [
        {
          timestamp: new Date().toISOString(),
          code: event.errorCode.slice(0, 80),
          stage: (event.errorStage || 'chat').slice(0, 40),
        },
        ...t.recentTechnicalErrors,
      ].slice(0, 25);
    }
    this.scheduleSave();
    void this.mirrorDocToFirestore('haneen_telemetry', 'summary', {
      totalQuestions: t.totalQuestions,
      emergencyRedirects: t.emergencyRedirects,
      safetyRefusals: t.safetyRefusals,
      errorCount: t.errorCount,
      retrievalHits: t.retrievalHits,
      retrievalMisses: t.retrievalMisses,
      avgLatencyMs:
        t.latencySamples > 0 ? Math.round(t.latencySumMs / t.latencySamples) : 0,
      updatedAt: new Date().toISOString(),
    });
  }

  getAdminTelemetry(geminiConfigured: boolean, modelName: string): HaneenAdminTelemetry {
    const t = this.state.telemetry;
    const sources = this.state.sources;
    const topics = this.state.topics;
    return {
      geminiConfigured,
      modelName,
      totalQuestions: t.totalQuestions,
      emergencyRedirects: t.emergencyRedirects,
      safetyRefusals: t.safetyRefusals,
      errorCount: t.errorCount,
      avgLatencyMs:
        t.latencySamples > 0 ? Math.round(t.latencySumMs / t.latencySamples) : 0,
      activeSourcesCount: sources.filter((s) => s.enabled).length,
      totalSourcesCount: sources.length,
      approvedTopicsCount: topics.filter((tp) => tp.status === 'approved').length,
      totalTopicsCount: topics.length,
      retrievalHits: t.retrievalHits,
      retrievalMisses: t.retrievalMisses,
      recentMissedQueries: [...t.recentMissedQueries],
      recentTechnicalErrors: [...t.recentTechnicalErrors],
    };
  }
}

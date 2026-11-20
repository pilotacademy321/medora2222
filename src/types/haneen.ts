export type HaneenDialectMode = 'iraqi_polite' | 'msa_simple';

export type HaneenDetailLevel = 'brief' | 'standard' | 'detailed';

export type HaneenLibraryDomain = 'labs' | 'imaging' | 'clinical';

export type HaneenCompletenessStatus = 'populated' | 'intro_only' | 'missing';

export type HaneenTopicReviewStatus = 'draft' | 'under_review' | 'approved' | 'retired';

export type HaneenRoadmapPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface HaneenCitation {
  sourceId: string;
  code: string;
  titleAr: string;
  titleEn: string;
  authority: string;
  sourceUrl: string;
  publishedAt: string;
  lastReviewedAt: string;
  version: string;
}

export interface HaneenKnowledgeSource {
  sourceId: string;
  code: string;
  titleAr: string;
  titleEn: string;
  authority: string;
  sourceUrl: string;
  relatedUrls?: Array<{ label: string; url: string }>;
  publishedAt: string;
  lastReviewedAt: string;
  version: string;
  enabled: boolean;
  keywords: string[];
  content: string;
  originFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HaneenSpecialtyNode {
  specialtyId: string;
  code: string;
  domain: HaneenLibraryDomain;
  mainGroupAr: string;
  titleAr: string;
  titleEn: string;
  subBranchesAr: string[];
  completeness: HaneenCompletenessStatus;
  roadmapPriority: HaneenRoadmapPriority;
  enabled: boolean;
  notesAr?: string;
}

export interface HaneenTopicVersionSnapshot {
  version: string;
  updatedAt: string;
  updatedBy: string;
  status: HaneenTopicReviewStatus;
  changeNote: string;
}

export interface HaneenKnowledgeTopic {
  topicId: string;
  titleAr: string;
  mainSpecialty: string;
  subSpecialty: string;
  domain: HaneenLibraryDomain;
  topicType: string;
  ageGroup: string;
  audience: string;
  simpleExplanation: string;
  whatItMeans: string;
  patientNeedToKnow: string;
  relatedSymptoms: string[];
  relatedTests: string[];
  preparation: string;
  whenToSeeDoctor: string;
  emergencySigns: string[];
  whatCannotBeInferred: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  publisher: string;
  publishedOrUpdatedAt: string;
  accessedAt: string;
  licenseOrRights: string;
  reviewerName: string;
  reviewedAt: string;
  status: HaneenTopicReviewStatus;
  version: string;
  updatedAt: string;
  keywords: string[];
  history?: HaneenTopicVersionSnapshot[];
}

export interface HaneenRegisteredSource {
  registryId: string;
  name: string;
  authority: string;
  language: string;
  specialtyFocus: string;
  baseUrl: string;
  licenseNotes: string;
  allowFullTextStorage: boolean;
  patientFacingAllowed: boolean;
  active: boolean;
  notes?: string;
}

export interface HaneenGlossaryEntry {
  glossaryId: string;
  termEn: string;
  aliases: string[];
  termAr: string;
  simpleMeaningAr: string;
  domain: HaneenLibraryDomain | 'general';
}

export interface HaneenSettings {
  enabled: boolean;
  rateLimitPerHour: number;
  maxHistoryMessages: number;
  dialectMode: HaneenDialectMode;
  allowReportAttachment: boolean;
  retentionDays: number;
  emergencyInstructionAr: string;
  emergencyInstructionEn: string;
  updatedAt: string;
}

export interface HaneenAttachedReportSummary {
  kind: 'lab_result' | 'medical_file' | 'uploaded_image';
  label: string;
  labName?: string;
  testDate?: string;
  analytesCount?: number;
  attachmentsCount?: number;
}

export interface HaneenUploadedAttachment {
  base64Data: string;
  mimeType: string;
  fileName: string;
}

export type HaneenLabComparisonStatus =
  | 'within_range'
  | 'above_range'
  | 'below_range'
  | 'qualitative'
  | 'undetermined'
  | 'unreadable';

export type HaneenExtractionConfidence = 'clear' | 'needs_confirmation' | 'unreadable';

export interface HaneenExtractedLabRow {
  testName: string;
  shortName?: string;
  value: string;
  unit: string;
  referenceRange: string;
  labFlag?: string;
  comparisonStatus: HaneenLabComparisonStatus;
  confidence: HaneenExtractionConfidence;
}

export interface HaneenExtractedLabReport {
  isMedicalLabReport: boolean;
  isImagingFilmOnly?: boolean;
  imageClarity: 'clear' | 'partially_unclear' | 'unreadable';
  clarityNoteAr?: string;
  pagesDetected: number;
  reportHeader?: {
    labName?: string;
    reportDate?: string;
    sampleType?: string;
  };
  hasCriticalFlag: boolean;
  rows: HaneenExtractedLabRow[];
  nonReadableNotes?: string[];
  summaryCounts: {
    totalRows: number;
    withinRangeCount: number;
    outOfRangeCount: number;
    undeterminedCount: number;
    unreadableCount: number;
  };
}

export interface HaneenMessage {
  messageId: string;
  conversationId: string;
  patientUid: string;
  role: 'user' | 'assistant';
  text: string;
  isEmergency?: boolean;
  isRefusal?: boolean;
  isFallback?: boolean;
  isFastReply?: boolean;
  isCached?: boolean;
  detailLevel?: HaneenDetailLevel;
  attachedReportSummary?: HaneenAttachedReportSummary | null;
  extractedReport?: HaneenExtractedLabReport | null;
  citations: HaneenCitation[];
  createdAt: string;
}

export interface HaneenConversation {
  conversationId: string;
  patientUid: string;
  title: string;
  consentGiven: boolean;
  consentUpdatedAt: string | null;
  sharedResultIds: string[];
  sharedFileIds: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HaneenTechnicalErrorLog {
  timestamp: string;
  code: string;
  stage: string;
}

export interface HaneenMissedQueryLog {
  timestamp: string;
  queryTopic: string;
}

export interface HaneenAdminTelemetry {
  geminiConfigured: boolean;
  modelName: string;
  totalQuestions: number;
  emergencyRedirects: number;
  safetyRefusals: number;
  errorCount: number;
  avgLatencyMs: number;
  activeSourcesCount: number;
  totalSourcesCount: number;
  approvedTopicsCount: number;
  totalTopicsCount: number;
  retrievalHits: number;
  retrievalMisses: number;
  recentMissedQueries: HaneenMissedQueryLog[];
  recentTechnicalErrors: HaneenTechnicalErrorLog[];
}

export interface HaneenBootstrapResponse {
  settings: {
    enabled: boolean;
    dialectMode: HaneenDialectMode;
    allowReportAttachment: boolean;
    emergencyInstructionAr: string;
    emergencyInstructionEn: string;
    rateLimitPerHour: number;
  };
  geminiConfigured: boolean;
  sourcesMetadata: HaneenCitation[];
  libraryStats?: {
    specialtiesCount: number;
    approvedTopicsCount: number;
    glossaryCount: number;
  };
  conversations: HaneenConversation[];
  activeConversationId: string | null;
  messages: HaneenMessage[];
}

export interface HaneenChatResponse {
  conversation: HaneenConversation;
  userMessage: HaneenMessage;
  assistantMessage: HaneenMessage;
  geminiConfigured: boolean;
}

export interface HaneenLibraryRoadmapSummary {
  totalSpecialties: number;
  populatedSpecialties: number;
  introOnlySpecialties: number;
  missingSpecialties: number;
  approvedTopics: number;
  underReviewTopics: number;
  draftTopics: number;
  retiredTopics: number;
}

export interface HaneenAdminOverviewResponse {
  sources: HaneenKnowledgeSource[];
  settings: HaneenSettings;
  telemetry: HaneenAdminTelemetry;
}

export interface HaneenAdminLibraryResponse {
  specialties: HaneenSpecialtyNode[];
  topics: HaneenKnowledgeTopic[];
  registeredSources: HaneenRegisteredSource[];
  glossary: HaneenGlossaryEntry[];
  roadmapSummary: HaneenLibraryRoadmapSummary;
}

export interface HaneenLabComparisonPoint {
  resultId: string;
  reportNumber: string;
  labName: string;
  date: string;
  rawValue: string;
  numericValue: number | null;
  unit: string;
  referenceRange: string;
  flag: string;
}

export interface HaneenLabComparisonSeries {
  seriesKey: string;
  testName: string;
  unit: string;
  comparable: boolean;
  incompatibilityReasonAr?: string;
  trendDirection: 'up' | 'down' | 'stable' | 'insufficient_data' | 'unit_mismatch';
  deltaValue?: number | null;
  latestPrintedReferenceRange: string;
  points: HaneenLabComparisonPoint[];
  haneenSummaryAr: string;
}

export interface HaneenLabComparisonResponse {
  consentVerified: boolean;
  reportsScanned: number;
  comparableSeriesCount: number;
  nonComparableSeriesCount: number;
  series: HaneenLabComparisonSeries[];
  safetyDisclaimerAr: string;
}

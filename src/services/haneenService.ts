import { type User } from 'firebase/auth';
import type {
  HaneenAdminLibraryResponse,
  HaneenAdminOverviewResponse,
  HaneenBootstrapResponse,
  HaneenChatResponse,
  HaneenCitation,
  HaneenCompletenessStatus,
  HaneenConversation,
  HaneenDetailLevel,
  HaneenExtractedLabReport,
  HaneenKnowledgeSource,
  HaneenKnowledgeTopic,
  HaneenLabComparisonResponse,
  HaneenLibraryDomain,
  HaneenMessage,
  HaneenRegisteredSource,
  HaneenSettings,
  HaneenSpecialtyNode,
  HaneenTopicReviewStatus,
  HaneenUploadedAttachment,
} from '../types/haneen';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJsonOrThrow<T>(res: Response, fallbackCode: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!res.ok) {
    throw new Error(body.message || body.error || fallbackCode);
  }
  return body;
}

export async function fetchHaneenBootstrap(
  firebaseUser: User,
  conversationId?: string,
): Promise<HaneenBootstrapResponse> {
  const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
  const res = await fetch(`/api/patient/haneen/bootstrap${qs}`, {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<HaneenBootstrapResponse>(res, 'HANEEN_BOOTSTRAP_FAILED');
}

export async function comparePatientLabResultsWithHaneen(
  firebaseUser: User,
  payload: { consentGiven: boolean; resultIds?: string[] },
): Promise<HaneenLabComparisonResponse> {
  const res = await fetch('/api/patient/haneen/compare-results', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<HaneenLabComparisonResponse>(res, 'HANEEN_LAB_COMPARISON_FAILED');
}

export async function createHaneenConversation(
  firebaseUser: User,
  title?: string,
): Promise<HaneenConversation> {
  const res = await fetch('/api/patient/haneen/conversations', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ title }),
  });
  const data = await parseJsonOrThrow<{ conversation: HaneenConversation }>(
    res,
    'HANEEN_CREATE_CONV_FAILED',
  );
  return data.conversation;
}

export async function updateHaneenConsent(
  firebaseUser: User,
  conversationId: string,
  payload: {
    consentGiven: boolean;
    sharedResultIds?: string[];
    sharedFileIds?: string[];
  },
): Promise<HaneenConversation> {
  const res = await fetch(
    `/api/patient/haneen/conversations/${encodeURIComponent(conversationId)}/consent`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJsonOrThrow<{ conversation: HaneenConversation }>(
    res,
    'HANEEN_CONSENT_UPDATE_FAILED',
  );
  return data.conversation;
}

export async function deleteHaneenConversation(
  firebaseUser: User,
  conversationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/haneen/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'HANEEN_DELETE_CONV_FAILED');
}

export interface HaneenChatPayload {
  conversationId: string;
  message: string;
  detailLevel?: HaneenDetailLevel;
  attachedResultId?: string;
  attachedFileId?: string;
  uploadedAttachment?: HaneenUploadedAttachment;
  uploadedAttachments?: HaneenUploadedAttachment[];
}

export async function sendHaneenChatMessage(
  firebaseUser: User,
  payload: HaneenChatPayload,
): Promise<HaneenChatResponse> {
  const res = await fetch('/api/patient/haneen/chat', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<HaneenChatResponse>(res, 'HANEEN_CHAT_FAILED');
}

export async function sendHaneenChatMessageStream(
  firebaseUser: User,
  payload: HaneenChatPayload,
  callbacks?: {
    onMeta?: (meta: {
      conversation: HaneenConversation;
      userMessage: HaneenMessage;
      citations: HaneenCitation[];
      extractedReport?: HaneenExtractedLabReport | null;
      detailLevel?: HaneenDetailLevel;
      isFastReply?: boolean;
      isEmergency?: boolean;
      isRefusal?: boolean;
      isCached?: boolean;
    }) => void;
    onChunk?: (accumulatedText: string) => void;
  },
): Promise<HaneenChatResponse> {
  const res = await fetch('/api/patient/haneen/chat-stream', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return parseJsonOrThrow<HaneenChatResponse>(res, 'HANEEN_CHAT_FAILED');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    return parseJsonOrThrow<HaneenChatResponse>(res, 'HANEEN_CHAT_FAILED');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finalResponse: HaneenChatResponse | null = null;
  let sseError: string | null = null;

  const processBlock = (block: string) => {
    const lines = block.split('\n');
    let eventName = 'message';
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }
    if (!dataLine) return;
    try {
      const parsed = JSON.parse(dataLine) as Record<string, unknown>;
      if (eventName === 'meta' && callbacks?.onMeta) {
        callbacks.onMeta(
          parsed as {
            conversation: HaneenConversation;
            userMessage: HaneenMessage;
            citations: HaneenCitation[];
            extractedReport?: HaneenExtractedLabReport | null;
            detailLevel?: HaneenDetailLevel;
            isFastReply?: boolean;
            isEmergency?: boolean;
            isRefusal?: boolean;
            isCached?: boolean;
          },
        );
      } else if (eventName === 'chunk') {
        const delta = typeof parsed.delta === 'string' ? parsed.delta : '';
        if (delta) {
          accumulated += delta;
          callbacks?.onChunk?.(accumulated);
        }
      } else if (eventName === 'done') {
        finalResponse = parsed as unknown as HaneenChatResponse;
      } else if (eventName === 'error') {
        sseError =
          (typeof parsed.message === 'string' && parsed.message) ||
          (typeof parsed.error === 'string' && parsed.error) ||
          'HANEEN_CHAT_FAILED';
      }
    } catch {
      // Ignore malformed SSE fragment
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      if (block.trim()) processBlock(block);
      sepIdx = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) {
    processBlock(buffer);
  }

  if (sseError) {
    throw new Error(sseError);
  }
  if (finalResponse) {
    return finalResponse;
  }
  return sendHaneenChatMessage(firebaseUser, payload);
}

export async function fetchAdminHaneenOverview(
  firebaseUser: User,
): Promise<HaneenAdminOverviewResponse> {
  const res = await fetch('/api/admin/haneen/overview', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<HaneenAdminOverviewResponse>(
    res,
    'ADMIN_HANEEN_OVERVIEW_FAILED',
  );
}

export async function fetchAdminHaneenLibrary(
  firebaseUser: User,
): Promise<HaneenAdminLibraryResponse> {
  const res = await fetch('/api/admin/haneen/library', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<HaneenAdminLibraryResponse>(
    res,
    'ADMIN_HANEEN_LIBRARY_FAILED',
  );
}

export async function createAdminHaneenTopic(
  firebaseUser: User,
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
): Promise<HaneenKnowledgeTopic> {
  const res = await fetch('/api/admin/haneen/topics', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ topic: HaneenKnowledgeTopic }>(
    res,
    'ADMIN_HANEEN_CREATE_TOPIC_FAILED',
  );
  return data.topic;
}

export async function updateAdminHaneenTopic(
  firebaseUser: User,
  topicId: string,
  patch: Partial<HaneenKnowledgeTopic> & { changeNote?: string },
): Promise<HaneenKnowledgeTopic> {
  const res = await fetch(
    `/api/admin/haneen/topics/${encodeURIComponent(topicId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const data = await parseJsonOrThrow<{ topic: HaneenKnowledgeTopic }>(
    res,
    'ADMIN_HANEEN_UPDATE_TOPIC_FAILED',
  );
  return data.topic;
}

export async function reviewAdminHaneenTopic(
  firebaseUser: User,
  topicId: string,
  payload: {
    status: HaneenTopicReviewStatus;
    reviewerName?: string;
    changeNote?: string;
  },
): Promise<HaneenKnowledgeTopic> {
  const res = await fetch(
    `/api/admin/haneen/topics/${encodeURIComponent(topicId)}/review`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(payload),
    },
  );
  const data = await parseJsonOrThrow<{ topic: HaneenKnowledgeTopic }>(
    res,
    'ADMIN_HANEEN_REVIEW_TOPIC_FAILED',
  );
  return data.topic;
}

export async function updateAdminHaneenSpecialty(
  firebaseUser: User,
  specialtyId: string,
  patch: Partial<{ enabled: boolean; completeness: HaneenCompletenessStatus; notesAr: string }>,
): Promise<HaneenSpecialtyNode> {
  const res = await fetch(
    `/api/admin/haneen/specialties/${encodeURIComponent(specialtyId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const data = await parseJsonOrThrow<{ specialty: HaneenSpecialtyNode }>(
    res,
    'ADMIN_HANEEN_UPDATE_SPECIALTY_FAILED',
  );
  return data.specialty;
}

export async function updateAdminHaneenRegisteredSource(
  firebaseUser: User,
  registryId: string,
  patch: Partial<{ active: boolean; patientFacingAllowed: boolean; notes: string }>,
): Promise<HaneenRegisteredSource> {
  const res = await fetch(
    `/api/admin/haneen/registered-sources/${encodeURIComponent(registryId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const data = await parseJsonOrThrow<{ registeredSource: HaneenRegisteredSource }>(
    res,
    'ADMIN_HANEEN_UPDATE_REG_SOURCE_FAILED',
  );
  return data.registeredSource;
}

export async function createAdminHaneenSource(
  firebaseUser: User,
  input: {
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
  },
): Promise<HaneenKnowledgeSource> {
  const res = await fetch('/api/admin/haneen/sources', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ source: HaneenKnowledgeSource }>(
    res,
    'ADMIN_HANEEN_CREATE_SOURCE_FAILED',
  );
  return data.source;
}

export async function updateAdminHaneenSource(
  firebaseUser: User,
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
): Promise<HaneenKnowledgeSource> {
  const res = await fetch(
    `/api/admin/haneen/sources/${encodeURIComponent(sourceId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const data = await parseJsonOrThrow<{ source: HaneenKnowledgeSource }>(
    res,
    'ADMIN_HANEEN_UPDATE_SOURCE_FAILED',
  );
  return data.source;
}

export async function updateAdminHaneenSettings(
  firebaseUser: User,
  patch: Partial<HaneenSettings>,
): Promise<HaneenSettings> {
  const res = await fetch('/api/admin/haneen/settings', {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(patch),
  });
  const data = await parseJsonOrThrow<{ settings: HaneenSettings }>(
    res,
    'ADMIN_HANEEN_UPDATE_SETTINGS_FAILED',
  );
  return data.settings;
}

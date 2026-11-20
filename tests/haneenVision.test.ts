import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import type { GoogleGenAI } from '@google/genai';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { createFirestoreRestClient } from '../server/firestoreRest.ts';
import { loadLabReadingGuidancePack } from '../server/haneenKnowledge.ts';
import {
  buildLabReportTableMarkdown,
  buildStructuredFallbackFromExtractedReport,
  buildUnreadableReportResponseText,
  createHaneenRouter,
  HANEEN_GEMINI_MODEL,
  normalizeAttachmentMimeType,
  postProcessExtractedLabReport,
} from '../server/haneenRoutes.ts';
import { HaneenStore } from '../server/haneenStore.ts';
import type { HaneenChatResponse, HaneenExtractedLabReport } from '../src/types/haneen.ts';

type DocData = Record<string, unknown>;

// ============================================================================
// Pure Node Synthetic PNG Generator (real valid PNGs for Vision tests)
// ============================================================================
const FONT_5X7: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

function renderSyntheticLabPngBase64(lines: string[], blurryNoise = false): string {
  const width = blurryNoise ? 120 : 900;
  const height = blurryNoise ? 60 : Math.max(220, 48 + lines.length * 36);
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height, 255);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter type 0
  }

  const setPixel = (px: number, py: number, r: number, g: number, b: number) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    const offset = py * stride + 1 + px * 3;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
  };

  if (blurryNoise) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = 165 + ((x * 7 + y * 13) % 50);
        setPixel(x, y, v, v, v);
      }
    }
  } else {
    const scale = 2;
    let cursorY = 26;
    for (const rawLine of lines) {
      let cursorX = 24;
      for (const ch of rawLine.toUpperCase()) {
        const glyph = FONT_5X7[ch] || FONT_5X7[' '];
        for (let gy = 0; gy < 7; gy++) {
          for (let gx = 0; gx < 5; gx++) {
            if (glyph[gy][gx] === '1') {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  setPixel(cursorX + gx * scale + sx, cursorY + gy * scale + sy, 20, 30, 55);
                }
              }
            }
          }
        }
        cursorX += 6 * scale;
      }
      cursorY += 32;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const pngBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return pngBuffer.toString('base64');
}

// ============================================================================
// Lightweight In-Memory Test Harness (Firestore, Auth, Mock Gemini Vision)
// ============================================================================
class MemoryFirestore {
  readonly cols = new Map<string, Map<string, DocData>>();
  seed(col: string, id: string, data: DocData) {
    let m = this.cols.get(col);
    if (!m) {
      m = new Map<string, DocData>();
      this.cols.set(col, m);
    }
    m.set(id, structuredClone(data));
  }
  doc(path: string) {
    const [col, id] = path.split('/');
    const self = this;
    return {
      id,
      path,
      async get() {
        const d = self.cols.get(col)?.get(id);
        return { id, exists: Boolean(d), data: () => (d ? structuredClone(d) : undefined) };
      },
    };
  }
}

function createFakeAuth(): Auth {
  return {
    async verifyIdToken(token: string) {
      if (token === 'patient-a-token') {
        return { uid: 'patient-a', email: 'a@medora.test', email_verified: true };
      }
      if (token === 'patient-b-token') {
        return { uid: 'patient-b', email: 'b@medora.test', email_verified: true };
      }
      throw new Error('INVALID_TOKEN');
    },
  } as unknown as Auth;
}

type CapturedGeminiCall = {
  kind: 'extract' | 'stream' | 'generate';
  model: string;
  inlineMediaCount: number;
  inlineMediaBytes: number[];
  inlineMimeTypes: string[];
  promptText: string;
  systemInstruction: string;
};

function createSyntheticGeminiClient(
  resolveExtractionForCall: (call: CapturedGeminiCall) => Record<string, unknown>,
): { client: GoogleGenAI; calls: CapturedGeminiCall[] } {
  const calls: CapturedGeminiCall[] = [];

  const extractCallMeta = (args: Record<string, unknown>, kind: CapturedGeminiCall['kind']) => {
    const contents = args.contents as
      | string
      | { parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> };
    const config = (args.config as Record<string, unknown>) || {};
    const parts = typeof contents === 'string' ? [{ text: contents }] : contents?.parts || [];
    const inlineParts = parts.filter((p) => Boolean(p.inlineData));
    const textParts = parts.map((p) => p.text || '').filter(Boolean);
    const meta: CapturedGeminiCall = {
      kind,
      model: String(args.model || ''),
      inlineMediaCount: inlineParts.length,
      inlineMediaBytes: inlineParts.map((p) => (p.inlineData?.data || '').length),
      inlineMimeTypes: inlineParts.map((p) => p.inlineData?.mimeType || ''),
      promptText: textParts.join('\n'),
      systemInstruction: String(config.systemInstruction || ''),
    };
    calls.push(meta);
    return meta;
  };

  const client = {
    models: {
      async generateContent(args: Record<string, unknown>) {
        const config = (args.config as Record<string, unknown>) || {};
        const isJsonSchemaExtraction = config.responseMimeType === 'application/json';
        const call = extractCallMeta(args, isJsonSchemaExtraction ? 'extract' : 'generate');
        if (isJsonSchemaExtraction) {
          const payload = resolveExtractionForCall(call);
          return { text: JSON.stringify(payload) };
        }
        return { text: 'رد تجريبي من حنين استناداً إلى الجدول المستخرج.\n\nتنبيه طبي.' };
      },
      async generateContentStream(args: Record<string, unknown>) {
        const call = extractCallMeta(args, 'stream');
        const fullText = [
          'قرأت التقرير المرفوع. هذه البيانات التي تمكنت من استخراجها، راجع الأرقام والوحدات للتأكد من مطابقتها للصورة.',
          '',
          call.promptText.includes('Critical')
            ? '⚠️ تنبيه عاجل: يوجد مؤشر حرج بالتقرير، يُرجى مراجعة الطوارئ أو الطبيب فوراً.'
            : '',
          'شرح مبسط لكل نتيجة بناءً على المجال المرجعي المطبوع بالتقرير.',
          '',
          'هذا شرح معلوماتي للتقرير وليس تشخيصاً أو وصفة علاجية.',
        ]
          .filter(Boolean)
          .join('\n');
        return {
          async *[Symbol.asyncIterator]() {
            yield { text: fullText.slice(0, 60) };
            yield { text: fullText.slice(60) };
          },
        };
      },
    },
  } as unknown as GoogleGenAI;

  return { client, calls };
}

async function createHarness(opts: { aiClient?: GoogleGenAI } = {}) {
  const db = new MemoryFirestore();
  db.seed('users', 'patient-a', {
    uid: 'patient-a',
    fullName: 'أحمد التجريبي',
    selectedPortal: 'patient',
    accountStatus: 'active',
    gender: 'male',
  });
  db.seed('users', 'patient-b', {
    uid: 'patient-b',
    fullName: 'مريم التجريبية',
    selectedPortal: 'patient',
    accountStatus: 'active',
    gender: 'female',
  });
  db.seed('patient_profiles', 'patient-a', { status: 'active' });
  db.seed('patient_profiles', 'patient-b', { status: 'active' });

  // Synthetic PNG inside medora_media_assets referenced by patient_medical_files
  const storedAssetPng = renderSyntheticLabPngBase64([
    'MEDORA SYNTHETIC LAB - RECORD ASSET',
    'WBC        6.8   10E9/L   4.0 - 11.0',
    'HEMOGLOBIN 13.8  g/dL     13.0 - 17.0',
  ]);
  db.seed('medora_media_assets', 'asset_lab_a_1', {
    ownerUid: 'patient-a',
    contentType: 'image/png',
    fileName: 'cbc_record_page1.png',
    dataBase64: storedAssetPng,
  });
  db.seed('patient_medical_files', 'file_a_cbc', {
    patientUid: 'patient-a',
    title: 'تقرير CBC محفوظ بالسجل الطبي',
    documentDate: '2026-10-01',
    file: {
      url: '/api/media/private/asset_lab_a_1',
      mimeType: 'image/png',
      name: 'cbc_record_page1.png',
    },
  });

  const tempStorePath = path.join(
    os.tmpdir(),
    `medora-haneen-vision-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const store = new HaneenStore({
    filePath: tempStorePath,
    getAdminDb: () => null,
    isFirestoreAdminReady: () => false,
  });

  const app = express();
  // Mirror server.ts 16mb parser on BOTH /chat and /chat-stream
  const uploadParser = express.json({ limit: '16mb' });
  const defaultParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (
      req.path === '/api/patient/haneen/chat' ||
      req.path === '/api/patient/haneen/chat-stream'
    ) {
      uploadParser(req, res, next);
      return;
    }
    defaultParser(req, res, next);
  });

  app.use(
    '/api',
    createHaneenRouter({
      adminAuth: createFakeAuth(),
      getAdminDb: () => db as unknown as Firestore,
      isFirestoreAdminReady: () => true,
      restDb: {} as ReturnType<typeof createFirestoreRestClient>,
      store,
      aiClientOverride: opts.aiClient,
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl =
    addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : 'http://127.0.0.1:0';

  return {
    baseUrl,
    store,
    close: async () => {
      store.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tempStorePath, { force: true });
    },
  };
}

async function reqJson<T>(
  baseUrl: string,
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

async function reqSseChat(
  baseUrl: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<{
  status: number;
  meta: Record<string, unknown> | null;
  chunks: string;
  done: HaneenChatResponse | null;
  errorBody: Record<string, unknown> | null;
}> {
  const res = await fetch(`${baseUrl}/api/patient/haneen/chat-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('text/event-stream')) {
    const errorBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, meta: null, chunks: '', done: null, errorBody };
  }
  const rawText = await res.text();
  let meta: Record<string, unknown> | null = null;
  let chunks = '';
  let done: HaneenChatResponse | null = null;
  for (const block of rawText.split('\n\n')) {
    if (!block.trim()) continue;
    let eventName = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) continue;
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (eventName === 'meta') meta = parsed;
    else if (eventName === 'chunk') chunks += String(parsed.delta || '');
    else if (eventName === 'done') done = parsed as unknown as HaneenChatResponse;
  }
  return { status: res.status, meta, chunks, done, errorBody: null };
}

// ============================================================================
// Synthetic 10 Checklist Scenarios (from 04_TESTING_CHECKLIST_AR.md)
// ============================================================================
interface TestCaseSpec {
  id: string;
  fileName: string;
  pngLines: string[];
  blurryNoise?: boolean;
  extraPages?: Array<{ fileName: string; lines: string[] }>;
  visionOutput: Record<string, unknown>;
  verify: (report: HaneenExtractedLabReport, sseText: string) => void;
}

const TEN_CHECKLIST_CASES: TestCaseSpec[] = [
  {
    id: 'case_01_cbc_clear',
    fileName: 'synthetic_01_cbc_clear.png',
    pngLines: [
      'MEDORA SYNTHETIC LAB - CBC PANEL',
      'WBC        7.2   10E9/L   4.0 - 11.0',
      'RBC        4.85  10E12/L  4.50 - 5.90',
      'HEMOGLOBIN 14.2  g/dL     13.5 - 17.5',
      'PLATELETS  245   10E9/L   150 - 400',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      isImagingFilmOnly: false,
      imageClarity: 'clear',
      pagesDetected: 1,
      labName: 'MEDORA Synthetic Lab',
      reportDate: '2026-10-10',
      hasCriticalFlag: false,
      rows: [
        {
          testName: 'White Blood Cells',
          shortName: 'WBC',
          value: '7.2',
          unit: '10^9/L',
          referenceRange: '4.0 - 11.0',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
        {
          testName: 'Red Blood Cells',
          shortName: 'RBC',
          value: '4.85',
          unit: '10^12/L',
          referenceRange: '4.50 - 5.90',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
        {
          testName: 'Hemoglobin',
          shortName: 'Hb',
          value: '14.2',
          unit: 'g/dL',
          referenceRange: '13.5 - 17.5',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
        {
          testName: 'Platelets',
          shortName: 'PLT',
          value: '245',
          unit: '10^9/L',
          referenceRange: '150 - 400',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
      ],
    },
    verify(r) {
      assert.equal(r.rows.length, 4);
      assert.equal(r.summaryCounts.withinRangeCount, 4);
    },
  },
  {
    id: 'case_02_cmp_chemistry',
    fileName: 'synthetic_02_cmp_chemistry.png',
    pngLines: [
      'SYNTHETIC CMP CHEMISTRY PANEL',
      'GLUCOSE     94   mg/dL    70 - 99',
      'CREATININE  0.9  mg/dL    0.7 - 1.3',
      'ALT         28   U/L      7 - 56',
      'POTASSIUM   4.1  mmol/L   3.5 - 5.1',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: false,
      rows: [
        { testName: 'Glucose', value: '94', unit: 'mg/dL', referenceRange: '70 - 99', comparisonStatus: 'within_range', confidence: 'clear' },
        { testName: 'Creatinine', value: '0.9', unit: 'mg/dL', referenceRange: '0.7 - 1.3', comparisonStatus: 'within_range', confidence: 'clear' },
        { testName: 'ALT', value: '28', unit: 'U/L', referenceRange: '7 - 56', comparisonStatus: 'within_range', confidence: 'clear' },
        { testName: 'Potassium', value: '4.1', unit: 'mmol/L', referenceRange: '3.5 - 5.1', comparisonStatus: 'within_range', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.equal(r.rows[1].unit, 'mg/dL');
      assert.equal(r.rows[3].value, '4.1');
    },
  },
  {
    id: 'case_03_english_report',
    fileName: 'synthetic_03_english_hba1c.png',
    pngLines: [
      'SYNTHETIC ENGLISH ENDOCRINE REPORT',
      'HBA1C       6.1  %        4.0 - 5.6',
      'TSH         2.4  mIU/L    0.4 - 4.0',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: false,
      rows: [
        { testName: 'Hemoglobin A1c', shortName: 'HbA1c', value: '6.1', unit: '%', referenceRange: '4.0 - 5.6', labFlag: 'H', comparisonStatus: 'above_range', confidence: 'clear' },
        { testName: 'TSH', value: '2.4', unit: 'mIU/L', referenceRange: '0.4 - 4.0', comparisonStatus: 'within_range', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.equal(r.rows[0].comparisonStatus, 'above_range');
      assert.equal(r.rows[1].comparisonStatus, 'within_range');
    },
  },
  {
    id: 'case_04_arabic_report',
    fileName: 'synthetic_04_arabic_lab.png',
    pngLines: [
      'LAB REPORT - ARABIC HEADER SYNTHETIC',
      'FERRITIN    18   ng/mL    30 - 300',
      'VITAMIN D   22   ng/mL    30 - 100',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      labName: 'مختبر الشفاء التخصصي (نموذج تجريبي)',
      hasCriticalFlag: false,
      rows: [
        { testName: 'مخزون الحديد (Ferritin)', value: '18', unit: 'ng/mL', referenceRange: '30 - 300', labFlag: 'L', comparisonStatus: 'below_range', confidence: 'clear' },
        { testName: 'فيتامين د (Vitamin D)', value: '22', unit: 'ng/mL', referenceRange: '30 - 100', labFlag: 'L', comparisonStatus: 'below_range', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.match(r.reportHeader?.labName || '', /الشفاء/);
      assert.equal(r.summaryCounts.outOfRangeCount, 2);
    },
  },
  {
    id: 'case_05_blurry_low_res',
    fileName: 'synthetic_05_blurry_unreadable.png',
    pngLines: ['UNREADABLE BLUR'],
    blurryNoise: true,
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'unreadable',
      clarityNoteAr: 'الصورة ضبابية ومنخفضة الدقة ولا يمكن قراءة الأرقام بثقة.',
      pagesDetected: 1,
      hasCriticalFlag: false,
      rows: [],
    },
    verify(r, sseText) {
      assert.equal(r.imageClarity, 'unreadable');
      assert.equal(r.rows.length, 0);
      assert.match(sseText, /التقاط صورة جديدة|غير واضحة/);
    },
  },
  {
    id: 'case_06_decimal_precision',
    fileName: 'synthetic_06_decimals.png',
    pngLines: [
      'DECIMAL PRECISION REPORT',
      'HEMOGLOBIN  11.45 g/dL   12.0 - 15.5',
      'CREATININE  0.85  mg/dL  0.60 - 1.20',
      'TSH         2.35  mIU/L  0.40 - 4.00',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: false,
      rows: [
        { testName: 'Hemoglobin', value: '11.45', unit: 'g/dL', referenceRange: '12.0 - 15.5', comparisonStatus: 'below_range', confidence: 'clear' },
        { testName: 'Creatinine', value: '0.85', unit: 'mg/dL', referenceRange: '0.60 - 1.20', comparisonStatus: 'within_range', confidence: 'clear' },
        { testName: 'TSH', value: '2.35', unit: 'mIU/L', referenceRange: '0.40 - 4.00', comparisonStatus: 'within_range', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.equal(r.rows[0].value, '11.45');
      assert.equal(r.rows[1].value, '0.85');
      assert.equal(r.rows[2].value, '2.35');
    },
  },
  {
    id: 'case_07_hl_critical_flags',
    fileName: 'synthetic_07_hl_critical.png',
    pngLines: [
      'CRITICAL FLAG REPORT',
      'GLUCOSE     245  mg/dL   70 - 99   H',
      'POTASSIUM   6.4  mmol/L  3.5 - 5.1 CRITICAL',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: true,
      rows: [
        { testName: 'Glucose', value: '245', unit: 'mg/dL', referenceRange: '70 - 99', labFlag: 'H', comparisonStatus: 'above_range', confidence: 'clear' },
        { testName: 'Potassium', value: '6.4', unit: 'mmol/L', referenceRange: '3.5 - 5.1', labFlag: 'Critical', comparisonStatus: 'above_range', confidence: 'clear' },
      ],
    },
    verify(r, sseText) {
      assert.equal(r.hasCriticalFlag, true);
      assert.equal(r.rows[1].labFlag, 'Critical');
      assert.match(sseText, /تنبيه عاجل|الطوارئ/);
    },
  },
  {
    id: 'case_08_qualitative_pos_neg',
    fileName: 'synthetic_08_qualitative.png',
    pngLines: [
      'QUALITATIVE SEROLOGY PANEL',
      'CRP         POSITIVE   -   NEGATIVE',
      'HBSAG       NEGATIVE   -   NEGATIVE',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: false,
      rows: [
        { testName: 'CRP (Qualitative)', value: 'Positive', unit: 'غير مطلوبة', referenceRange: 'Negative', comparisonStatus: 'qualitative', confidence: 'clear' },
        { testName: 'HBsAg', value: 'Negative', unit: 'غير مطلوبة', referenceRange: 'Negative', comparisonStatus: 'qualitative', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.equal(r.rows[0].comparisonStatus, 'qualitative');
      assert.equal(r.rows[1].comparisonStatus, 'qualitative');
    },
  },
  {
    id: 'case_09_multipage_report',
    fileName: 'synthetic_09_page1.png',
    pngLines: [
      'MULTI-PAGE REPORT PAGE 1',
      'CHOLESTEROL 188  mg/dL   < 200',
    ],
    extraPages: [
      {
        fileName: 'synthetic_09_page2.png',
        lines: [
          'MULTI-PAGE REPORT PAGE 2',
          'TRIGLYCERIDES 165 mg/dL  < 150  H',
        ],
      },
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 2,
      hasCriticalFlag: false,
      rows: [
        { testName: 'Total Cholesterol', value: '188', unit: 'mg/dL', referenceRange: '< 200', comparisonStatus: 'within_range', confidence: 'clear' },
        { testName: 'Triglycerides', value: '165', unit: 'mg/dL', referenceRange: '< 150', labFlag: 'H', comparisonStatus: 'above_range', confidence: 'clear' },
      ],
    },
    verify(r) {
      assert.equal(r.pagesDetected, 2);
      assert.equal(r.rows.length, 2);
    },
  },
  {
    id: 'case_10_missing_reference_range',
    fileName: 'synthetic_10_no_ref_range.png',
    pngLines: [
      'MISSING REFERENCE RANGE TEST',
      'ESR         18   mm/hr   -',
    ],
    visionOutput: {
      isMedicalLabReport: true,
      imageClarity: 'clear',
      pagesDetected: 1,
      hasCriticalFlag: false,
      // Model mistakenly suggests within_range when referenceRange is missing -> post-processor MUST override to undetermined!
      rows: [
        {
          testName: 'ESR',
          value: '18',
          unit: 'mm/hr',
          referenceRange: 'غير مذكور في التقرير',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
      ],
    },
    verify(r) {
      assert.equal(r.rows[0].comparisonStatus, 'undetermined');
      assert.equal(r.summaryCounts.withinRangeCount, 0);
      assert.equal(r.summaryCounts.undeterminedCount, 1);
    },
  },
];

// ============================================================================
// Run All Automated Tests
// ============================================================================
async function main() {
  console.log('=== HANEEN VISION LAB REPORT PIPELINE TEST SUITE ===');

  // 1. Guidance pack loaded from the 6 ZIP markdown files
  const guidance = loadLabReadingGuidancePack();
  assert.ok(guidance.combinedSystemGuidance.length > 500, '6 guidance markdown files should load');
  assert.match(guidance.combinedSystemGuidance, /00_START_HERE_AR|01_SAFE_INTERPRETATION_AR/);
  console.log('[PASS] Loaded 6 reference markdown guides into Haneen guidance pack');

  // 2. Mime normalization & anti-hallucination post-processor unit assertions
  assert.equal(normalizeAttachmentMimeType('image/jpg', 'scan.JPG'), 'image/jpeg');
  assert.equal(normalizeAttachmentMimeType('', 'report.pdf'), 'application/pdf');
  const postGuard = postProcessExtractedLabReport(
    {
      isMedicalLabReport: true,
      imageClarity: 'partially_unclear',
      rows: [
        {
          testName: 'Calcium',
          value: '9.4',
          unit: 'mg/dL',
          referenceRange: 'not_printed',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
        {
          testName: 'Albumin',
          value: 'غير مقروء',
          unit: 'g/dL',
          referenceRange: '3.5 - 5.0',
          comparisonStatus: 'within_range',
          confidence: 'clear',
        },
      ],
    },
    1,
  );
  assert.equal(postGuard.rows[0].comparisonStatus, 'undetermined');
  assert.equal(postGuard.rows[1].comparisonStatus, 'unreadable');
  assert.equal(postGuard.rows[1].confidence, 'unreadable');
  assert.match(buildLabReportTableMarkdown(postGuard), /\| التحليل \| النتيجة \|/);
  assert.match(buildUnreadableReportResponseText(postGuard), /التقاط صورة جديدة/);
  assert.match(buildStructuredFallbackFromExtractedReport(postGuard), /Calcium/);
  console.log('[PASS] Anti-hallucination post-processor + markdown table + unreadable helpers');

  // 3. Fail loudly with 503 when Gemini key is absent and image is attached (no silent mock!)
  {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const h = await createHarness({ aiClient: undefined });
    try {
      const boot = await reqJson<{ activeConversationId: string; geminiConfigured: boolean }>(
        h.baseUrl,
        '/api/patient/haneen/bootstrap',
        'patient-a-token',
      );
      assert.equal(boot.status, 200);
      assert.equal(boot.body.geminiConfigured, false);
      const convId = boot.body.activeConversationId;
      await reqJson(h.baseUrl, `/api/patient/haneen/conversations/${convId}/consent`, 'patient-a-token', {
        method: 'PATCH',
        body: JSON.stringify({ consentGiven: true }),
      });

      const pngBase64 = renderSyntheticLabPngBase64(['WBC 6.5']);
      const resp = await reqSseChat(h.baseUrl, 'patient-a-token', {
        conversationId: convId,
        message: 'اقرأ التقرير',
        uploadedAttachment: {
          base64Data: pngBase64,
          mimeType: 'image/png',
          fileName: 'test.png',
        },
      });
      assert.equal(resp.status, 503);
      assert.equal(resp.errorBody?.error, 'GEMINI_VISION_NOT_CONFIGURED');
    } finally {
      await h.close();
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
    console.log('[PASS] Unconfigured Vision key fails loudly with HTTP 503 GEMINI_VISION_NOT_CONFIGURED');
  }

  // 4. Full End-to-End Pipeline for all 10 Synthetic Cases + Medical File Asset + Consent + 16MB Stream + Auth Isolation
  let currentVisionResponse: Record<string, unknown> = {};
  const { client: syntheticAi, calls } = createSyntheticGeminiClient(() => currentVisionResponse);
  const harness = await createHarness({ aiClient: syntheticAi });

  try {
    const boot = await reqJson<{ activeConversationId: string; geminiConfigured: boolean }>(
      harness.baseUrl,
      '/api/patient/haneen/bootstrap',
      'patient-a-token',
    );
    assert.equal(boot.status, 200);
    assert.equal(boot.body.geminiConfigured, true);
    const convId = boot.body.activeConversationId;

    // 4a. Consent required BEFORE sending an uploaded PNG
    const noConsentRes = await reqSseChat(harness.baseUrl, 'patient-a-token', {
      conversationId: convId,
      message: 'اقرأ الصورة',
      uploadedAttachment: {
        base64Data: renderSyntheticLabPngBase64(['WBC 6.5']),
        mimeType: 'image/png',
        fileName: 'noconsent.png',
      },
    });
    assert.equal(noConsentRes.status, 403);
    assert.equal(noConsentRes.errorBody?.error, 'CONSENT_REQUIRED');

    // Grant explicit consent
    const consentPatch = await reqJson<{ conversation: { consentGiven: boolean } }>(
      harness.baseUrl,
      `/api/patient/haneen/conversations/${convId}/consent`,
      'patient-a-token',
      {
        method: 'PATCH',
        body: JSON.stringify({ consentGiven: true }),
      },
    );
    assert.equal(consentPatch.status, 200);
    assert.equal(consentPatch.body.conversation.consentGiven, true);

    // 4b. Cross-patient isolation check: patient-b tries patient-a's medical file
    const bootB = await reqJson<{ activeConversationId: string }>(
      harness.baseUrl,
      '/api/patient/haneen/bootstrap',
      'patient-b-token',
    );
    await reqJson(
      harness.baseUrl,
      `/api/patient/haneen/conversations/${bootB.body.activeConversationId}/consent`,
      'patient-b-token',
      { method: 'PATCH', body: JSON.stringify({ consentGiven: true }) },
    );
    const crossPatientRes = await reqSseChat(harness.baseUrl, 'patient-b-token', {
      conversationId: bootB.body.activeConversationId,
      message: 'اقرأ الملف',
      attachedFileId: 'file_a_cbc',
    });
    assert.equal(crossPatientRes.status, 403);
    assert.equal(crossPatientRes.errorBody?.error, 'FORBIDDEN_CROSS_PATIENT_ACCESS');

    // 4c. Execute all 10 checklist synthetic report PNG cases through /api/patient/haneen/chat-stream
    for (const tc of TEN_CHECKLIST_CASES) {
      const beforeCount = calls.length;
      currentVisionResponse = tc.visionOutput;

      const primaryPng = renderSyntheticLabPngBase64(tc.pngLines, Boolean(tc.blurryNoise));
      const attachments = [
        {
          base64Data: primaryPng,
          mimeType: 'image/png',
          fileName: tc.fileName,
        },
        ...(tc.extraPages || []).map((pg) => ({
          base64Data: renderSyntheticLabPngBase64(pg.lines),
          mimeType: 'image/png',
          fileName: pg.fileName,
        })),
      ];

      const sseRes = await reqSseChat(harness.baseUrl, 'patient-a-token', {
        conversationId: convId,
        message: 'اقرأ هذه الصورة',
        uploadedAttachments: attachments,
      });

      assert.equal(sseRes.status, 200, `${tc.id} failed HTTP status`);
      assert.ok(sseRes.meta, `${tc.id} missing SSE meta`);
      assert.ok(sseRes.done, `${tc.id} missing SSE done`);
      const extracted = sseRes.done.assistantMessage.extractedReport;
      assert.ok(extracted, `${tc.id} missing extractedReport on assistantMessage`);

      // Confirm Gemini Vision extract stage actually received binary inlineData parts!
      const newCalls = calls.slice(beforeCount);
      const extractCall = newCalls.find((c) => c.kind === 'extract');
      assert.ok(extractCall, `${tc.id} did not invoke Stage-1 Gemini Vision extraction`);
      assert.equal(extractCall.model, HANEEN_GEMINI_MODEL);
      assert.equal(extractCall.inlineMediaCount, attachments.length);
      assert.ok(extractCall.inlineMediaBytes.every((b) => b > 100));

      const combinedText = sseRes.done.assistantMessage.text || sseRes.chunks;
      tc.verify(extracted, combinedText);
      console.log(
        `[PASS] ${tc.id} (${tc.fileName}) -> mediaParts=${extractCall.inlineMediaCount}, rows=${extracted.rows.length}, clarity=${extracted.imageClarity}`,
      );
    }

    // 4d. Stored Medical File (`attachedFileId`) loads binary PNG from medora_media_assets into Gemini Vision!
    {
      const beforeCount = calls.length;
      currentVisionResponse = {
        isMedicalLabReport: true,
        imageClarity: 'clear',
        pagesDetected: 1,
        hasCriticalFlag: false,
        rows: [
          { testName: 'WBC', value: '6.8', unit: '10^9/L', referenceRange: '4.0 - 11.0', comparisonStatus: 'within_range', confidence: 'clear' },
          { testName: 'Hemoglobin', value: '13.8', unit: 'g/dL', referenceRange: '13.0 - 17.0', comparisonStatus: 'within_range', confidence: 'clear' },
        ],
      };
      const fileRes = await reqSseChat(harness.baseUrl, 'patient-a-token', {
        conversationId: convId,
        message: 'اشرحلي هذا الملف الطبي المحفوظ',
        attachedFileId: 'file_a_cbc',
      });
      assert.equal(fileRes.status, 200);
      const extractCall = calls.slice(beforeCount).find((c) => c.kind === 'extract');
      assert.ok(extractCall, 'attachedFileId asset should trigger Vision extraction');
      assert.equal(extractCall.inlineMediaCount, 1);
      assert.equal(extractCall.inlineMimeTypes[0], 'image/png');
      assert.equal(fileRes.done?.assistantMessage.extractedReport?.rows.length, 2);
      console.log('[PASS] Consented attachedFileId loaded real binary PNG from medora_media_assets into Vision');
    }

    // 4e. Large >1.4 MB JSON payload on /api/patient/haneen/chat-stream verifies 16mb parser limit!
    {
      const largeBase64 = 'A'.repeat(1_500_000); // > 1MB default Express JSON cap
      currentVisionResponse = {
        isMedicalLabReport: true,
        imageClarity: 'clear',
        pagesDetected: 1,
        hasCriticalFlag: false,
        rows: [
          { testName: 'TSH', value: '2.1', unit: 'mIU/L', referenceRange: '0.4 - 4.0', comparisonStatus: 'within_range', confidence: 'clear' },
        ],
      };
      const largeRes = await reqSseChat(harness.baseUrl, 'patient-a-token', {
        conversationId: convId,
        message: 'تحليل ملف كبير',
        uploadedAttachments: [
          { base64Data: largeBase64, mimeType: 'image/jpeg', fileName: 'phone_photo_large.jpg' },
        ],
      });
      assert.equal(largeRes.status, 200, 'chat-stream must accept >1MB JSON payloads');
      console.log('[PASS] /api/patient/haneen/chat-stream accepted >1.5MB attachment payload (16MB parser verified)');
    }
  } finally {
    await harness.close();
  }

  console.log('=== ALL HANEEN VISION PIPELINE TESTS PASSED ===');
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

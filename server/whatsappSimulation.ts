import type {
  NotificationEventType,
  NotificationTemplateRecord,
} from '../src/types/notifications.ts';
import {
  hashPhoneKey,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
} from './iraqiPhone.ts';

/**
 * Meta WhatsApp Cloud API live dispatch remains disabled in this phase.
 * Until authorized and configured, all WhatsApp notifications run strictly
 * through the MEDORA WhatsApp Simulation Gateway with zero external calls or charges.
 */
export const WHATSAPP_LIVE_API_ENABLED = false as const;

const FORBIDDEN_WHATSAPP_PATTERNS: RegExp[] = [
  /\{diagnosis\}/i,
  /\{result(?:s|value)?\}/i,
  /\{medication(?:s|name)?\}/i,
  /\{medicine(?:name)?\}/i,
  /\{drug(?:s|name)?\}/i,
  /\{dosage\}/i,
  /\{otp\}/i,
  /\{code\}/i,
  /\{pin\}/i,
  /\b(otp|hba1c|cbc|crp|glucose|cholesterol|creatinine|diagnosis|prescription|dosage|amoxicillin|paracetamol|ibuprofen|insulin|metformin|atorvastatin|omeprazole|azithromycin|tablet|capsule|syrup)\b/i,
  /\b(mg|ml|mcg|iu\/l|mmol\/l|g\/dl)\b/i,
  /(تشخيص|السكري|السرطان|جرعة|رمز\s*التحقق|أموكسيسيلين|باراسيتامول|أنسولين|ميتفورمين|مضاد\s*حيوي|كبسولة|شراب)/,
];

export function sanitizeWhatsAppPlaceholder(
  value: unknown,
  fallback = 'MEDORA',
): string {
  let clean = typeof value === 'string' ? value.trim() : '';
  if (!clean) return fallback;
  clean = clean
    .replace(
      /\b(otp|hba1c|cbc|crp|glucose|cholesterol|creatinine|diagnosis|prescription|dosage|amoxicillin|paracetamol|ibuprofen|insulin|metformin|atorvastatin|omeprazole|azithromycin|tablet|capsule|syrup)\b/gi,
      '[REDACTED]',
    )
    .replace(/\b(mg|ml|mcg|iu\/l|mmol\/l|g\/dl)\b/gi, '')
    .replace(
      /(تشخيص|السكري|السرطان|جرعة|رمز\s*التحقق|أموكسيسيلين|باراسيتامول|أنسولين|ميتفورمين|مضاد\s*حيوي|كبسولة|شراب)/g,
      '[محجوب]',
    )
    .replace(/\b\d{4,8}\b/g, '****')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return clean || fallback;
}

export function validateWhatsAppTemplateSafety(text: string): {
  safe: boolean;
  reason?: string;
} {
  const clean = String(text || '').trim();
  if (!clean || clean.length > 420) {
    return { safe: false, reason: 'TEMPLATE_LENGTH_INVALID' };
  }
  for (const pat of FORBIDDEN_WHATSAPP_PATTERNS) {
    if (pat.test(clean)) {
      return {
        safe: false,
        reason: 'SENSITIVE_MEDICAL_OR_SECRET_CONTENT_FORBIDDEN_IN_WHATSAPP',
      };
    }
  }
  return { safe: true };
}

export function renderWhatsAppSafeBody(
  template: NotificationTemplateRecord,
  locale: 'ar' | 'en',
  placeholders: {
    refCode?: string;
    statusLabel?: string;
    dateLabel?: string;
  },
): string {
  const raw = locale === 'en' ? template.bodyEn : template.bodyAr;
  const refCode = sanitizeWhatsAppPlaceholder(placeholders.refCode, 'MDR-REF');
  const statusLabel = sanitizeWhatsAppPlaceholder(
    placeholders.statusLabel,
    locale === 'en' ? 'Updated' : 'محدّث',
  );
  const dateLabel = sanitizeWhatsAppPlaceholder(
    placeholders.dateLabel,
    new Date().toISOString().slice(0, 10),
  );
  return raw
    .replace(/\{refCode\}/g, refCode)
    .replace(/\{statusLabel\}/g, statusLabel)
    .replace(/\{dateLabel\}/g, dateLabel)
    .slice(0, 420);
}

export interface WhatsAppSimulationDispatchInput {
  eventType: NotificationEventType;
  template: NotificationTemplateRecord;
  phoneInput: string;
  locale: 'ar' | 'en';
  placeholders?: {
    refCode?: string;
    statusLabel?: string;
    dateLabel?: string;
  };
  simulateFailure?: boolean;
}

export interface WhatsAppSimulationDispatchResult {
  ok: boolean;
  status: 'Simulated' | 'Failed';
  phoneE164?: string;
  phoneMasked: string;
  phoneHash: string;
  bodyPreview: string;
  providerName: string;
  providerMessageId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export function simulateWhatsAppDispatch(
  input: WhatsAppSimulationDispatchInput,
): WhatsAppSimulationDispatchResult {
  const parsed = parseAndNormalizeIraqiPhone(input.phoneInput);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 'Failed',
      phoneMasked: '***',
      phoneHash: '',
      bodyPreview: '',
      providerName: 'medora_whatsapp_simulation',
      providerMessageId: '',
      errorCode: `INVALID_IRAQI_PHONE:${parsed.errorCode}`,
      errorMessage: 'Valid Iraqi +964 phone number is required for WhatsApp delivery.',
    };
  }

  const bodyPreview = renderWhatsAppSafeBody(
    input.template,
    input.locale,
    input.placeholders || {},
  );

  const safety = validateWhatsAppTemplateSafety(bodyPreview);
  if (!safety.safe) {
    return {
      ok: false,
      status: 'Failed',
      phoneE164: parsed.e164,
      phoneMasked: maskIraqiPhone(parsed.e164),
      phoneHash: hashPhoneKey(parsed.e164),
      bodyPreview: '',
      providerName: 'medora_whatsapp_simulation',
      providerMessageId: '',
      errorCode: safety.reason || 'WHATSAPP_PRIVACY_POLICY_BLOCKED',
      errorMessage: 'Blocked by zero-medical-PII WhatsApp safety guard.',
    };
  }

  const masked = maskIraqiPhone(parsed.e164);
  const phoneHash = hashPhoneKey(parsed.e164);
  const simId = `wa_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  if (input.simulateFailure) {
    return {
      ok: false,
      status: 'Failed',
      phoneE164: parsed.e164,
      phoneMasked: masked,
      phoneHash,
      bodyPreview,
      providerName: 'medora_whatsapp_simulation',
      providerMessageId: simId,
      errorCode: 'WHATSAPP_SIMULATED_DELIVERY_FAILURE',
      errorMessage: 'Simulated WhatsApp delivery failure (retry available).',
    };
  }

  console.info(
    `[MEDORA][WhatsApp][SIMULATION] event=${input.eventType} tpl=${input.template.whatsappTemplateName} to=${masked} id=${simId}`,
  );

  return {
    ok: true,
    status: 'Simulated',
    phoneE164: parsed.e164,
    phoneMasked: masked,
    phoneHash,
    bodyPreview,
    providerName: 'medora_whatsapp_simulation',
    providerMessageId: simId,
    errorCode: null,
    errorMessage: null,
  };
}

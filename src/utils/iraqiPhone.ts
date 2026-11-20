export type IraqiOperatorCode =
  | 'asiacell'
  | 'zain'
  | 'korek'
  | 'other_iraqi_mobile';

export type IraqiPhoneErrorCode =
  | 'EMPTY'
  | 'NON_IRAQI_COUNTRY'
  | 'INVALID_OPERATOR_OR_LENGTH'
  | 'INVALID_FORMAT';

export interface ParsedIraqiPhone {
  ok: true;
  e164: string;
  local: string;
  operator: IraqiOperatorCode;
}

export interface InvalidIraqiPhone {
  ok: false;
  errorCode: IraqiPhoneErrorCode;
}

export type IraqiPhoneParseResult = ParsedIraqiPhone | InvalidIraqiPhone;

const E164_IRAQ_MOBILE_REGEX = /^\+9647[3-9]\d{8}$/;

export function normalizeArabicNumerals(input: string): string {
  return String(input || '')
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0));
}

export function getIraqiOperator(e164: string): IraqiOperatorCode {
  if (!E164_IRAQ_MOBILE_REGEX.test(e164)) return 'other_iraqi_mobile';
  const prefix = e164.slice(4, 6); // 77, 78, 79, 75, etc.
  if (prefix === '77') return 'asiacell';
  if (prefix === '78' || prefix === '79') return 'zain';
  if (prefix === '75') return 'korek';
  return 'other_iraqi_mobile';
}

export function getIraqiOperatorLabel(
  operator: IraqiOperatorCode,
  language: 'ar' | 'en',
): string {
  const labels: Record<IraqiOperatorCode, { ar: string; en: string }> = {
    asiacell: { ar: 'آسياسيل (Asiacell)', en: 'Asiacell' },
    zain: { ar: 'زين العراق (Zain IQ)', en: 'Zain Iraq' },
    korek: { ar: 'كورك تيليكوم (Korek)', en: 'Korek Telecom' },
    other_iraqi_mobile: { ar: 'شبكة عراقية (+964)', en: 'Iraqi Mobile (+964)' },
  };
  return labels[operator]?.[language] || labels.other_iraqi_mobile[language];
}

/**
 * Normalizes and validates Iraqi mobile numbers to strict E.164 format (+9647XXXXXXXXX).
 * Supported inputs:
 *   - 07701234567
 *   - 7701234567
 *   - +9647701234567
 *   - +96407701234567
 *   - 009647701234567
 *   - 9647701234567
 *   - Arabic/Persian numerals & common separators
 */
export function parseAndNormalizeIraqiPhone(rawInput: string): IraqiPhoneParseResult {
  const ascii = normalizeArabicNumerals(String(rawInput || '').trim());
  if (!ascii) {
    return { ok: false, errorCode: 'EMPTY' };
  }

  // Strip spaces, dashes, dots, parentheses, and LTR/RTL marks
  const stripped = ascii.replace(/[\s\-().\u200e\u200f\u202a-\u202e]/g, '');
  if (!stripped) {
    return { ok: false, errorCode: 'EMPTY' };
  }

  // Reject unexpected non-digit characters (allow leading + or digits only)
  if (!/^\+?\d+$/.test(stripped)) {
    return { ok: false, errorCode: 'INVALID_FORMAT' };
  }

  let nationalCandidate = '';

  if (stripped.startsWith('+')) {
    if (!stripped.startsWith('+964')) {
      return { ok: false, errorCode: 'NON_IRAQI_COUNTRY' };
    }
    nationalCandidate = stripped.slice(4);
  } else if (stripped.startsWith('00')) {
    if (!stripped.startsWith('00964')) {
      return { ok: false, errorCode: 'NON_IRAQI_COUNTRY' };
    }
    nationalCandidate = stripped.slice(5);
  } else if (stripped.startsWith('964')) {
    nationalCandidate = stripped.slice(3);
  } else {
    nationalCandidate = stripped;
  }

  // Handle +96407XXXXXXXXX or local 07XXXXXXXXX
  if (nationalCandidate.startsWith('0')) {
    nationalCandidate = nationalCandidate.slice(1);
  }

  const e164 = `+964${nationalCandidate}`;
  if (!E164_IRAQ_MOBILE_REGEX.test(e164)) {
    return { ok: false, errorCode: 'INVALID_OPERATOR_OR_LENGTH' };
  }

  return {
    ok: true,
    e164,
    local: `0${nationalCandidate}`,
    operator: getIraqiOperator(e164),
  };
}

export function formatIraqiPhoneLocal(input: string): string {
  const parsed = parseAndNormalizeIraqiPhone(input);
  if (!parsed.ok) return String(input || '').trim();
  const l = parsed.local; // 07XXXXXXXXX (11 digits)
  return `${l.slice(0, 4)} ${l.slice(4, 7)} ${l.slice(7)}`;
}

/**
 * Masks Iraqi E.164 phone for safe display & zero-PII logging:
 * +9647701234567 -> +964770****567
 */
export function maskIraqiPhone(input: string): string {
  const parsed = parseAndNormalizeIraqiPhone(input);
  if (!parsed.ok) {
    const clean = String(input || '').trim();
    if (clean.length <= 5) return '***';
    return `${clean.slice(0, 3)}****${clean.slice(-2)}`;
  }
  const e = parsed.e164; // +9647701234567 (length 14)
  return `${e.slice(0, 7)}****${e.slice(-3)}`;
}

export function getIraqiPhoneValidationMessage(
  errorCode: IraqiPhoneErrorCode,
  language: 'ar' | 'en',
): string {
  const map: Record<IraqiPhoneErrorCode, { ar: string; en: string }> = {
    EMPTY: {
      ar: 'يرجى إدخال رقم الهاتف العراقي.',
      en: 'Please enter an Iraqi mobile phone number.',
    },
    NON_IRAQI_COUNTRY: {
      ar: 'يُقبل حالياً أرقام العراق فقط (+964).',
      en: 'Only Iraqi phone numbers (+964) are supported.',
    },
    INVALID_OPERATOR_OR_LENGTH: {
      ar: 'صيغة الرقم غير صحيحة. يجب أن يبدأ الرقم العراقي بـ 07 متبوعاً بـ 9 أرقام (أو +9647XXXXXXXXX).',
      en: 'Invalid Iraqi mobile format. Must start with 07 followed by 9 digits (or +9647XXXXXXXXX).',
    },
    INVALID_FORMAT: {
      ar: 'يرجى إدخال أرقام صحيحة فقط بدون أحرف أو رموز غير صالحة.',
      en: 'Please enter valid digits only without invalid symbols.',
    },
  };
  return map[errorCode]?.[language] || map.INVALID_FORMAT[language];
}

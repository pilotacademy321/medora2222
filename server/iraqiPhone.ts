import crypto from 'node:crypto';
import {
  formatIraqiPhoneLocal,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
  type IraqiPhoneParseResult,
} from '../src/utils/iraqiPhone.ts';

export {
  formatIraqiPhoneLocal,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
  type IraqiPhoneParseResult,
};

function getServerPhonePepper(): string {
  return (
    process.env.MEDORA_PHONE_HASH_PEPPER ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'medora-iraq-phone-hash-v1-gen-lang-client-0591643299'
  );
}

/**
 * Deterministic HMAC-SHA256 key for phone uniqueness checks & audit logs
 * without storing raw phone numbers inside Firestore document IDs.
 */
export function hashPhoneKey(e164: string): string {
  return crypto
    .createHmac('sha256', getServerPhonePepper())
    .update(String(e164 || '').trim())
    .digest('hex');
}

export function hashIdempotencyKey(rawKey: string): string {
  return crypto
    .createHash('sha256')
    .update(String(rawKey || '').trim())
    .digest('hex');
}

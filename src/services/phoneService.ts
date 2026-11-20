import type { User } from 'firebase/auth';
import type {
  PhoneAvailabilityResponse,
  PhoneSaveResponse,
  PhoneStatusResponse,
} from '../types/notifications';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchPhoneLinkStatus(
  firebaseUser: User,
): Promise<PhoneStatusResponse> {
  const res = await fetch('/api/phone/status', {
    headers: await authHeaders(firebaseUser),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'PHONE_STATUS_FAILED');
  return data as PhoneStatusResponse;
}

export async function checkIraqiPhoneAvailability(
  firebaseUser: User,
  phone: string,
): Promise<PhoneAvailabilityResponse> {
  const res = await fetch('/api/phone/check-availability', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ phone }),
  });
  return (await res.json()) as PhoneAvailabilityResponse;
}

export async function linkIraqiPhoneOnServer(
  firebaseUser: User,
  phone: string,
): Promise<PhoneSaveResponse> {
  const res = await fetch('/api/phone/link', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ phone }),
  });
  return (await res.json()) as PhoneSaveResponse;
}

export async function unlinkIraqiPhoneOnServer(
  firebaseUser: User,
): Promise<{ ok: boolean; unlinked?: boolean; error?: string }> {
  const res = await fetch('/api/phone/unlink', {
    method: 'DELETE',
    headers: await authHeaders(firebaseUser),
  });
  return (await res.json()) as { ok: boolean; unlinked?: boolean; error?: string };
}

export function mapPhoneLinkErrorMessage(
  code: string,
  language: 'ar' | 'en',
): string {
  const isAr = language === 'ar';
  switch (code) {
    case 'PHONE_ALREADY_REGISTERED':
      return isAr
        ? 'رقم الهاتف هذا مسجل ومرتبط بحساب آخر بالفعل.'
        : 'This Iraqi phone number is already linked to another account.';
    case 'INVALID_IRAQI_PHONE':
    case 'INVALID_PREFIX':
    case 'EMPTY_PHONE':
      return isAr
        ? 'يرجى إدخال رقم هاتف عراقي صحيح يبدأ بـ 07 أو +9647.'
        : 'Please enter a valid Iraqi phone number (07XXXXXXXXX or +9647XXXXXXXXX).';
    default:
      return isAr
        ? 'تعذر حفظ رقم الهاتف. يرجى التحقق والمحاولة مجدداً.'
        : 'Could not save the phone number. Please try again.';
  }
}

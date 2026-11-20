import type { User } from 'firebase/auth';
import type { AdEntityType, AdTargetPortal, MedoraAdRecord } from '../types/patient';

export interface AdminAdDirectoryOption {
  uid: string;
  entityType: AdEntityType;
  label: string;
  name: string;
  subLabel: string;
  location: string;
}

export interface AdminAdEntitiesDirectory {
  doctors: Array<{
    doctorUid: string;
    fullName: string;
    specialty: string;
    clinicName: string;
    governorate?: string;
  }>;
  labs: Array<{
    labUid: string;
    labNameAr: string;
    labNameEn?: string;
    governorate?: string;
    district?: string;
  }>;
  pharmacies: Array<{
    pharmacyUid: string;
    pharmacyNameAr: string;
    pharmacyNameEn?: string;
    governorate?: string;
    district?: string;
  }>;
  wholesalers: Array<{
    wholesalerUid: string;
    wholesalerNameAr: string;
    wholesalerNameEn?: string;
    governorate?: string;
    district?: string;
  }>;
}

export interface AdminAdsAnalyticsSummary {
  summary: {
    totalAds: number;
    totalImpressions: number;
    totalClicks: number;
    overallCtrPercent: number;
  };
  perAd: Array<{
    adId: string;
    title: string;
    entityType: string;
    status: string;
    impressions: number;
    clicks: number;
    ctrPercent: number;
    byPortal: Record<string, { impressions: number; clicks: number }>;
  }>;
}

export async function fetchTargetedAds(
  portal: AdTargetPortal,
): Promise<MedoraAdRecord[]> {
  const res = await fetch(`/api/ads/targeted?portal=${encodeURIComponent(portal)}`);
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    ads?: MedoraAdRecord[];
  };
  if (!res.ok || !Array.isArray(body.ads)) {
    return [];
  }
  return body.ads;
}

export async function trackAdEvent(params: {
  adId: string;
  eventType: 'impression' | 'click';
  portal: AdTargetPortal;
  firebaseUser?: User | null;
}): Promise<void> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (params.firebaseUser) {
      const token = await params.firebaseUser.getIdToken().catch(() => '');
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    await fetch(`/api/ads/${encodeURIComponent(params.adId)}/event`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        eventType: params.eventType,
        portal: params.portal,
      }),
    });
  } catch {
    // Non-fatal analytics beacon
  }
}

export async function fetchAdminAdEntitiesDirectory(
  firebaseUser: User,
): Promise<AdminAdEntitiesDirectory> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/admin/ads/entities-directory', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AdminAdEntitiesDirectory> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || 'ADMIN_ADS_DIRECTORY_FAILED');
  }
  return {
    doctors: Array.isArray(body.doctors) ? body.doctors : [],
    labs: Array.isArray(body.labs) ? body.labs : [],
    pharmacies: Array.isArray(body.pharmacies) ? body.pharmacies : [],
    wholesalers: Array.isArray(body.wholesalers) ? body.wholesalers : [],
  };
}

export async function fetchAdminAdAnalytics(
  firebaseUser: User,
): Promise<AdminAdsAnalyticsSummary> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/admin/ads/analytics', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AdminAdsAnalyticsSummary> & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || 'ADMIN_ADS_ANALYTICS_FAILED');
  }
  return {
    summary: body.summary || {
      totalAds: 0,
      totalImpressions: 0,
      totalClicks: 0,
      overallCtrPercent: 0,
    },
    perAd: Array.isArray(body.perAd) ? body.perAd : [],
  };
}

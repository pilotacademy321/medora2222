import { useEffect, useRef } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function normalizeNotificationTimestamp(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'object' && raw !== null) {
    const maybeTs = raw as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof maybeTs.toDate === 'function') {
      try {
        return maybeTs.toDate().toISOString();
      } catch {
        return '';
      }
    }
    const sec =
      typeof maybeTs.seconds === 'number'
        ? maybeTs.seconds
        : typeof maybeTs._seconds === 'number'
          ? maybeTs._seconds
          : null;
    if (sec !== null) {
      return new Date(sec * 1000).toISOString();
    }
  }
  return '';
}

export interface UseRealtimeNotificationsOptions<T> {
  collectionName:
    | 'patient_notifications'
    | 'doctor_notifications'
    | 'lab_notifications'
    | 'pharmacy_notifications'
    | 'wholesaler_notifications'
    | 'secretary_notifications'
    | 'admin_notifications';
  uidField:
    | 'patientUid'
    | 'doctorUid'
    | 'labUid'
    | 'pharmacyUid'
    | 'wholesalerUid'
    | 'secretaryUid'
    | 'adminUid';
  uid: string | null | undefined;
  enabled?: boolean;
  limitCount?: number;
  onUpdate: (items: T[]) => void;
}

export function useRealtimeNotifications<
  T extends { notificationId?: string; createdAt?: string | null },
>({
  collectionName,
  uidField,
  uid,
  enabled = true,
  limitCount = 50,
  onUpdate,
}: UseRealtimeNotificationsOptions<T>): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !uid) return;

    const q = query(
      collection(db, collectionName),
      where(uidField, '==', uid),
      limit(limitCount),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const createdAtIso = normalizeNotificationTimestamp(data.createdAt);
          const updatedAtIso = normalizeNotificationTimestamp(data.updatedAt);
          return {
            ...data,
            notificationId: String(data.notificationId || docSnap.id),
            isRead: data.isRead === true,
            createdAt: createdAtIso || undefined,
            ...(updatedAtIso ? { updatedAt: updatedAtIso } : {}),
          } as unknown as T;
        });

        items.sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        );

        onUpdateRef.current(items);
      },
      () => {
        // Gracefully ignore transient snapshot/permission errors so portal state stays stable
      },
    );

    return () => {
      unsubscribe();
    };
  }, [collectionName, uidField, uid, enabled, limitCount]);
}

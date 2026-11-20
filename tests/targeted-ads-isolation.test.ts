import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import {
  createAdsRouter,
  isAdEntityAllowedOnPortal,
  normalizeTargetPortals,
} from '../server/adsRoutes.ts';

function createMockFirestore(collectionsData: Record<string, Record<string, Record<string, unknown>>>) {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [colName, docs] of Object.entries(collectionsData)) {
    const map = new Map<string, Record<string, unknown>>();
    for (const [docId, val] of Object.entries(docs)) {
      map.set(docId, structuredClone(val));
    }
    store.set(colName, map);
  }

  const getCol = (name: string) => {
    let m = store.get(name);
    if (!m) {
      m = new Map();
      store.set(name, m);
    }
    return m;
  };

  const makeSnap = (id: string, data: Record<string, unknown> | undefined) => ({
    id,
    exists: Boolean(data),
    data: () => (data ? structuredClone(data) : undefined),
  });

  const db = {
    collection(name: string) {
      const filters: Array<{ field: string; op: string; val: unknown }> = [];
      let maxLimit = 1000;
      const queryObj = {
        where(field: string, op: string, val: unknown) {
          filters.push({ field, op, val });
          return queryObj;
        },
        limit(n: number) {
          maxLimit = n;
          return queryObj;
        },
        orderBy() {
          return queryObj;
        },
        async get() {
          const col = getCol(name);
          const docs: Array<ReturnType<typeof makeSnap>> = [];
          for (const [id, data] of col.entries()) {
            const match = filters.every((f) => f.op === '==' && data[f.field] === f.val);
            if (match) docs.push(makeSnap(id, data));
            if (docs.length >= maxLimit) break;
          }
          return { docs };
        },
      };
      return queryObj;
    },
    doc(path: string) {
      const [colName, docId] = path.split('/');
      return {
        async get() {
          return makeSnap(docId, getCol(colName).get(docId));
        },
        async set(data: Record<string, unknown>) {
          getCol(colName).set(docId, structuredClone(data));
        },
      };
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(docRef: { set: (d: Record<string, unknown>) => Promise<void> }, data: Record<string, unknown>) {
          ops.push(() => void docRef.set(data));
        },
        update(docRef: unknown, patch: Record<string, unknown>) {
          void docRef;
          void patch;
          // No-op counter update in test harness
        },
        async commit() {
          ops.forEach((fn) => fn());
        },
      };
    },
  };

  return { db, store };
}

test('Targeted Ads Portal Isolation Rules', () => {
  // Imaging portal itself stays disabled
  assert.equal(isAdEntityAllowedOnPortal('imaging', 'patient'), false);
  assert.equal(isAdEntityAllowedOnPortal('radiology', 'entry'), false);

  // radiology_info referral card is strictly allowed ONLY on Lab portal
  assert.equal(isAdEntityAllowedOnPortal('radiology_info', 'lab'), true);
  assert.equal(isAdEntityAllowedOnPortal('radiology_info', 'patient'), false);
  assert.equal(isAdEntityAllowedOnPortal('radiology_info', 'pharmacy'), false);
  assert.equal(isAdEntityAllowedOnPortal('radiology_info', 'entry'), false);

  // Wholesaler ads are allowed on pharmacy/doctor/entry/wholesaler, never patient
  assert.equal(isAdEntityAllowedOnPortal('wholesaler', 'pharmacy'), true);
  assert.equal(isAdEntityAllowedOnPortal('wholesaler', 'doctor'), true);
  assert.equal(isAdEntityAllowedOnPortal('wholesaler', 'patient'), false);

  assert.deepEqual(normalizeTargetPortals(['patient', 'lab', 'pharmacy'], 'radiology_info'), ['lab']);
  assert.deepEqual(normalizeTargetPortals(['patient', 'pharmacy'], 'wholesaler'), ['pharmacy']);
});

test('Targeted Ads HTTP Feed filters by portal and records events', async () => {
  const { db, store } = createMockFirestore({
    medora_ads: {
      ad_wholesaler: {
        adId: 'ad_wholesaler',
        entityType: 'wholesaler',
        entityId: 'wh_1',
        titleAr: 'مذخر الرافدين',
        titleEn: 'Al-Rafidain Wholesaler',
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/ad1.jpg',
        targetPortals: ['pharmacy', 'patient'],
        actionType: 'open_portal_tab',
        actionTarget: 'b2b_market',
        approvedByAdmin: true,
        active: true,
        status: 'published',
        priority: 90,
        startDate: '2025-01-01',
        endDate: '2029-12-31',
      },
      ad_rad_ref: {
        adId: 'ad_rad_ref',
        entityType: 'radiology_info',
        titleAr: 'دليل التحويل الشعاعي للمختبرات',
        titleEn: 'Lab Imaging Referral Info',
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/ad2.jpg',
        targetPortals: ['lab', 'patient'],
        actionType: 'info_only',
        approvedByAdmin: true,
        active: true,
        status: 'published',
        priority: 80,
        startDate: '2025-01-01',
        endDate: '2029-12-31',
      },
      ad_doctor: {
        adId: 'ad_doctor',
        entityType: 'doctor',
        entityId: 'doc_1',
        titleAr: 'عيادة القلب',
        titleEn: 'Cardiology Clinic',
        imageUrl: 'https://firebasestorage.googleapis.com/v0/b/test/o/ad3.jpg',
        targetPortals: ['patient', 'entry'],
        actionType: 'open_directory',
        approvedByAdmin: true,
        active: true,
        status: 'published',
        priority: 95,
        startDate: '2025-01-01',
        endDate: '2029-12-31',
      },
    },
    doctor_public_cards: {
      doc_1: { doctorUid: 'doc_1', status: 'Approved', active: true },
    },
    wholesaler_profiles: {
      wh_1: { wholesalerUid: 'wh_1', status: 'Approved', suspended: false },
    },
    institutions: {},
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createAdsRouter({
      adminAuth: { verifyIdToken: async () => { throw new Error('NO'); } } as never,
      getAdminDb: () => db as never,
      requireSuperAdmin: (_req, res) => { res.status(403).json({ error: 'FORBIDDEN' }); },
    }),
  );

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;

  try {
    const pharmacyFeed = await fetch(`http://127.0.0.1:${port}/api/ads/targeted?portal=pharmacy`).then((r) => r.json() as Promise<{ ads: Array<{ adId: string }> }>);
    assert.deepEqual(pharmacyFeed.ads.map((a) => a.adId), ['ad_wholesaler']);

    const patientFeed = await fetch(`http://127.0.0.1:${port}/api/ads/targeted?portal=patient`).then((r) => r.json() as Promise<{ ads: Array<{ adId: string }> }>);
    assert.deepEqual(patientFeed.ads.map((a) => a.adId), ['ad_doctor']);

    const labFeed = await fetch(`http://127.0.0.1:${port}/api/ads/targeted?portal=lab`).then((r) => r.json() as Promise<{ ads: Array<{ adId: string }> }>);
    assert.deepEqual(labFeed.ads.map((a) => a.adId), ['ad_rad_ref']);

    const evRes = await fetch(`http://127.0.0.1:${port}/api/ads/ad_wholesaler/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'click', portal: 'pharmacy' }),
    });
    assert.equal(evRes.status, 200);
    assert.equal(store.get('ad_events')?.size, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

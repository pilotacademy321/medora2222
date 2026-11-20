import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { createMessagingRouter } from '../server/messagingRoutes.ts';

function createMessagingMockDb() {
  const cols = new Map<string, Map<string, Record<string, unknown>>>();

  const ensureCol = (name: string) => {
    let m = cols.get(name);
    if (!m) {
      m = new Map();
      cols.set(name, m);
    }
    return m;
  };

  // Seed identities
  ensureCol('admin_roles').set('admin_uid', { active: true });
  ensureCol('secretary_profiles').set('sec_uid', { uid: 'sec_uid', doctorUid: 'doc_uid' });
  ensureCol('patient_profiles').set('pat_uid', { uid: 'pat_uid', fullName: 'مريض تجريبي', status: 'Active' });
  ensureCol('doctor_profiles').set('doc_uid', { uid: 'doc_uid', fullName: 'د. سارة', status: 'Approved' });
  ensureCol('pharmacy_profiles').set('pharm_uid', {
    pharmacyUid: 'pharm_uid',
    pharmacyNameAr: 'صيدلية النخبة',
    status: 'Approved',
  });
  ensureCol('wholesaler_profiles').set('wh_uid', {
    wholesalerUid: 'wh_uid',
    companyNameAr: 'مذخر الفرات',
    status: 'Approved',
  });

  const makeSnap = (id: string, data: Record<string, unknown> | undefined) => ({
    id,
    exists: Boolean(data),
    data: () => (data ? structuredClone(data) : undefined),
  });

  const db = {
    collection(name: string) {
      const filters: Array<{ field: string; op: string; val: unknown }> = [];
      let maxLimit = 500;
      const q = {
        where(field: string, op: string, val: unknown) {
          filters.push({ field, op, val });
          return q;
        },
        orderBy() {
          return q;
        },
        limit(n: number) {
          maxLimit = n;
          return q;
        },
        async get() {
          const map = ensureCol(name);
          const docs: Array<ReturnType<typeof makeSnap>> = [];
          for (const [id, data] of map.entries()) {
            const ok = filters.every((f) => {
              if (f.op === '==') return data[f.field] === f.val;
              if (f.op === 'array-contains') {
                return Array.isArray(data[f.field]) && (data[f.field] as unknown[]).includes(f.val);
              }
              return false;
            });
            if (ok) docs.push(makeSnap(id, data));
            if (docs.length >= maxLimit) break;
          }
          return { docs };
        },
      };
      return q;
    },
    doc(path: string) {
      const [colName, docId] = path.split('/');
      return {
        async get() {
          return makeSnap(docId, ensureCol(colName).get(docId));
        },
        async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
          const existing = ensureCol(colName).get(docId) || {};
          ensureCol(colName).set(
            docId,
            opts?.merge ? { ...existing, ...structuredClone(data) } : structuredClone(data),
          );
        },
        async update(patch: Record<string, unknown>) {
          const existing = ensureCol(colName).get(docId);
          if (!existing) throw new Error('NOT_FOUND');
          const next = { ...existing };
          for (const [k, v] of Object.entries(patch)) {
            if (k.includes('.')) {
              const [top, sub] = k.split('.');
              const base = (next[top] && typeof next[top] === 'object' ? { ...(next[top] as Record<string, unknown>) } : {});
              base[sub] = v;
              next[top] = base;
            } else {
              next[k] = v;
            }
          }
          ensureCol(colName).set(docId, next);
        },
      };
    },
  };

  return { db, cols };
}

test('Unified Cross-Portal Messaging Enforces Role Permissions, Secretary Isolation, and 403 Non-Participant Privacy', async () => {
  const { db } = createMessagingMockDb();

  const tokenUsers: Record<string, { uid: string; email: string; email_verified: boolean; name: string }> = {
    tok_pat: { uid: 'pat_uid', email: 'pat@medora.test', email_verified: true, name: 'مريض تجريبي' },
    tok_pharm: { uid: 'pharm_uid', email: 'pharm@medora.test', email_verified: true, name: 'صيدلية النخبة' },
    tok_wh: { uid: 'wh_uid', email: 'wh@medora.test', email_verified: true, name: 'مذخر الفرات' },
    tok_sec: { uid: 'sec_uid', email: 'sec@medora.test', email_verified: true, name: 'Secretary' },
    tok_admin: { uid: 'admin_uid', email: 'aqbs250@gmail.com', email_verified: true, name: 'Super Admin' },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createMessagingRouter({
      adminAuth: {
        verifyIdToken: async (token: string) => {
          const u = tokenUsers[token];
          if (!u) throw new Error('INVALID_TOKEN');
          return u;
        },
      } as never,
      getAdminDb: () => db as never,
      requireSuperAdmin: (_req, res) => {
        res.status(403).json({ error: 'FORBIDDEN' });
      },
    }),
  );

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;

  try {
    // 1. Secretary Portal account is strictly blocked from cross-portal messaging
    const secRes = await fetch(`http://127.0.0.1:${port}/api/messaging/overview`, {
      headers: { Authorization: 'Bearer tok_sec' },
    });
    assert.equal(secRes.status, 403);

    // 2. Patient opens a permitted patient_pharmacy thread
    const createRes = await fetch(`http://127.0.0.1:${port}/api/messaging/threads`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok_pat',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'patient_pharmacy',
        targetUid: 'pharm_uid',
        targetRole: 'pharmacy',
        subject: 'استفسار عن توفر دواء',
        initialMessage: 'مرحباً هل الدواء متوفر؟',
      }),
    });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as { thread: { threadId: string; participantUids: string[] } };
    assert.ok(created.thread.participantUids.includes('pat_uid'));
    assert.ok(created.thread.participantUids.includes('pharm_uid'));

    // 3. Unrelated wholesaler cannot read patient_pharmacy thread (403)
    const intrusionRes = await fetch(
      `http://127.0.0.1:${port}/api/messaging/threads/${created.thread.threadId}/messages`,
      { headers: { Authorization: 'Bearer tok_wh' } },
    );
    assert.equal(intrusionRes.status, 403);

    // 4. Pharmacy recipient can read & reply inside the thread
    const replyRes = await fetch(
      `http://127.0.0.1:${port}/api/messaging/threads/${created.thread.threadId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok_pharm',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'نعم متوفر في صيدلية النخبة.' }),
      },
    );
    assert.equal(replyRes.status, 200);

    // 5. Super Admin monitor can inspect thread messages without error
    const adminRead = await fetch(
      `http://127.0.0.1:${port}/api/messaging/threads/${created.thread.threadId}/messages`,
      { headers: { Authorization: 'Bearer tok_admin' } },
    );
    assert.equal(adminRead.status, 200);
    const adminPayload = (await adminRead.json()) as { messages: Array<{ body: string }> };
    assert.equal(adminPayload.messages.length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

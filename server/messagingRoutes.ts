import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import { resolvePharmacyActorFromDb } from './pharmacyRoutes.ts';
import { resolveWholesalerActorFromDb } from './wholesalerRoutes.ts';
import { safeCommerceId } from './commerceReceiptsEngine.ts';
import type { UploadedDocMeta } from '../src/types/medora.ts';
import type {
  MedoraPartyRole,
  MedoraThread,
  MedoraThreadCategory,
  MedoraThreadMessage,
  MedoraThreadParticipant,
} from '../src/types/commerce.ts';

export interface MessagingRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore;
  requireSuperAdmin: RequestHandler;
}

interface VerifiedActor {
  uid: string;
  email: string;
  name: string;
}

const AUTHORIZED_SUPER_ADMIN_EMAIL = 'aqbs250@gmail.com';

const ALLOWED_CATEGORY_PAIRS: Record<MedoraThreadCategory, Array<[MedoraPartyRole, MedoraPartyRole]>> = {
  patient_doctor: [['patient', 'doctor']],
  patient_pharmacy: [['patient', 'pharmacy']],
  doctor_pharmacy: [['doctor', 'pharmacy']],
  pharmacy_wholesaler: [['pharmacy', 'wholesaler']],
  lab_doctor: [['lab', 'doctor']],
  patient_lab: [['patient', 'lab']],
  entity_admin: [
    ['patient', 'super_admin'],
    ['doctor', 'super_admin'],
    ['lab', 'super_admin'],
    ['pharmacy', 'super_admin'],
    ['wholesaler', 'super_admin'],
  ],
};

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeValue);
  if (val && typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (typeof rec.toDate === 'function') {
      try {
        return (rec.toDate as () => Date)().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = serializeValue(v);
    return out;
  }
  return val;
}

function serializeDoc(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

function isAllowedPair(
  category: MedoraThreadCategory,
  roleA: MedoraPartyRole,
  roleB: MedoraPartyRole,
): boolean {
  const pairs = ALLOWED_CATEGORY_PAIRS[category] || [];
  return pairs.some(
    ([r1, r2]) => (roleA === r1 && roleB === r2) || (roleA === r2 && roleB === r1),
  );
}

function sanitizeAttachments(raw: unknown): UploadedDocMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: UploadedDocMeta[] = [];
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const url = normalizeStr(rec.url, 1000);
    if (!url || (!url.startsWith('/api/media/') && !url.startsWith('https://'))) continue;
    out.push({
      name: normalizeStr(rec.name, 120) || 'attachment',
      size: Number(rec.size || 0) || 0,
      mimeType: normalizeStr(rec.mimeType, 100) || 'application/octet-stream',
      url,
      storagePath: normalizeStr(rec.storagePath, 300),
      uploadedAtIso: normalizeStr(rec.uploadedAtIso, 40) || new Date().toISOString(),
    });
  }
  return out;
}

export function createMessagingRouter(deps: MessagingRouterDeps): Router {
  const router = express.Router();

  async function verifyActor(req: Request): Promise<VerifiedActor | null> {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
      const decoded = await deps.adminAuth.verifyIdToken(token, false);
      if (!decoded.uid || decoded.email_verified !== true) return null;
      return {
        uid: decoded.uid,
        email: (decoded.email || '').trim().toLowerCase(),
        name: normalizeStr(decoded.name || decoded.email, 120) || 'MEDORA User',
      };
    } catch {
      return null;
    }
  }

  async function resolveMessagingIdentity(
    db: Firestore,
    actor: VerifiedActor,
    requestedRole?: string,
  ): Promise<
    | {
        ok: true;
        isSuperAdmin: boolean;
        effectiveUid: string;
        role: MedoraPartyRole;
        displayName: string;
        scopedUids: Set<string>;
      }
    | { ok: false; statusCode: number; error: string }
  > {
    // Keep Secretary Portal communications strictly separated
    const secSnap = await db.doc(`secretary_profiles/${actor.uid}`).get().catch(() => null);
    if (secSnap?.exists) {
      return { ok: false, statusCode: 403, error: 'SECRETARY_USE_INDEPENDENT_PORTAL' };
    }

    if (actor.email === AUTHORIZED_SUPER_ADMIN_EMAIL) {
      const roleSnap = await db.doc(`admin_roles/${actor.uid}`).get().catch(() => null);
      if (roleSnap?.exists && roleSnap.data()?.active === true) {
        return {
          ok: true,
          isSuperAdmin: true,
          effectiveUid: actor.uid,
          role: 'super_admin',
          displayName: 'MEDORA Super Admin',
          scopedUids: new Set([actor.uid]),
        };
      }
    }

    const candidates: Array<{
      role: MedoraPartyRole;
      effectiveUid: string;
      displayName: string;
    }> = [];

    const phRes = await resolvePharmacyActorFromDb(db, actor).catch(() => null);
    if (phRes && phRes.ok) {
      candidates.push({
        role: 'pharmacy',
        effectiveUid: phRes.ctx.pharmacyUid,
        displayName:
          phRes.ctx.pharmacyProfile.pharmacyNameAr ||
          phRes.ctx.pharmacyProfile.pharmacyNameEn ||
          actor.name,
      });
    }

    const whRes = await resolveWholesalerActorFromDb(db, actor).catch(() => null);
    if (whRes && whRes.ok) {
      candidates.push({
        role: 'wholesaler',
        effectiveUid: whRes.ctx.wholesalerUid,
        displayName:
          whRes.ctx.wholesalerProfile.wholesalerNameAr ||
          whRes.ctx.wholesalerProfile.wholesalerNameEn ||
          actor.name,
      });
    }

    const docSnap = await db.doc(`doctor_profiles/${actor.uid}`).get().catch(() => null);
    if (docSnap?.exists && docSnap.data()?.status === 'Approved') {
      candidates.push({
        role: 'doctor',
        effectiveUid: actor.uid,
        displayName: normalizeStr(docSnap.data()?.fullName, 120) || actor.name,
      });
    }

    const labSnap = await db.doc(`lab_profiles/${actor.uid}`).get().catch(() => null);
    if (labSnap?.exists && labSnap.data()?.status === 'Approved') {
      candidates.push({
        role: 'lab',
        effectiveUid: actor.uid,
        displayName:
          normalizeStr(labSnap.data()?.labNameAr, 120) ||
          normalizeStr(labSnap.data()?.labNameEn, 120) ||
          actor.name,
      });
    }

    const patSnap = await db.doc(`patient_profiles/${actor.uid}`).get().catch(() => null);
    if (patSnap?.exists) {
      candidates.push({
        role: 'patient',
        effectiveUid: actor.uid,
        displayName: normalizeStr(patSnap.data()?.fullName, 120) || actor.name,
      });
    }

    if (candidates.length === 0) {
      // Fallback for verified user contacting Super Admin
      const userSnap = await db.doc(`users/${actor.uid}`).get().catch(() => null);
      const fallbackName = normalizeStr(userSnap?.data()?.fullName, 120) || actor.name;
      candidates.push({
        role: 'patient',
        effectiveUid: actor.uid,
        displayName: fallbackName,
      });
    }

    const chosen =
      (requestedRole ? candidates.find((c) => c.role === requestedRole) : undefined) ||
      candidates[0];

    const scopedUids = new Set<string>([actor.uid, ...candidates.map((c) => c.effectiveUid)]);

    return {
      ok: true,
      isSuperAdmin: false,
      effectiveUid: chosen.effectiveUid,
      role: chosen.role,
      displayName: chosen.displayName,
      scopedUids,
    };
  }

  async function resolveTargetParticipant(
    db: Firestore,
    targetUid: string,
    targetRole: MedoraPartyRole,
  ): Promise<MedoraThreadParticipant | null> {
    if (targetRole === 'super_admin') {
      const admSnap = await db
        .collection('admin_roles')
        .where('active', '==', true)
        .limit(1)
        .get()
        .catch(() => null);
      const admUid = admSnap && !admSnap.empty ? admSnap.docs[0].id : targetUid;
      return {
        uid: admUid || 'super_admin',
        role: 'super_admin',
        name: 'MEDORA Super Admin',
        subtitle: 'الإدارة المركزية للمنصة',
      };
    }

    if (targetRole === 'pharmacy') {
      const snap = await db.doc(`pharmacy_profiles/${targetUid}`).get();
      if (!snap.exists || snap.data()?.status !== 'Approved') return null;
      return {
        uid: targetUid,
        role: 'pharmacy',
        name:
          normalizeStr(snap.data()?.pharmacyNameAr, 120) ||
          normalizeStr(snap.data()?.pharmacyNameEn, 120) ||
          'صيدلية',
        subtitle: normalizeStr(snap.data()?.governorate, 60),
      };
    }

    if (targetRole === 'wholesaler') {
      const snap = await db.doc(`wholesaler_profiles/${targetUid}`).get();
      if (!snap.exists || snap.data()?.status !== 'Approved') return null;
      return {
        uid: targetUid,
        role: 'wholesaler',
        name:
          normalizeStr(snap.data()?.companyNameAr, 120) ||
          normalizeStr(snap.data()?.companyNameEn, 120) ||
          'مذخر أدوية',
        subtitle: normalizeStr(snap.data()?.governorate, 60),
      };
    }

    if (targetRole === 'doctor') {
      const snap = await db.doc(`doctor_profiles/${targetUid}`).get();
      if (!snap.exists || snap.data()?.status !== 'Approved') return null;
      return {
        uid: targetUid,
        role: 'doctor',
        name: normalizeStr(snap.data()?.fullName, 120) || 'طبيب',
        subtitle: normalizeStr(snap.data()?.specialty, 80),
      };
    }

    if (targetRole === 'lab') {
      const snap = await db.doc(`lab_profiles/${targetUid}`).get();
      if (!snap.exists || snap.data()?.status !== 'Approved') return null;
      return {
        uid: targetUid,
        role: 'lab',
        name:
          normalizeStr(snap.data()?.labNameAr, 120) ||
          normalizeStr(snap.data()?.labNameEn, 120) ||
          'مختبر',
        subtitle: normalizeStr(snap.data()?.governorate, 60),
      };
    }

    if (targetRole === 'patient') {
      const snap = await db.doc(`patient_profiles/${targetUid}`).get();
      if (snap.exists) {
        return {
          uid: targetUid,
          role: 'patient',
          name: normalizeStr(snap.data()?.fullName, 120) || 'مراجع',
          subtitle: normalizeStr(snap.data()?.governorate, 60),
        };
      }
      const userSnap = await db.doc(`users/${targetUid}`).get();
      if (userSnap.exists) {
        return {
          uid: targetUid,
          role: 'patient',
          name: normalizeStr(userSnap.data()?.fullName || userSnap.data()?.googleName, 120) || 'مراجع',
        };
      }
    }

    return null;
  }

  router.get('/messages/recipients', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const portalRole = normalizeStr(req.query.role, 32);
    const idRes = await resolveMessagingIdentity(db, actor, portalRole);
    if (!idRes.ok) {
      res.status(idRes.statusCode).json({ error: idRes.error });
      return;
    }

    try {
      const recipients: Array<{
        uid: string;
        role: MedoraPartyRole;
        name: string;
        subtitle?: string;
        category: MedoraThreadCategory;
      }> = [];

      const adminSnap = await db.collection('admin_roles').where('active', '==', true).limit(1).get().catch(() => null);
      const adminUid = adminSnap && !adminSnap.empty ? adminSnap.docs[0].id : '';
      if (!idRes.isSuperAdmin && adminUid) {
        recipients.push({
          uid: adminUid,
          role: 'super_admin',
          name: 'MEDORA Super Admin',
          subtitle: 'الإدارة المركزية والدعم التشغيلي',
          category: 'entity_admin',
        });
      }

      const role = idRes.role;

      if (role === 'patient' || role === 'doctor' || role === 'pharmacy' || idRes.isSuperAdmin) {
        if (role === 'patient' || role === 'doctor' || idRes.isSuperAdmin) {
          const phSnap = await db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(120).get().catch(() => ({ docs: [] }));
          for (const d of phSnap.docs) {
            const p = d.data();
            recipients.push({
              uid: d.id,
              role: 'pharmacy',
              name: normalizeStr(p.pharmacyNameAr || p.pharmacyNameEn, 120) || 'Pharmacy',
              subtitle: normalizeStr(p.governorate, 60),
              category: role === 'doctor' ? 'doctor_pharmacy' : role === 'patient' ? 'patient_pharmacy' : 'entity_admin',
            });
          }
        }
      }

      if (role === 'pharmacy' || role === 'wholesaler' || idRes.isSuperAdmin) {
        if (role === 'pharmacy' || idRes.isSuperAdmin) {
          const whSnap = await db.collection('wholesaler_profiles').where('status', '==', 'Approved').limit(120).get().catch(() => ({ docs: [] }));
          for (const d of whSnap.docs) {
            const w = d.data();
            recipients.push({
              uid: d.id,
              role: 'wholesaler',
              name: normalizeStr(w.companyNameAr || w.companyNameEn, 120) || 'Wholesaler',
              subtitle: normalizeStr(w.governorate, 60),
              category: role === 'pharmacy' ? 'pharmacy_wholesaler' : 'entity_admin',
            });
          }
        }
        if (role === 'wholesaler' || idRes.isSuperAdmin) {
          const phSnap = await db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(120).get().catch(() => ({ docs: [] }));
          for (const d of phSnap.docs) {
            const p = d.data();
            recipients.push({
              uid: d.id,
              role: 'pharmacy',
              name: normalizeStr(p.pharmacyNameAr || p.pharmacyNameEn, 120) || 'Pharmacy',
              subtitle: normalizeStr(p.governorate, 60),
              category: role === 'wholesaler' ? 'pharmacy_wholesaler' : 'entity_admin',
            });
          }
        }
      }

      if (role === 'patient' || role === 'lab' || role === 'pharmacy' || idRes.isSuperAdmin) {
        const docSnap = await db.collection('doctor_profiles').where('status', '==', 'Approved').limit(120).get().catch(() => ({ docs: [] }));
        for (const d of docSnap.docs) {
          if (d.id === idRes.effectiveUid) continue;
          const doc = d.data();
          recipients.push({
            uid: d.id,
            role: 'doctor',
            name: normalizeStr(doc.fullName, 120) || 'Doctor',
            subtitle: normalizeStr(doc.specialty, 80),
            category:
              role === 'patient'
                ? 'patient_doctor'
                : role === 'lab'
                  ? 'lab_doctor'
                  : role === 'pharmacy'
                    ? 'doctor_pharmacy'
                    : 'entity_admin',
          });
        }
      }

      if (role === 'patient' || role === 'doctor' || idRes.isSuperAdmin) {
        const labSnap = await db.collection('lab_profiles').where('status', '==', 'Approved').limit(120).get().catch(() => ({ docs: [] }));
        for (const d of labSnap.docs) {
          const l = d.data();
          recipients.push({
            uid: d.id,
            role: 'lab',
            name: normalizeStr(l.labNameAr || l.labNameEn, 120) || 'Lab',
            subtitle: normalizeStr(l.governorate, 60),
            category: role === 'patient' ? 'patient_lab' : role === 'doctor' ? 'lab_doctor' : 'entity_admin',
          });
        }
      }

      if (role === 'doctor') {
        const appts = await db.collection('appointments').where('doctorUid', '==', idRes.effectiveUid).limit(80).get().catch(() => ({ docs: [] }));
        const seen = new Set<string>();
        for (const a of appts.docs) {
          const pUid = normalizeStr(a.data()?.patientUid, 128);
          if (!pUid || seen.has(pUid)) continue;
          seen.add(pUid);
          recipients.push({
            uid: pUid,
            role: 'patient',
            name: normalizeStr(a.data()?.patientName, 120) || 'مريض',
            subtitle: 'موعد عيادة',
            category: 'patient_doctor',
          });
        }
      } else if (role === 'pharmacy') {
        const ords = await db.collection('pharmacy_orders').where('pharmacyUid', '==', idRes.effectiveUid).limit(80).get().catch(() => ({ docs: [] }));
        const seen = new Set<string>();
        for (const o of ords.docs) {
          const pUid = normalizeStr(o.data()?.patientUid, 128);
          if (!pUid || seen.has(pUid)) continue;
          seen.add(pUid);
          recipients.push({
            uid: pUid,
            role: 'patient',
            name: normalizeStr(o.data()?.patientName, 120) || 'مريض',
            subtitle: 'طلب دوائي',
            category: 'patient_pharmacy',
          });
        }
      } else if (role === 'lab') {
        const ords = await db.collection('lab_orders').where('labUid', '==', idRes.effectiveUid).limit(80).get().catch(() => ({ docs: [] }));
        const seen = new Set<string>();
        for (const o of ords.docs) {
          const pUid = normalizeStr(o.data()?.patientUid, 128);
          if (!pUid || seen.has(pUid)) continue;
          seen.add(pUid);
          recipients.push({
            uid: pUid,
            role: 'patient',
            name: normalizeStr(o.data()?.patientName, 120) || 'مريض',
            subtitle: 'طلب تحليل',
            category: 'patient_lab',
          });
        }
      } else if (idRes.isSuperAdmin) {
        const patSnap = await db.collection('patient_profiles').limit(60).get().catch(() => ({ docs: [] }));
        for (const p of patSnap.docs) {
          recipients.push({
            uid: p.id,
            role: 'patient',
            name: normalizeStr(p.data()?.fullName, 120) || 'مراجع',
            subtitle: normalizeStr(p.data()?.governorate, 60),
            category: 'entity_admin',
          });
        }
      }

      // Deduplicate by uid+category
      const deduped = new Map<string, (typeof recipients)[number]>();
      for (const r of recipients) {
        if (!r.uid || r.uid === idRes.effectiveUid) continue;
        deduped.set(`${r.uid}_${r.category}`, r);
      }

      res.json({ ok: true, recipients: Array.from(deduped.values()) });
    } catch (err) {
      console.error('[MEDORA][Messaging] GET /messages/recipients failed:', err);
      res.status(500).json({ error: 'RECIPIENTS_LOAD_FAILED' });
    }
  });

  router.get('/messages/threads', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const requestedRole = normalizeStr(req.query.role, 32);
    const scope = normalizeStr(req.query.scope, 20);
    const idRes = await resolveMessagingIdentity(db, actor, requestedRole);
    if (!idRes.ok) {
      res.status(idRes.statusCode).json({ error: idRes.error });
      return;
    }

    try {
      const threadsMap = new Map<string, MedoraThread>();

      if (idRes.isSuperAdmin && scope === 'admin') {
        const snap = await db.collection('medora_threads').limit(250).get();
        for (const d of snap.docs) {
          const t = serializeDoc(d.data()) as unknown as MedoraThread;
          if (t.threadId) threadsMap.set(t.threadId, t);
        }
      } else {
        const snaps = await Promise.all(
          Array.from(idRes.scopedUids).map((uid) =>
            db.collection('medora_threads').where('participantUids', 'array-contains', uid).limit(150).get(),
          ),
        );
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const t = serializeDoc(d.data()) as unknown as MedoraThread;
            if (t.threadId) threadsMap.set(t.threadId, t);
          }
        }
      }

      const threads = Array.from(threadsMap.values()).sort((a, b) => {
        const at = Date.parse(a.lastMessageAt || a.createdAt || '') || 0;
        const bt = Date.parse(b.lastMessageAt || b.createdAt || '') || 0;
        return bt - at;
      });

      const totalUnread = threads.reduce((sum, t) => {
        const map = t.unreadCountByUid || {};
        let c = 0;
        for (const uid of idRes.scopedUids) c += Number(map[uid] || 0);
        return sum + c;
      }, 0);

      res.json({
        ok: true,
        viewerRole: idRes.role,
        viewerUid: idRes.effectiveUid,
        threads,
        totalUnread,
      });
    } catch (err) {
      console.error('[MEDORA][Messaging] GET /messages/threads failed:', err);
      res.status(500).json({ error: 'THREADS_LOAD_FAILED' });
    }
  });

  router.post('/messages/threads', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const requestedRole = normalizeStr(req.body?.senderRole, 32);
    const idRes = await resolveMessagingIdentity(db, actor, requestedRole);
    if (!idRes.ok) {
      res.status(idRes.statusCode).json({ error: idRes.error });
      return;
    }

    const category = normalizeStr(req.body?.category, 40) as MedoraThreadCategory;
    const recipientUid = normalizeStr(req.body?.recipientUid, 128);
    const recipientRole = normalizeStr(req.body?.recipientRole, 32) as MedoraPartyRole;
    const subject = normalizeStr(req.body?.subject, 160);
    const initialBody = normalizeStr(req.body?.body, 2000);
    const attachments = sanitizeAttachments(req.body?.attachments);
    const rawTxRef = req.body?.transactionRef;

    if (!category || !ALLOWED_CATEGORY_PAIRS[category] || !recipientUid || !recipientRole) {
      res.status(400).json({ error: 'INVALID_THREAD_PARAMETERS' });
      return;
    }
    if (recipientUid === idRes.effectiveUid) {
      res.status(400).json({ error: 'CANNOT_MESSAGE_SELF' });
      return;
    }
    if (!isAllowedPair(category, idRes.role, recipientRole)) {
      res.status(403).json({ error: 'THREAD_PAIR_NOT_ALLOWED' });
      return;
    }
    if (!initialBody && attachments.length === 0) {
      res.status(400).json({ error: 'EMPTY_MESSAGE_BODY' });
      return;
    }

    try {
      const targetParticipant = await resolveTargetParticipant(db, recipientUid, recipientRole);
      if (!targetParticipant) {
        res.status(404).json({ error: 'RECIPIENT_NOT_FOUND_OR_NOT_APPROVED' });
        return;
      }

      const sortedUids = [idRes.effectiveUid, targetParticipant.uid].sort();
      const txRefId =
        rawTxRef && typeof rawTxRef === 'object' && normalizeStr(rawTxRef.id, 128)
          ? normalizeStr(rawTxRef.id, 128)
          : '';
      const deterministicKey = txRefId
        ? `thr_${category}_${sortedUids[0]}_${sortedUids[1]}_${txRefId}`
        : `thr_${category}_${sortedUids[0]}_${sortedUids[1]}`;
      const threadId = deterministicKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);

      const nowIso = new Date().toISOString();
      const threadRef = db.doc(`medora_threads/${threadId}`);
      const existingSnap = await threadRef.get();

      const msgId = safeCommerceId('mmsg');
      const participants: MedoraThreadParticipant[] = [
        { uid: idRes.effectiveUid, role: idRes.role, name: idRes.displayName },
        targetParticipant,
      ];

      let finalThread: MedoraThread;
      if (!existingSnap.exists) {
        finalThread = {
          threadId,
          category,
          participantUids: sortedUids,
          participants,
          subject: subject || `${idRes.displayName} ↔ ${targetParticipant.name}`,
          ...(rawTxRef && typeof rawTxRef === 'object' && txRefId
            ? {
                transactionRef: {
                  type: normalizeStr(rawTxRef.type, 40) as NonNullable<MedoraThread['transactionRef']>['type'],
                  id: txRefId,
                  number: normalizeStr(rawTxRef.number, 64),
                },
              }
            : { transactionRef: null }),
          lastMessageText: initialBody || `مرفق (${attachments.length})`,
          lastSenderUid: idRes.effectiveUid,
          lastSenderName: idRes.displayName,
          lastMessageAt: nowIso,
          unreadCountByUid: {
            [idRes.effectiveUid]: 0,
            [targetParticipant.uid]: 1,
          },
          status: 'open',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await threadRef.set(finalThread);
      } else {
        const cur = serializeDoc(existingSnap.data()) as unknown as MedoraThread;
        const nextUnread = { ...(cur.unreadCountByUid || {}) };
        nextUnread[targetParticipant.uid] = Number(nextUnread[targetParticipant.uid] || 0) + 1;
        nextUnread[idRes.effectiveUid] = 0;

        await threadRef.update({
          lastMessageText: initialBody || `مرفق (${attachments.length})`,
          lastSenderUid: idRes.effectiveUid,
          lastSenderName: idRes.displayName,
          lastMessageAt: nowIso,
          unreadCountByUid: nextUnread,
          updatedAt: nowIso,
        });
        finalThread = {
          ...cur,
          lastMessageText: initialBody || `مرفق (${attachments.length})`,
          lastSenderUid: idRes.effectiveUid,
          lastSenderName: idRes.displayName,
          lastMessageAt: nowIso,
          unreadCountByUid: nextUnread,
          updatedAt: nowIso,
        };
      }

      const msgDoc: MedoraThreadMessage = {
        messageId: msgId,
        threadId,
        participantUids: sortedUids,
        senderUid: idRes.effectiveUid,
        senderRole: idRes.role,
        senderName: idRes.displayName,
        body: initialBody,
        attachments,
        readByUids: [idRes.effectiveUid],
        readAtByUid: { [idRes.effectiveUid]: nowIso },
        createdAt: nowIso,
      };
      await db.doc(`medora_thread_messages/${msgId}`).set(msgDoc);

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'important_account_update',
          recipientUid: targetParticipant.uid,
          recipientRole: targetParticipant.role,
          title: `رسالة جديدة من ${idRes.displayName}`,
          body: (initialBody || 'تم إرسال مرفق جديد').slice(0, 140),
          inAppType: 'admin_notice',
          relatedId: threadId,
          relatedType: 'medora_thread',
          idempotencyKey: `mmsg_${msgId}`,
        })
        .catch(() => undefined);

      res.status(201).json({ ok: true, thread: finalThread, message: msgDoc });
    } catch (err) {
      console.error('[MEDORA][Messaging] POST /messages/threads failed:', err);
      res.status(500).json({ error: 'THREAD_CREATE_FAILED' });
    }
  });

  router.get('/messages/threads/:threadId/messages', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const threadId = normalizeStr(req.params.threadId, 128);
    const requestedRole = normalizeStr(req.query.role, 32);
    const idRes = await resolveMessagingIdentity(db, actor, requestedRole);
    if (!idRes.ok) {
      res.status(idRes.statusCode).json({ error: idRes.error });
      return;
    }

    try {
      const threadRef = db.doc(`medora_threads/${threadId}`);
      const threadSnap = await threadRef.get();
      if (!threadSnap.exists) {
        res.status(404).json({ error: 'THREAD_NOT_FOUND' });
        return;
      }

      const thread = serializeDoc(threadSnap.data()) as unknown as MedoraThread;
      const isParticipant = (thread.participantUids || []).some((uid) => idRes.scopedUids.has(uid));
      if (!isParticipant && !idRes.isSuperAdmin) {
        res.status(403).json({ error: 'THREAD_FORBIDDEN' });
        return;
      }

      const msgSnap = await db
        .collection('medora_thread_messages')
        .where('threadId', '==', threadId)
        .limit(300)
        .get();

      const messages = msgSnap.docs
        .map((d) => serializeDoc(d.data()) as unknown as MedoraThreadMessage)
        .sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0));

      // Mark unread messages as read for participant viewer
      if (isParticipant) {
        const nextUnread = { ...(thread.unreadCountByUid || {}) };
        let changed = false;
        for (const uid of idRes.scopedUids) {
          if (Number(nextUnread[uid] || 0) > 0) {
            nextUnread[uid] = 0;
            changed = true;
          }
        }
        if (changed) {
          await threadRef.update({ unreadCountByUid: nextUnread }).catch(() => undefined);
          thread.unreadCountByUid = nextUnread;
        }
      }

      res.json({ ok: true, thread, messages });
    } catch (err) {
      console.error('[MEDORA][Messaging] GET thread messages failed:', err);
      res.status(500).json({ error: 'THREAD_MESSAGES_FAILED' });
    }
  });

  router.post('/messages/threads/:threadId/messages', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const threadId = normalizeStr(req.params.threadId, 128);
    const requestedRole = normalizeStr(req.body?.senderRole, 32);
    const idRes = await resolveMessagingIdentity(db, actor, requestedRole);
    if (!idRes.ok) {
      res.status(idRes.statusCode).json({ error: idRes.error });
      return;
    }

    const body = normalizeStr(req.body?.body, 2000);
    const attachments = sanitizeAttachments(req.body?.attachments);
    if (!body && attachments.length === 0) {
      res.status(400).json({ error: 'EMPTY_MESSAGE_BODY' });
      return;
    }

    try {
      const threadRef = db.doc(`medora_threads/${threadId}`);
      const threadSnap = await threadRef.get();
      if (!threadSnap.exists) {
        res.status(404).json({ error: 'THREAD_NOT_FOUND' });
        return;
      }

      const thread = serializeDoc(threadSnap.data()) as unknown as MedoraThread;
      const isParticipant = (thread.participantUids || []).some((uid) => idRes.scopedUids.has(uid));
      if (!isParticipant && !idRes.isSuperAdmin) {
        res.status(403).json({ error: 'THREAD_FORBIDDEN' });
        return;
      }

      const nowIso = new Date().toISOString();
      const msgId = safeCommerceId('mmsg');
      const nextUnread = { ...(thread.unreadCountByUid || {}) };
      for (const pUid of thread.participantUids || []) {
        if (!idRes.scopedUids.has(pUid)) {
          nextUnread[pUid] = Number(nextUnread[pUid] || 0) + 1;
        } else {
          nextUnread[pUid] = 0;
        }
      }

      const msgDoc: MedoraThreadMessage = {
        messageId: msgId,
        threadId,
        participantUids: thread.participantUids,
        senderUid: idRes.effectiveUid,
        senderRole: idRes.role,
        senderName: idRes.displayName,
        body,
        attachments,
        readByUids: [idRes.effectiveUid],
        readAtByUid: { [idRes.effectiveUid]: nowIso },
        createdAt: nowIso,
      };

      await Promise.all([
        db.doc(`medora_thread_messages/${msgId}`).set(msgDoc),
        threadRef.update({
          lastMessageText: body || `مرفق (${attachments.length})`,
          lastSenderUid: idRes.effectiveUid,
          lastSenderName: idRes.displayName,
          lastMessageAt: nowIso,
          unreadCountByUid: nextUnread,
          updatedAt: nowIso,
        }),
      ]);

      const engine = getGlobalNotificationEngine();
      for (const p of thread.participants || []) {
        if (idRes.scopedUids.has(p.uid)) continue;
        await engine
          ?.dispatch({
            eventType: 'important_account_update',
            recipientUid: p.uid,
            recipientRole: p.role,
            title: `رسالة جديدة من ${idRes.displayName}`,
            body: (body || 'تم إرسال مرفق جديد').slice(0, 140),
            inAppType: 'admin_notice',
            relatedId: threadId,
            relatedType: 'medora_thread',
            idempotencyKey: `mmsg_${msgId}_${p.uid}`,
          })
          .catch(() => undefined);
      }

      res.status(201).json({
        ok: true,
        message: msgDoc,
        thread: {
          ...thread,
          lastMessageText: body || `مرفق (${attachments.length})`,
          lastSenderUid: idRes.effectiveUid,
          lastSenderName: idRes.displayName,
          lastMessageAt: nowIso,
          unreadCountByUid: nextUnread,
          updatedAt: nowIso,
        },
      });
    } catch (err) {
      console.error('[MEDORA][Messaging] POST thread message failed:', err);
      res.status(500).json({ error: 'MESSAGE_SEND_FAILED' });
    }
  });

  return router;
}

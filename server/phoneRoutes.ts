import express, { type Request, type Response } from 'express';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  hashPhoneKey,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
} from './iraqiPhone.ts';

export interface PhoneRoutesDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  onPhoneUpdated?: (uid: string, action: 'linked' | 'unlinked', phoneE164?: string) => Promise<void> | void;
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function serializeTimestamp(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export function createPhoneRouter(deps: PhoneRoutesDeps): express.Router {
  const router = express.Router();

  const requireAuthUid = async (req: Request, res: Response): Promise<string | null> => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'AUTH_REQUIRED' });
      return null;
    }
    try {
      const decoded = await deps.adminAuth.verifyIdToken(token);
      return decoded.uid;
    } catch {
      res.status(401).json({ error: 'INVALID_AUTH_TOKEN' });
      return null;
    }
  };

  // GET /api/phone/status — Preserves legacy verified phones and linked Google-account Iraqi phones
  router.get('/phone/status', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;

    const db = deps.isFirestoreAdminReady() ? deps.getAdminDb() : null;
    if (!db) {
      res.json({
        ok: true,
        linked: false,
        verified: false,
        phoneE164: '',
        phoneLocal: '',
        phoneMasked: '',
        verificationMethod: 'none',
        verifiedAt: null,
      });
      return;
    }

    try {
      const [verSnap, userSnap] = await Promise.all([
        db.doc(`phone_verifications/${uid}`).get(),
        db.doc(`users/${uid}`).get(),
      ]);

      const verData = verSnap.exists ? (verSnap.data() as Record<string, unknown>) : null;
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;

      let phoneE164 =
        typeof verData?.phoneE164 === 'string' && verData.phoneE164
          ? verData.phoneE164
          : typeof userData?.phone === 'string'
            ? userData.phone
            : '';

      let phoneLocal = '';
      let phoneMasked = '';
      if (phoneE164) {
        const parsed = parseAndNormalizeIraqiPhone(phoneE164);
        if (parsed.ok) {
          phoneE164 = parsed.e164;
          phoneLocal = parsed.local;
          phoneMasked = maskIraqiPhone(parsed.e164);
        }
      }

      const rawMethod = String(verData?.verificationMethod || '');
      const isVerified = verData?.verified === true || Boolean(phoneE164);
      const verificationMethod = !phoneE164
        ? 'none'
        : rawMethod === 'google_account_linked'
          ? 'google_account_linked'
          : 'legacy_verified';

      res.json({
        ok: true,
        linked: Boolean(phoneE164),
        verified: isVerified && Boolean(phoneE164),
        phoneE164,
        phoneLocal,
        phoneMasked,
        verificationMethod,
        verifiedAt: serializeTimestamp(verData?.verifiedAt),
      });
    } catch (err) {
      console.error('[MEDORA][PhoneStatus] error:', err);
      res.status(500).json({ error: 'PHONE_STATUS_FAILED' });
    }
  });

  // POST /api/phone/check-availability — Iraqi +964 validation + uniqueness check (no OTP/SMS)
  router.post('/phone/check-availability', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;

    const parsed = parseAndNormalizeIraqiPhone(String(req.body?.phone || ''));
    if (!parsed.ok) {
      res.status(400).json({
        ok: false,
        valid: false,
        available: false,
        error: parsed.errorCode,
      });
      return;
    }

    const db = deps.isFirestoreAdminReady() ? deps.getAdminDb() : null;
    if (!db) {
      res.json({
        ok: true,
        valid: true,
        available: true,
        ownedByCurrentUser: false,
        e164: parsed.e164,
        local: parsed.local,
        masked: maskIraqiPhone(parsed.e164),
        operator: parsed.operator,
      });
      return;
    }

    try {
      const phoneKey = hashPhoneKey(parsed.e164);
      const regSnap = await db.doc(`phone_registry/${phoneKey}`).get();
      if (regSnap.exists) {
        const ownerUid = String(regSnap.data()?.uid || '');
        if (ownerUid && ownerUid !== uid) {
          res.json({
            ok: true,
            valid: true,
            available: false,
            ownedByCurrentUser: false,
            e164: parsed.e164,
            local: parsed.local,
            masked: maskIraqiPhone(parsed.e164),
            operator: parsed.operator,
            error: 'PHONE_ALREADY_REGISTERED',
          });
          return;
        }
        res.json({
          ok: true,
          valid: true,
          available: true,
          ownedByCurrentUser: ownerUid === uid,
          e164: parsed.e164,
          local: parsed.local,
          masked: maskIraqiPhone(parsed.e164),
          operator: parsed.operator,
        });
        return;
      }

      const [usersMatch, patMatch] = await Promise.all([
        db.collection('users').where('phone', '==', parsed.e164).limit(2).get(),
        db.collection('patient_profiles').where('phone', '==', parsed.e164).limit(2).get(),
      ]);

      const conflict =
        usersMatch.docs.some((d) => d.id !== uid) ||
        patMatch.docs.some((d) => d.id !== uid);

      res.json({
        ok: true,
        valid: true,
        available: !conflict,
        ownedByCurrentUser: false,
        e164: parsed.e164,
        local: parsed.local,
        masked: maskIraqiPhone(parsed.e164),
        operator: parsed.operator,
        ...(conflict ? { error: 'PHONE_ALREADY_REGISTERED' } : {}),
      });
    } catch (err) {
      console.error('[MEDORA][PhoneCheck] error:', err);
      res.status(500).json({ error: 'PHONE_CHECK_FAILED' });
    }
  });

  // POST /api/phone/link — Direct Google-authenticated +964 phone linking (Zero OTP / Zero SMS)
  router.post('/phone/link', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;

    const parsed = parseAndNormalizeIraqiPhone(String(req.body?.phone || ''));
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.errorCode });
      return;
    }

    const db = deps.isFirestoreAdminReady() ? deps.getAdminDb() : null;
    if (!db) {
      res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' });
      return;
    }

    try {
      const phoneKey = hashPhoneKey(parsed.e164);
      const nowIso = new Date().toISOString();

      await db.runTransaction(async (tx) => {
        const regRef = db.doc(`phone_registry/${phoneKey}`);
        const verRef = db.doc(`phone_verifications/${uid}`);
        const userRef = db.doc(`users/${uid}`);
        const patRef = db.doc(`patient_profiles/${uid}`);

        const [regSnap, verSnap, userSnap, patSnap] = await Promise.all([
          tx.get(regRef),
          tx.get(verRef),
          tx.get(userRef),
          tx.get(patRef),
        ]);

        if (regSnap.exists && String(regSnap.data()?.uid || '') !== uid) {
          throw new Error('PHONE_ALREADY_REGISTERED');
        }

        const oldPhone =
          typeof verSnap.data()?.phoneE164 === 'string'
            ? String(verSnap.data()!.phoneE164)
            : typeof userSnap.data()?.phone === 'string'
              ? String(userSnap.data()!.phone)
              : '';

        if (oldPhone && oldPhone !== parsed.e164) {
          const oldParsed = parseAndNormalizeIraqiPhone(oldPhone);
          if (oldParsed.ok) {
            const oldKey = hashPhoneKey(oldParsed.e164);
            const oldRegRef = db.doc(`phone_registry/${oldKey}`);
            const oldRegSnap = await tx.get(oldRegRef);
            if (oldRegSnap.exists && String(oldRegSnap.data()?.uid || '') === uid) {
              tx.delete(oldRegRef);
            }
          }
        }

        tx.set(regRef, {
          phoneKey,
          phoneHash: phoneKey,
          phoneE164: parsed.e164,
          phoneMasked: maskIraqiPhone(parsed.e164),
          uid,
          operator: parsed.operator,
          verificationMethod: 'google_account_linked',
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          verRef,
          {
            uid,
            phoneE164: parsed.e164,
            phoneLocal: parsed.local,
            phoneMasked: maskIraqiPhone(parsed.e164),
            phoneKey,
            operator: parsed.operator,
            verified: true,
            verificationMethod: 'google_account_linked',
            verifiedAt: nowIso,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        if (userSnap.exists) {
          tx.set(
            userRef,
            {
              phone: parsed.e164,
              phoneVerified: true,
              phoneVerifiedAt: nowIso,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        if (patSnap.exists) {
          tx.set(
            patRef,
            {
              phone: parsed.e164,
              phoneVerified: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
      });

      if (deps.onPhoneUpdated) {
        await Promise.resolve(deps.onPhoneUpdated(uid, 'linked', parsed.e164)).catch(() => undefined);
      }

      res.json({
        ok: true,
        linked: true,
        phoneE164: parsed.e164,
        phoneLocal: parsed.local,
        phoneMasked: maskIraqiPhone(parsed.e164),
        verificationMethod: 'google_account_linked',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'PHONE_ALREADY_REGISTERED') {
        res.status(409).json({ error: 'PHONE_ALREADY_REGISTERED' });
        return;
      }
      console.error('[MEDORA][PhoneLink] error:', err);
      res.status(500).json({ error: 'PHONE_LINK_FAILED' });
    }
  });

  // DELETE /api/phone/unlink
  router.delete('/phone/unlink', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;

    const db = deps.isFirestoreAdminReady() ? deps.getAdminDb() : null;
    if (!db) {
      res.status(503).json({ error: 'FIRESTORE_UNAVAILABLE' });
      return;
    }

    try {
      await db.runTransaction(async (tx) => {
        const verRef = db.doc(`phone_verifications/${uid}`);
        const userRef = db.doc(`users/${uid}`);
        const patRef = db.doc(`patient_profiles/${uid}`);
        const prefRef = db.doc(`notification_preferences/${uid}`);

        const [verSnap, userSnap, patSnap, prefSnap] = await Promise.all([
          tx.get(verRef),
          tx.get(userRef),
          tx.get(patRef),
          tx.get(prefRef),
        ]);

        const linkedPhone =
          typeof verSnap.data()?.phoneE164 === 'string'
            ? String(verSnap.data()!.phoneE164)
            : typeof userSnap.data()?.phone === 'string'
              ? String(userSnap.data()!.phone)
              : '';

        if (linkedPhone) {
          const parsed = parseAndNormalizeIraqiPhone(linkedPhone);
          if (parsed.ok) {
            const regRef = db.doc(`phone_registry/${hashPhoneKey(parsed.e164)}`);
            const regSnap = await tx.get(regRef);
            if (regSnap.exists && String(regSnap.data()?.uid || '') === uid) {
              tx.delete(regRef);
            }
          }
        }

        if (verSnap.exists) {
          tx.delete(verRef);
        }
        if (userSnap.exists) {
          tx.set(
            userRef,
            {
              phone: '',
              phoneVerified: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        if (patSnap.exists) {
          tx.set(
            patRef,
            {
              phone: '',
              phoneVerified: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        // Automatically revert WhatsApp preference to in_app when unlinking phone
        if (prefSnap.exists && prefSnap.data()?.preferredChannel === 'whatsapp') {
          tx.set(
            prefRef,
            {
              preferredChannel: 'in_app',
              whatsappConsent: false,
              whatsappConsentAt: null,
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
      });

      if (deps.onPhoneUpdated) {
        await Promise.resolve(deps.onPhoneUpdated(uid, 'unlinked')).catch(() => undefined);
      }

      res.json({ ok: true, unlinked: true });
    } catch (err) {
      console.error('[MEDORA][PhoneUnlink] error:', err);
      res.status(500).json({ error: 'PHONE_UNLINK_FAILED' });
    }
  });

  return router;
}

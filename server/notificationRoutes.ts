import express, { type Request, type Response, type RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationRecipientRole,
} from '../src/types/notifications.ts';
import {
  ALL_NOTIFICATION_EVENTS,
  NotificationEngine,
} from './notificationEngine.ts';

export interface NotificationRoutesDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  engine: NotificationEngine;
  requireSuperAdmin: RequestHandler;
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function normalizeRoleHint(val: unknown): NotificationRecipientRole | undefined {
  if (
    val === 'patient' ||
    val === 'doctor' ||
    val === 'lab' ||
    val === 'pharmacy' ||
    val === 'wholesaler' ||
    val === 'secretary' ||
    val === 'super_admin'
  ) {
    return val;
  }
  return undefined;
}

export function createNotificationRouter(deps: NotificationRoutesDeps): express.Router {
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

  const resolveVerifiedRoleFromReq = async (
    uid: string,
    rawRole: unknown,
    res: Response,
  ): Promise<NotificationRecipientRole | null> => {
    const hasRawRole = rawRole !== undefined && rawRole !== null && String(rawRole).trim() !== '';
    const requestedRole = normalizeRoleHint(rawRole);
    const authz = await deps.engine.authorizeUserNotificationRole(uid, requestedRole, hasRawRole);
    if (authz.ok === false) {
      res.status(authz.statusCode).json({ error: authz.error });
      return null;
    }
    return authz.role;
  };

  // ---------------------------------------------------------------------------
  // User-facing Two-Channel Notification Preferences & Inbox Endpoints
  // ---------------------------------------------------------------------------
  router.get('/notifications/preferences', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;
    try {
      const verifiedRole = await resolveVerifiedRoleFromReq(uid, req.query.role, res);
      if (!verifiedRole) return;
      const preferences = await deps.engine.getUserPreferences(uid, verifiedRole);
      res.json({ ok: true, preferences });
    } catch (err) {
      console.error('[MEDORA][Notifications][GetPrefs] error:', err);
      res.status(500).json({ error: 'PREFERENCES_FETCH_FAILED' });
    }
  });

  router.put('/notifications/preferences', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;

    const preferredChannel =
      req.body?.preferredChannel === 'whatsapp'
        ? ('whatsapp' as NotificationChannel)
        : req.body?.preferredChannel === 'in_app'
          ? ('in_app' as NotificationChannel)
          : undefined;
    const whatsappConsent =
      req.body?.whatsappConsent !== undefined ? Boolean(req.body.whatsappConsent) : undefined;
    const locale =
      req.body?.locale === 'en' ? 'en' : req.body?.locale === 'ar' ? 'ar' : undefined;

    try {
      const verifiedRole = await resolveVerifiedRoleFromReq(
        uid,
        req.body?.role ?? req.query.role,
        res,
      );
      if (!verifiedRole) return;

      const result = await deps.engine.updateUserPreferences(uid, {
        preferredChannel,
        whatsappConsent,
        locale,
        verifiedRole,
      });

      if (result.ok === false) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }

      res.json({ ok: true, preferences: result.preferences });
    } catch (err) {
      console.error('[MEDORA][Notifications][UpdatePrefs] error:', err);
      res.status(500).json({ error: 'PREFERENCES_UPDATE_FAILED' });
    }
  });

  router.get('/notifications/in-app', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;
    try {
      const role = await resolveVerifiedRoleFromReq(uid, req.query.role, res);
      if (!role) return;
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 60));
      const data = await deps.engine.listInAppForUser(uid, role, limit);
      res.json({ ok: true, role, ...data });
    } catch (err) {
      console.error('[MEDORA][Notifications][ListInApp] error:', err);
      res.status(500).json({ error: 'IN_APP_LIST_FAILED' });
    }
  });

  router.patch('/notifications/in-app/:notificationId/read', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;
    const notificationId = String(req.params.notificationId || '').trim();
    if (!notificationId) {
      res.status(400).json({ error: 'INVALID_NOTIFICATION_ID' });
      return;
    }
    try {
      const role = await resolveVerifiedRoleFromReq(
        uid,
        req.query.role ?? req.body?.role,
        res,
      );
      if (!role) return;
      const updated = await deps.engine.markInAppRead(uid, role, notificationId);
      if (!updated) {
        res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[MEDORA][Notifications][MarkRead] error:', err);
      res.status(500).json({ error: 'IN_APP_MARK_READ_FAILED' });
    }
  });

  router.post('/notifications/in-app/read-all', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;
    try {
      const role = await resolveVerifiedRoleFromReq(
        uid,
        req.body?.role ?? req.query.role,
        res,
      );
      if (!role) return;
      const markedCount = await deps.engine.markAllInAppRead(uid, role);
      res.json({ ok: true, markedCount });
    } catch (err) {
      console.error('[MEDORA][Notifications][ReadAll] error:', err);
      res.status(500).json({ error: 'IN_APP_READ_ALL_FAILED' });
    }
  });

  router.get('/notifications/history', async (req, res) => {
    const uid = await requireAuthUid(req, res);
    if (!uid) return;
    try {
      const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 40));
      const logs = await deps.engine.listLogsForUser(uid, limit);
      res.json({ ok: true, logs });
    } catch (err) {
      console.error('[MEDORA][Notifications][History] error:', err);
      res.status(500).json({ error: 'NOTIFICATION_HISTORY_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Super Admin Notification Center Endpoints (In-App + WhatsApp Simulation)
  // ---------------------------------------------------------------------------
  router.get('/admin/notifications/overview', deps.requireSuperAdmin, async (req, res) => {
    try {
      const limit = Math.min(250, Math.max(20, Number(req.query.limit) || 120));
      const overview = await deps.engine.getAdminOverview(limit);
      res.json(overview);
    } catch (err) {
      console.error('[MEDORA][AdminNotifications][Overview] error:', err);
      res.status(500).json({ error: 'ADMIN_NOTIFICATION_OVERVIEW_FAILED' });
    }
  });

  router.patch(
    '/admin/notifications/templates/:templateId',
    deps.requireSuperAdmin,
    async (req, res) => {
      const adminCtx = (req as Request & { adminCtx?: { decoded?: { uid: string } } }).adminCtx;
      const actorUid = adminCtx?.decoded?.uid || 'super_admin';
      const templateId = String(req.params.templateId || '').trim();
      if (!templateId) {
        res.status(400).json({ error: 'INVALID_TEMPLATE_ID' });
        return;
      }

      try {
        const result = await deps.engine.updateTemplate(
          templateId,
          {
            bodyAr: typeof req.body?.bodyAr === 'string' ? req.body.bodyAr : undefined,
            bodyEn: typeof req.body?.bodyEn === 'string' ? req.body.bodyEn : undefined,
            labelAr: typeof req.body?.labelAr === 'string' ? req.body.labelAr : undefined,
            labelEn: typeof req.body?.labelEn === 'string' ? req.body.labelEn : undefined,
            enabled: req.body?.enabled !== undefined ? Boolean(req.body.enabled) : undefined,
          },
          actorUid,
        );

        if (result.ok === false) {
          res.status(result.statusCode).json({ error: result.error });
          return;
        }
        res.json({ ok: true, template: result.template });
      } catch (err) {
        console.error('[MEDORA][AdminNotifications][UpdateTemplate] error:', err);
        res.status(500).json({ error: 'TEMPLATE_UPDATE_FAILED' });
      }
    },
  );

  router.post(
    '/admin/notifications/logs/:logId/retry',
    deps.requireSuperAdmin,
    async (req, res) => {
      const adminCtx = (req as Request & { adminCtx?: { decoded?: { uid: string } } }).adminCtx;
      const actorUid = adminCtx?.decoded?.uid || 'super_admin';
      const logId = String(req.params.logId || '').trim();
      if (!logId) {
        res.status(400).json({ error: 'INVALID_LOG_ID' });
        return;
      }
      try {
        const result = await deps.engine.retryLog(logId, actorUid);
        if (result.ok === false) {
          res.status(result.statusCode).json({ error: result.error });
          return;
        }
        res.json({ ok: true, log: result.log });
      } catch (err) {
        console.error('[MEDORA][AdminNotifications][Retry] error:', err);
        res.status(500).json({ error: 'LOG_RETRY_FAILED' });
      }
    },
  );

  router.post(
    '/admin/notifications/logs/:logId/cancel',
    deps.requireSuperAdmin,
    async (req, res) => {
      const adminCtx = (req as Request & { adminCtx?: { decoded?: { uid: string } } }).adminCtx;
      const actorUid = adminCtx?.decoded?.uid || 'super_admin';
      const logId = String(req.params.logId || '').trim();
      if (!logId) {
        res.status(400).json({ error: 'INVALID_LOG_ID' });
        return;
      }
      try {
        const result = await deps.engine.cancelLog(logId, actorUid);
        if (result.ok === false) {
          res.status(result.statusCode).json({ error: result.error });
          return;
        }
        res.json({ ok: true, log: result.log });
      } catch (err) {
        console.error('[MEDORA][AdminNotifications][Cancel] error:', err);
        res.status(500).json({ error: 'LOG_CANCEL_FAILED' });
      }
    },
  );

  router.post(
    '/admin/notifications/simulate-test',
    deps.requireSuperAdmin,
    async (req, res) => {
      const adminCtx = (req as Request & { adminCtx?: { decoded?: { uid: string } } }).adminCtx;
      const actorUid = adminCtx?.decoded?.uid || 'super_admin';

      const channel =
        req.body?.channel === 'whatsapp' ? ('whatsapp' as NotificationChannel) : 'in_app';
      const eventTypeRaw = String(req.body?.eventType || 'appointment_updated');
      const eventType: NotificationEventType = ALL_NOTIFICATION_EVENTS.includes(
        eventTypeRaw as NotificationEventType,
      )
        ? (eventTypeRaw as NotificationEventType)
        : 'appointment_updated';
      const recipientRole = normalizeRoleHint(req.body?.recipientRole) || 'super_admin';
      const recipientUid = String(req.body?.recipientUid || actorUid).trim();
      const phone = String(req.body?.phone || '').trim();
      const locale = req.body?.locale === 'en' ? 'en' : 'ar';
      const simulateFailure = Boolean(req.body?.simulateFailure);

      try {
        const result = await deps.engine.dispatch({
          eventType,
          recipientUid,
          recipientRole,
          title:
            locale === 'en'
              ? `MEDORA Test Alert (${eventType})`
              : `تنبيه اختباري من MEDORA (${eventType})`,
          body:
            locale === 'en'
              ? 'Safe two-channel verification alert with zero clinical data.'
              : 'تنبيه اختباري آمن عبر قناة الإشعارات المختارة دون أي بيانات طبية.',
          locale,
          explicitChannelOverride: channel,
          ...(phone ? { explicitPhoneOverride: phone } : {}),
          relatedId: `SIM-${Date.now().toString(36).toUpperCase()}`,
          relatedType: 'admin_simulation',
          placeholders: {
            refCode: `TEST-${Date.now().toString(36).slice(-5).toUpperCase()}`,
            statusLabel: locale === 'en' ? 'Simulated' : 'محاكاة آمنة',
            dateLabel: new Date().toISOString().slice(0, 10),
          },
          simulateFailure,
        });

        if (!result.ok && !result.log) {
          res.status(result.error === 'DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN' || result.error === 'IMAGING_PORTAL_DISABLED' ? 403 : 400).json({
            ok: false,
            error: result.error || 'SIMULATION_FAILED',
          });
          return;
        }
        res.status(201).json({
          ok: result.ok,
          channelUsed: result.channelUsed,
          log: result.log,
          error: result.error,
        });
      } catch (err) {
        console.error('[MEDORA][AdminNotifications][Simulate] error:', err);
        res.status(500).json({ error: 'SIMULATION_ERROR' });
      }
    },
  );

  // Sandboxed Future-Contract Flow Runner (Pharmacy Eligibility + Wholesaler)
  router.post(
    '/admin/notifications/simulate-contract-flow',
    deps.requireSuperAdmin,
    async (req, res) => {
      const requestedFlow = req.body?.flowType || req.body?.scenario;
      const flowType =
        requestedFlow === 'wholesaler_cycle' ? 'wholesaler_cycle' : 'pharmacy_eligibility';
      const locale = req.body?.locale === 'en' ? 'en' : 'ar';
      const phone = String(req.body?.phone || '+9647701234567').trim();
      const simChannel: NotificationChannel =
        req.body?.channel === 'whatsapp' ? 'whatsapp' : 'in_app';
      const tag = Date.now().toString(36).toUpperCase();

      try {
        if (flowType === 'pharmacy_eligibility') {
          const pharmacyRes = await deps.engine.dispatch({
            eventType: 'pharmacy_stock_updated',
            recipientUid: `sim_pharm_${tag}`,
            recipientRole: 'pharmacy',
            title: locale === 'en' ? 'Pharmacy Inventory Updated' : 'تحديث توفر مخزون الصيدلية',
            body:
              locale === 'en'
                ? 'Simulation: Item MED-SIM01 marked available.'
                : 'محاكاة: تم تحديث الصنف المرجعي MED-SIM01 إلى متوفر.',
            locale,
            explicitChannelOverride: simChannel,
            ...(simChannel === 'whatsapp' ? { explicitPhoneOverride: phone } : {}),
            relatedId: `SIM_INV_${tag}`,
            relatedType: 'pharmacy_inventory',
            placeholders: { refCode: `MED-${tag.slice(-4)}`, statusLabel: locale === 'en' ? 'Available' : 'متوفر' },
          });

          const patientRes = await deps.engine.dispatch({
            eventType: 'medicine_available',
            recipientUid: `sim_pat_${tag}`,
            recipientRole: 'patient',
            title:
              locale === 'en'
                ? 'Requested Medicine Available at Pharmacy'
                : 'توفّر الدواء المطلوب في الصيدلية',
            body:
              locale === 'en'
                ? 'Matched eligible patient request only (doctors strictly excluded).'
                : 'تم التطابق مع طلب مريض مؤهل فقط (الأطباء مستثنون تماماً).',
            locale,
            explicitChannelOverride: simChannel,
            ...(simChannel === 'whatsapp' ? { explicitPhoneOverride: phone } : {}),
            relatedId: `SIM_REQ_${tag}`,
            relatedType: 'medicine_availability',
            placeholders: { refCode: `REQ-${tag.slice(-4)}`, statusLabel: locale === 'en' ? 'Available' : 'متوفر' },
          });

          const doctorBlockCheck = await deps.engine.dispatch({
            eventType: 'medicine_available',
            recipientUid: `sim_doc_${tag}`,
            recipientRole: 'doctor',
            title: 'Blocked Guard Check',
            body: 'Must never reach doctor',
          });

          res.status(201).json({
            ok: true,
            flowType,
            steps: [
              { step: 'pharmacy_stock_updated', ok: pharmacyRes.ok, log: pharmacyRes.log },
              { step: 'eligible_patient_notified', ok: patientRes.ok, log: patientRes.log },
              {
                step: 'doctor_commercial_stock_blocked',
                ok: !doctorBlockCheck.ok,
                error: doctorBlockCheck.error,
              },
            ],
          });
          return;
        }

        const subRes = await deps.engine.dispatch({
          eventType: 'wholesaler_request_submitted',
          recipientUid: `sim_wh_${tag}`,
          recipientRole: 'wholesaler',
          title: locale === 'en' ? 'Wholesaler Request Received' : 'استلام طلب مذخر جديد من صيدلية',
          body:
            locale === 'en'
              ? 'Simulation: Pharmacy request WH-SIM submitted to Wholesaler.'
              : 'محاكاة: تم توجيه طلب الصيدلية المرجعي إلى المذخر المعني.',
          locale,
          explicitChannelOverride: simChannel,
          ...(simChannel === 'whatsapp' ? { explicitPhoneOverride: phone } : {}),
          relatedId: `SIM_WH_${tag}`,
          relatedType: 'wholesaler_request',
          placeholders: { refCode: `WH-${tag.slice(-4)}`, statusLabel: locale === 'en' ? 'Submitted' : 'مرسل' },
        });

        const offerRes = await deps.engine.dispatch({
          eventType: 'wholesaler_medicine_available',
          recipientUid: `sim_pharm_${tag}`,
          recipientRole: 'pharmacy',
          title: locale === 'en' ? 'Wholesaler Medicine Available' : 'توفّر الصنف لدى المذخر',
          body:
            locale === 'en'
              ? 'Simulation: Wholesaler confirmed stock offer back to requesting pharmacy only.'
              : 'محاكاة: أكد المذخر توفر الكمية وأُرسل الإشعار للصيدلية الطالبة حصراً.',
          locale,
          explicitChannelOverride: simChannel,
          ...(simChannel === 'whatsapp' ? { explicitPhoneOverride: phone } : {}),
          relatedId: `SIM_OFF_${tag}`,
          relatedType: 'wholesaler_offer',
          placeholders: { refCode: `WH-${tag.slice(-4)}`, statusLabel: locale === 'en' ? 'Offered' : 'متوفر' },
        });

        res.status(201).json({
          ok: true,
          flowType,
          steps: [
            { step: 'wholesaler_request_submitted', ok: subRes.ok, log: subRes.log },
            { step: 'wholesaler_medicine_available', ok: offerRes.ok, log: offerRes.log },
          ],
        });
      } catch (err) {
        console.error('[MEDORA][AdminNotifications][ContractSim] error:', err);
        res.status(500).json({ error: 'CONTRACT_SIMULATION_FAILED' });
      }
    },
  );

  // Explicit guard: real external WhatsApp sending remains strictly disabled in this phase
  router.patch('/admin/notifications/config', deps.requireSuperAdmin, async (req, res) => {
    if (req.body?.whatsappApiConnected === true || req.body?.whatsappMode === 'live') {
      res.status(403).json({
        error: 'WHATSAPP_LIVE_API_LOCKED_IN_THIS_PHASE',
      });
      return;
    }
    const config = await deps.engine.getSystemConfig();
    res.json({ ok: true, config });
  });

  return router;
}

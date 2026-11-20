import type { Firestore } from 'firebase-admin/firestore';
import type {
  NotificationEventType,
  PatientMedicineWatchRecord,
  PatientMedicineWatchSource,
  PharmacyInventoryItemContract,
  PharmacyInventoryStatus,
  WholesalerMedicineRequestRecord,
  WholesalerOfferRecord,
  WholesalerOrderStatus,
} from '../src/types/notifications.ts';
import type {
  DispatchNotificationResult,
  NotificationEngine,
} from './notificationEngine.ts';

function safeContractId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function isSafeContractId(val: unknown): val is string {
  return typeof val === 'string' && /^[a-zA-Z0-9_-]{2,128}$/.test(val.trim());
}

/**
 * Registers an eligible patient watch (medicine request, favorite, or availability reminder)
 * scoped strictly to a specific (patientUid, pharmacyUid, medicineId).
 */
export async function registerPatientMedicineWatch(
  db: Firestore,
  input: {
    patientUid: string;
    pharmacyUid: string;
    pharmacyName: string;
    medicineId: string;
    medicineRefCode?: string;
    medicineDisplayName?: string;
    source: PatientMedicineWatchSource;
  },
): Promise<PatientMedicineWatchRecord> {
  if (
    !isSafeContractId(input.patientUid) ||
    !isSafeContractId(input.pharmacyUid) ||
    !isSafeContractId(input.medicineId) ||
    input.patientUid.trim() === input.pharmacyUid.trim()
  ) {
    throw new Error('INVALID_MEDICINE_WATCH_PARTIES');
  }

  const nowIso = new Date().toISOString();
  const watchId = `${input.source}_${input.patientUid}_${input.pharmacyUid}_${input.medicineId}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
  const record: PatientMedicineWatchRecord = {
    watchId,
    patientUid: input.patientUid,
    pharmacyUid: input.pharmacyUid,
    pharmacyName: input.pharmacyName,
    medicineId: input.medicineId,
    medicineRefCode:
      input.medicineRefCode || `MED-${input.medicineId.slice(0, 8).toUpperCase()}`,
    ...(input.medicineDisplayName
      ? { medicineDisplayName: input.medicineDisplayName }
      : {}),
    source: input.source,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const col =
    input.source === 'medicine_request'
      ? 'patient_medicine_requests'
      : input.source === 'medicine_favorite'
        ? 'patient_medicine_favorites'
        : 'patient_medicine_reminders';

  await db.doc(`${col}/${watchId}`).set(record, { merge: true });
  return record;
}

/**
 * Future-ready Contract: Patient submits a medicine availability request to a specific Pharmacy.
 * - Verifies patient, pharmacy, and medicine identities (never targeting a doctor account).
 * - Registers the patient's watch via `registerPatientMedicineWatch` (preserving availability follow-up).
 * - Dispatches `pharmacy_medicine_request_received` strictly to the concerned `pharmacyUid`
 *   using idempotency protection so duplicate notifications are blocked.
 * - Does NOT create a live Pharmacy Portal or notify doctors.
 */
export async function submitPatientMedicineRequestToPharmacy(
  db: Firestore,
  engine: NotificationEngine,
  input: {
    patientUid: string;
    pharmacyUid: string;
    pharmacyName: string;
    medicineId: string;
    medicineRefCode?: string;
    medicineDisplayName?: string;
    requestBatchKey?: string;
  },
): Promise<{
  watch: PatientMedicineWatchRecord;
  pharmacyDispatch: DispatchNotificationResult;
}> {
  const patientUid = String(input.patientUid || '').trim();
  const pharmacyUid = String(input.pharmacyUid || '').trim();
  const medicineId = String(input.medicineId || '').trim();
  const pharmacyName = String(input.pharmacyName || '').trim();

  if (
    !isSafeContractId(patientUid) ||
    !isSafeContractId(pharmacyUid) ||
    !isSafeContractId(medicineId) ||
    !pharmacyName ||
    patientUid === pharmacyUid
  ) {
    throw new Error('INVALID_MEDICINE_REQUEST_PARTIES');
  }

  const [patUserSnap, patProfileSnap, pharmUserSnap, pharmProfileSnap, pharmDoctorSnap] =
    await Promise.all([
      db.doc(`users/${patientUid}`).get(),
      db.doc(`patient_profiles/${patientUid}`).get(),
      db.doc(`users/${pharmacyUid}`).get(),
      db.doc(`pharmacy_profiles/${pharmacyUid}`).get(),
      db.doc(`doctor_profiles/${pharmacyUid}`).get(),
    ]);

  if (!patUserSnap.exists && !patProfileSnap.exists) {
    throw new Error('PATIENT_IDENTITY_NOT_FOUND');
  }
  if (
    pharmDoctorSnap.exists ||
    (pharmUserSnap.exists && String(pharmUserSnap.data()?.selectedPortal || '') === 'doctor')
  ) {
    throw new Error('DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN');
  }
  if (!pharmProfileSnap.exists && !pharmUserSnap.exists) {
    throw new Error('PHARMACY_IDENTITY_NOT_FOUND');
  }
  if (
    pharmUserSnap.exists &&
    !pharmProfileSnap.exists &&
    String(pharmUserSnap.data()?.selectedPortal || '') !== 'pharmacy'
  ) {
    throw new Error('PHARMACY_ROLE_REQUIRED');
  }

  const watch = await registerPatientMedicineWatch(db, {
    patientUid,
    pharmacyUid,
    pharmacyName,
    medicineId,
    medicineRefCode: input.medicineRefCode,
    medicineDisplayName: input.medicineDisplayName,
    source: 'medicine_request',
  });

  const nowIso = new Date().toISOString();
  const idempScope = input.requestBatchKey
    ? `:${String(input.requestBatchKey).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`
    : '';

  const pharmacyDispatch = await engine.dispatch({
    eventType: 'pharmacy_medicine_request_received',
    recipientUid: pharmacyUid,
    recipientRole: 'pharmacy',
    title: `طلب دواء جديد في ${pharmacyName} (${watch.medicineRefCode})`,
    body: `تم تسجيل طلب متابعة توفر الصنف المرجعي (${watch.medicineRefCode}) لدى ${pharmacyName}.`,
    inAppType: 'pharmacy_medicine_request_received',
    relatedId: watch.watchId,
    relatedType: 'pharmacy_medicine_request',
    idempotencyKey: `pharm_req:${watch.watchId}${idempScope}`,
    placeholders: {
      refCode: watch.medicineRefCode,
      statusLabel: 'طلب وارد',
      dateLabel: nowIso.slice(0, 10),
    },
  });

  return { watch, pharmacyDispatch };
}

/**
 * Future-ready contract for Pharmacy Stock Update + Strict Eligible-Patient Notification.
 *
 * Rules enforced:
 * 1. Pharmacy inventory update dispatches `pharmacy_stock_updated` or
 *    `pharmacy_medicine_unavailable` strictly to `pharmacyUid` (`pharmacy`).
 * 2. When `status === 'available'`, evaluates ONLY patients who explicitly:
 *      - requested that medicine at that pharmacy (`patient_medicine_requests`) -> `medicine_available`
 *      - favorited that medicine at that pharmacy (`patient_medicine_favorites`) -> `medicine_favorite_available`
 *      - set an availability reminder at that pharmacy (`patient_medicine_reminders`) -> `medicine_availability_reminder`
 * 3. NEVER notifies doctors (`doctor`) or unrelated patients.
 * 4. WhatsApp templates remain completely neutral (zero medicine names).
 */
export async function handlePharmacyStockUpdateAndNotify(
  db: Firestore,
  engine: NotificationEngine,
  input: {
    pharmacyUid: string;
    pharmacyName: string;
    medicineId: string;
    medicineRefCode?: string;
    medicineDisplayName?: string;
    status: PharmacyInventoryStatus;
    quantityAvailable: number;
    simulationTag?: string;
  },
): Promise<{
  inventory: PharmacyInventoryItemContract;
  pharmacyDispatch: DispatchNotificationResult;
  eligiblePatientsMatched: number;
  patientDispatches: DispatchNotificationResult[];
}> {
  const nowIso = new Date().toISOString();
  const inventoryId = `${input.pharmacyUid}_${input.medicineId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const medicineRefCode =
    input.medicineRefCode || `MED-${input.medicineId.slice(0, 8).toUpperCase()}`;

  const inventory: PharmacyInventoryItemContract = {
    inventoryId,
    pharmacyUid: input.pharmacyUid,
    pharmacyName: input.pharmacyName,
    medicineId: input.medicineId,
    medicineRefCode,
    status: input.status,
    quantityAvailable: Math.max(0, Number(input.quantityAvailable || 0)),
    updatedAt: nowIso,
  };

  await db.doc(`pharmacy_inventory/${inventoryId}`).set(inventory, { merge: true });

  const pharmacyEvent: NotificationEventType =
    input.status === 'unavailable' ? 'pharmacy_medicine_unavailable' : 'pharmacy_stock_updated';

  const pharmacyDispatch = await engine.dispatch({
    eventType: pharmacyEvent,
    recipientUid: input.pharmacyUid,
    recipientRole: 'pharmacy',
    title:
      input.status === 'unavailable'
        ? `تنبيه مخزون الصيدلية: صنف غير متوفر (${medicineRefCode})`
        : `تحديث مخزون الصيدلية (${medicineRefCode})`,
    body:
      input.status === 'unavailable'
        ? `تم تحديث حالة الصنف ${medicineRefCode} في ${input.pharmacyName} إلى غير متوفر.`
        : `تم تحديث توفر الصنف ${medicineRefCode} في ${input.pharmacyName} (الكمية: ${inventory.quantityAvailable}).`,
    inAppType: pharmacyEvent,
    relatedId: inventoryId,
    relatedType: 'pharmacy_inventory',
    idempotencyKey: `pharm_stock:${inventoryId}:${input.status}:${input.simulationTag || nowIso.slice(0, 16)}`,
    placeholders: {
      refCode: medicineRefCode,
      statusLabel:
        input.status === 'available'
          ? 'متوفر'
          : input.status === 'low_stock'
            ? 'مخزون منخفض'
            : 'غير متوفر',
      dateLabel: nowIso.slice(0, 10),
    },
  });

  const patientDispatches: DispatchNotificationResult[] = [];
  if (input.status !== 'available' || inventory.quantityAvailable <= 0) {
    return {
      inventory,
      pharmacyDispatch,
      eligiblePatientsMatched: 0,
      patientDispatches,
    };
  }

  // Evaluate strictly eligible patients across requests, favorites, and availability reminders
  const [reqSnap, favSnap, remSnap] = await Promise.all([
    db
      .collection('patient_medicine_requests')
      .where('pharmacyUid', '==', input.pharmacyUid)
      .where('medicineId', '==', input.medicineId)
      .limit(100)
      .get(),
    db
      .collection('patient_medicine_favorites')
      .where('pharmacyUid', '==', input.pharmacyUid)
      .where('medicineId', '==', input.medicineId)
      .limit(100)
      .get(),
    db
      .collection('patient_medicine_reminders')
      .where('pharmacyUid', '==', input.pharmacyUid)
      .where('medicineId', '==', input.medicineId)
      .limit(100)
      .get(),
  ]);

  const seenPatientEvent = new Set<string>();
  const candidates: Array<{
    patientUid: string;
    eventType: NotificationEventType;
    watchId: string;
    title: string;
    body: string;
  }> = [];

  reqSnap.docs.forEach((d) => {
    const rec = d.data() as Partial<PatientMedicineWatchRecord>;
    if (rec.active === false || !rec.patientUid) return;
    candidates.push({
      patientUid: String(rec.patientUid),
      eventType: 'medicine_available',
      watchId: String(rec.watchId || d.id),
      title: `توفّر الدواء المطلوب في ${input.pharmacyName}`,
      body: `الطلب المرجعي (${medicineRefCode}) أصبح متوفراً الآن في ${input.pharmacyName}. يرجى مراجعة المنصة.`,
    });
  });

  favSnap.docs.forEach((d) => {
    const rec = d.data() as Partial<PatientMedicineWatchRecord>;
    if (rec.active === false || !rec.patientUid) return;
    candidates.push({
      patientUid: String(rec.patientUid),
      eventType: 'medicine_favorite_available',
      watchId: String(rec.watchId || d.id),
      title: `توفّر صنف من مفضلتك في ${input.pharmacyName}`,
      body: `الصنف المفضل (${medicineRefCode}) أصبح متاحاً الآن لدى ${input.pharmacyName}.`,
    });
  });

  remSnap.docs.forEach((d) => {
    const rec = d.data() as Partial<PatientMedicineWatchRecord>;
    if (rec.active === false || !rec.patientUid) return;
    candidates.push({
      patientUid: String(rec.patientUid),
      eventType: 'medicine_availability_reminder',
      watchId: String(rec.watchId || d.id),
      title: `تذكير توفّر الدواء — ${input.pharmacyName}`,
      body: `حسب تذكيرك المفعّل، الصنف المرجعي (${medicineRefCode}) متوفر الآن في ${input.pharmacyName}.`,
    });
  });

  for (const item of candidates) {
    // At most one availability alert per patient per stock batch
    if (seenPatientEvent.has(item.patientUid)) continue;
    seenPatientEvent.add(item.patientUid);

    const res = await engine.dispatch({
      eventType: item.eventType,
      recipientUid: item.patientUid,
      recipientRole: 'patient',
      title: item.title,
      body: item.body,
      inAppType: 'announcement',
      iconCategory:
        item.eventType === 'medicine_availability_reminder' ? 'medicine' : 'medicine_available',
      relatedId: item.watchId,
      relatedType: 'medicine_availability',
      idempotencyKey: `avail:${item.patientUid}:${inventoryId}:${input.simulationTag || nowIso.slice(0, 16)}`,
      placeholders: {
        refCode: medicineRefCode,
        statusLabel: 'متوفر',
        dateLabel: nowIso.slice(0, 10),
      },
    });
    patientDispatches.push(res);
  }

  return {
    inventory,
    pharmacyDispatch,
    eligiblePatientsMatched: candidates.length,
    patientDispatches,
  };
}

/**
 * Future-ready Wholesaler (المذخر) Contract 1:
 * Pharmacy submits a medicine replenishment request to a Wholesaler.
 * Notifies BOTH the concerned pharmacy (confirmation) and the target wholesaler.
 */
export async function submitPharmacyRequestToWholesaler(
  db: Firestore,
  engine: NotificationEngine,
  input: {
    pharmacyUid: string;
    pharmacyName: string;
    wholesalerUid: string;
    wholesalerName: string;
    medicineId: string;
    medicineRefCode?: string;
    requestedQuantity: number;
    notes?: string;
  },
): Promise<{
  request: WholesalerMedicineRequestRecord;
  pharmacyDispatch: DispatchNotificationResult;
  wholesalerDispatch: DispatchNotificationResult;
}> {
  const nowIso = new Date().toISOString();
  const requestId = safeContractId('whreq');
  const requestCode = `WH-${requestId.slice(-6).toUpperCase()}`;
  const medicineRefCode =
    input.medicineRefCode || `MED-${input.medicineId.slice(0, 8).toUpperCase()}`;

  const request: WholesalerMedicineRequestRecord = {
    requestId,
    requestCode,
    pharmacyUid: input.pharmacyUid,
    pharmacyName: input.pharmacyName,
    wholesalerUid: input.wholesalerUid,
    wholesalerName: input.wholesalerName,
    medicineId: input.medicineId,
    medicineRefCode,
    requestedQuantity: Math.max(1, Number(input.requestedQuantity || 1)),
    status: 'submitted',
    ...(input.notes ? { notes: input.notes } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await db.doc(`pharmacy_wholesaler_requests/${requestId}`).set(request);

  const pharmacyDispatch = await engine.dispatch({
    eventType: 'wholesaler_request_submitted',
    recipientUid: input.pharmacyUid,
    recipientRole: 'pharmacy',
    title: `تم إرسال طلب توفير إلى ${input.wholesalerName}`,
    body: `طلب المذخر ${requestCode} للمرجع (${medicineRefCode}) بالكمية ${request.requestedQuantity}.`,
    inAppType: 'wholesaler_request_submitted',
    relatedId: requestId,
    relatedType: 'wholesaler_request',
    idempotencyKey: `wh_sub_pharm:${requestId}`,
    placeholders: {
      refCode: requestCode,
      statusLabel: 'تم الإرسال',
      dateLabel: nowIso.slice(0, 10),
    },
  });

  const wholesalerDispatch = await engine.dispatch({
    eventType: 'wholesaler_request_submitted',
    recipientUid: input.wholesalerUid,
    recipientRole: 'wholesaler',
    title: `طلب توريد جديد من ${input.pharmacyName}`,
    body: `المرجع ${requestCode} · الصنف ${medicineRefCode} · الكمية المطلوبة: ${request.requestedQuantity}.`,
    inAppType: 'wholesaler_request_submitted',
    relatedId: requestId,
    relatedType: 'wholesaler_request',
    idempotencyKey: `wh_sub_depot:${requestId}`,
    placeholders: {
      refCode: requestCode,
      statusLabel: 'طلب وارد',
      dateLabel: nowIso.slice(0, 10),
    },
  });

  return { request, pharmacyDispatch, wholesalerDispatch };
}

/**
 * Future-ready Wholesaler (المذخر) Contract 2:
 * Wholesaler records available medicine & quantity linked to a pharmacy request,
 * and dispatches `wholesaler_medicine_available` strictly to the requesting pharmacy.
 */
export async function recordWholesalerInventoryOffer(
  db: Firestore,
  engine: NotificationEngine,
  input: {
    pharmacyRequestId: string;
    wholesalerUid: string;
    wholesalerName: string;
    availableQuantity: number;
    unitPriceIqd?: number;
  },
): Promise<{
  offer: WholesalerOfferRecord;
  request: WholesalerMedicineRequestRecord;
  pharmacyDispatch: DispatchNotificationResult;
}> {
  const reqRef = db.doc(`pharmacy_wholesaler_requests/${input.pharmacyRequestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new Error('WHOLESALER_REQUEST_NOT_FOUND');
  }
  const request = reqSnap.data() as WholesalerMedicineRequestRecord;
  if (request.wholesalerUid !== input.wholesalerUid) {
    throw new Error('FORBIDDEN_WHOLESALER_REQUEST');
  }

  const nowIso = new Date().toISOString();
  const offerId = safeContractId('whoff');
  const qty = Math.max(0, Number(input.availableQuantity || 0));
  const offerStatus = qty > 0 ? 'available' : 'unavailable';

  const offer: WholesalerOfferRecord = {
    offerId,
    pharmacyRequestId: request.requestId,
    wholesalerUid: input.wholesalerUid,
    wholesalerName: input.wholesalerName,
    pharmacyUid: request.pharmacyUid,
    medicineId: request.medicineId,
    medicineRefCode: request.medicineRefCode,
    availableQuantity: qty,
    ...(typeof input.unitPriceIqd === 'number' ? { unitPriceIqd: input.unitPriceIqd } : {}),
    status: offerStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextReqStatus: WholesalerOrderStatus = qty > 0 ? 'offered' : 'unavailable';
  const updatedRequest: WholesalerMedicineRequestRecord = {
    ...request,
    status: nextReqStatus,
    linkedOfferId: offerId,
    updatedAt: nowIso,
  };

  const batch = db.batch();
  batch.set(db.doc(`wholesaler_offers/${offerId}`), offer);
  batch.update(reqRef, {
    status: nextReqStatus,
    linkedOfferId: offerId,
    updatedAt: nowIso,
  });
  await batch.commit();

  const eventType: NotificationEventType =
    qty > 0 ? 'wholesaler_medicine_available' : 'wholesaler_order_status_updated';

  // Notify ONLY the requesting pharmacy
  const pharmacyDispatch = await engine.dispatch({
    eventType,
    recipientUid: request.pharmacyUid,
    recipientRole: 'pharmacy',
    title:
      qty > 0
        ? `توفّر الصنف لدى ${input.wholesalerName} (${request.requestCode})`
        : `تحديث من ${input.wholesalerName}: الصنف غير متوفر (${request.requestCode})`,
    body:
      qty > 0
        ? `أكد المذخر توفر المرجع ${request.medicineRefCode} بكمية متاحة (${qty}) لطلبكم ${request.requestCode}.`
        : `أفاد المذخر بعدم توفر الكمية المطلوبة حالياً للطلب ${request.requestCode}.`,
    inAppType: eventType,
    relatedId: offerId,
    relatedType: 'wholesaler_offer',
    idempotencyKey: `wh_offer:${offerId}`,
    placeholders: {
      refCode: request.requestCode,
      statusLabel: qty > 0 ? `متوفر (${qty})` : 'غير متوفر',
      dateLabel: nowIso.slice(0, 10),
    },
  });

  return { offer, request: updatedRequest, pharmacyDispatch };
}

/**
 * Future-ready Wholesaler (المذخر) Contract 3:
 * Updates wholesaler order fulfillment status and notifies ONLY the concerned pharmacy.
 */
export async function updateWholesalerOrderStatus(
  db: Firestore,
  engine: NotificationEngine,
  input: {
    pharmacyRequestId: string;
    wholesalerUid: string;
    status: WholesalerOrderStatus;
    note?: string;
  },
): Promise<{
  request: WholesalerMedicineRequestRecord;
  pharmacyDispatch: DispatchNotificationResult;
}> {
  const reqRef = db.doc(`pharmacy_wholesaler_requests/${input.pharmacyRequestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists) {
    throw new Error('WHOLESALER_REQUEST_NOT_FOUND');
  }
  const prev = reqSnap.data() as WholesalerMedicineRequestRecord;
  if (prev.wholesalerUid !== input.wholesalerUid) {
    throw new Error('FORBIDDEN_WHOLESALER_REQUEST');
  }

  const nowIso = new Date().toISOString();
  const updatedRequest: WholesalerMedicineRequestRecord = {
    ...prev,
    status: input.status,
    updatedAt: nowIso,
  };

  await reqRef.update({
    status: input.status,
    ...(input.note ? { notes: input.note } : {}),
    updatedAt: nowIso,
  });

  const pharmacyDispatch = await engine.dispatch({
    eventType: 'wholesaler_order_status_updated',
    recipientUid: prev.pharmacyUid,
    recipientRole: 'pharmacy',
    title: `تحديث حالة طلب المذخر (${prev.requestCode})`,
    body: `تم تحديث حالة الطلب ${prev.requestCode} لدى ${prev.wholesalerName} إلى: ${input.status}${input.note ? ` · ${input.note}` : ''}`,
    inAppType: 'wholesaler_order_status_updated',
    relatedId: prev.requestId,
    relatedType: 'wholesaler_request',
    idempotencyKey: `wh_status:${prev.requestId}:${input.status}`,
    placeholders: {
      refCode: prev.requestCode,
      statusLabel: input.status,
      dateLabel: nowIso.slice(0, 10),
    },
  });

  return { request: updatedRequest, pharmacyDispatch };
}

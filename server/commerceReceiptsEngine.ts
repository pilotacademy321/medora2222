import crypto from 'node:crypto';
import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type {
  MedoraFulfillmentType,
  MedoraPaymentMethod,
  MedoraPaymentStatus,
  MedoraReceiptEvent,
  MedoraReceiptItem,
  MedoraReceiptRecord,
  MedoraTransactionType,
} from '../src/types/commerce.ts';

export function getBaghdadDateCompact(): string {
  const now = new Date();
  const baghdadMs = now.getTime() + 3 * 60 * 60 * 1000;
  const d = new Date(baghdadMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export function safeCommerceId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

export interface IssueReceiptParams {
  transactionType: MedoraTransactionType;
  orderId: string;
  orderNumber: string;
  sellerUid: string;
  sellerRole: 'wholesaler' | 'pharmacy';
  sellerName: string;
  sellerInstitutionId?: string;
  sellerGovernorate?: string;
  sellerAddress?: string;
  sellerPhone?: string;
  buyerUid: string;
  buyerRole: 'pharmacy' | 'doctor' | 'patient';
  buyerName: string;
  buyerInstitutionId?: string;
  buyerGovernorate?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  items: MedoraReceiptItem[];
  subtotalAmountIqd: number;
  discountAmountIqd: number;
  deliveryFeeIqd: number;
  totalAmountIqd: number;
  paidAmountIqd: number;
  balanceDueIqd: number;
  paymentMethod: MedoraPaymentMethod;
  paymentStatus: MedoraPaymentStatus;
  fulfillmentType: MedoraFulfillmentType;
  notes?: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  completedAtIso?: string;
}

export interface PreReadReceiptTxState {
  dateCompact: string;
  rcptRef: FirebaseFirestore.DocumentReference;
  rcptSnap: DocumentSnapshot;
  counterRef: FirebaseFirestore.DocumentReference;
  counterSnap: DocumentSnapshot;
}

/**
 * Call during the READ phase of a Firestore transaction before any tx.set / tx.update.
 */
export async function preReadReceiptStateInTx(
  db: Firestore,
  tx: Transaction,
  orderId: string,
): Promise<PreReadReceiptTxState> {
  const dateCompact = getBaghdadDateCompact();
  const rcptRef = db.doc(`medora_receipts/rcpt_${orderId}`);
  const counterRef = db.doc(`medora_counters/receipts_${dateCompact}`);
  const [rcptSnap, counterSnap] = await Promise.all([tx.get(rcptRef), tx.get(counterRef)]);
  return {
    dateCompact,
    rcptRef,
    rcptSnap,
    counterRef,
    counterSnap,
  };
}

/**
 * Idempotently emits the unified 3-party receipt (`medora_receipts/rcpt_${orderId}`)
 * ONLY upon transaction completion. Uses deterministic document ID and counter lock.
 */
export async function issueUnifiedReceiptOnCompletion(
  db: Firestore,
  tx: Transaction,
  params: IssueReceiptParams,
  preRead?: PreReadReceiptTxState,
): Promise<{ receipt: MedoraReceiptRecord; alreadyExisted: boolean }> {
  const state = preRead || (await preReadReceiptStateInTx(db, tx, params.orderId));

  if (state.rcptSnap.exists) {
    return {
      receipt: state.rcptSnap.data() as MedoraReceiptRecord,
      alreadyExisted: true,
    };
  }

  const prevSeq = state.counterSnap.exists ? Number(state.counterSnap.data()?.seq || 0) : 0;
  const nextSeq = prevSeq + 1;
  const receiptNumber = `MDR-RCPT-${state.dateCompact}-${String(nextSeq).padStart(4, '0')}`;
  const nowIso = params.completedAtIso || new Date().toISOString();
  const receiptId = `rcpt_${params.orderId}`;

  const receiptDoc: MedoraReceiptRecord = {
    receiptId,
    receiptNumber,
    transactionType: params.transactionType,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    sellerUid: params.sellerUid,
    sellerRole: params.sellerRole,
    sellerName: params.sellerName,
    ...(params.sellerInstitutionId ? { sellerInstitutionId: params.sellerInstitutionId } : {}),
    ...(params.sellerGovernorate ? { sellerGovernorate: params.sellerGovernorate } : {}),
    ...(params.sellerAddress ? { sellerAddress: params.sellerAddress } : {}),
    ...(params.sellerPhone ? { sellerPhone: params.sellerPhone } : {}),
    buyerUid: params.buyerUid,
    buyerRole: params.buyerRole,
    buyerName: params.buyerName,
    ...(params.buyerInstitutionId ? { buyerInstitutionId: params.buyerInstitutionId } : {}),
    ...(params.buyerGovernorate ? { buyerGovernorate: params.buyerGovernorate } : {}),
    ...(params.buyerAddress ? { buyerAddress: params.buyerAddress } : {}),
    ...(params.buyerPhone ? { buyerPhone: params.buyerPhone } : {}),
    items: params.items,
    subtotalAmountIqd: Math.max(0, Math.round(params.subtotalAmountIqd || 0)),
    discountAmountIqd: Math.max(0, Math.round(params.discountAmountIqd || 0)),
    deliveryFeeIqd: Math.max(0, Math.round(params.deliveryFeeIqd || 0)),
    totalAmountIqd: Math.max(0, Math.round(params.totalAmountIqd || 0)),
    paidAmountIqd: Math.max(0, Math.round(params.paidAmountIqd || 0)),
    balanceDueIqd: Math.max(0, Math.round(params.balanceDueIqd || 0)),
    paymentMethod: params.paymentMethod,
    paymentStatus: params.paymentStatus,
    fulfillmentType: params.fulfillmentType,
    status: 'active',
    reprintCount: 0,
    ...(params.notes ? { notes: params.notes } : {}),
    auditHistory: [
      {
        action: 'issued',
        actorUid: params.actorUid,
        actorName: params.actorName,
        actorRole: params.actorRole,
        at: nowIso,
      },
    ],
    issuedAt: nowIso,
    completedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  tx.set(
    state.counterRef,
    {
      counterId: `receipts_${state.dateCompact}`,
      dateCompact: state.dateCompact,
      seq: nextSeq,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  tx.set(state.rcptRef, receiptDoc);

  const eventId = safeCommerceId('rcptev');
  const eventDoc: MedoraReceiptEvent = {
    eventId,
    receiptId,
    receiptNumber,
    orderId: params.orderId,
    sellerUid: params.sellerUid,
    buyerUid: params.buyerUid,
    eventType: 'issued',
    actorUid: params.actorUid,
    actorName: params.actorName,
    actorRole: params.actorRole,
    createdAt: nowIso,
  };
  tx.set(db.doc(`medora_receipt_events/${eventId}`), eventDoc);

  return { receipt: receiptDoc, alreadyExisted: false };
}

export async function logOperationalError(
  db: Firestore | null,
  params: {
    scope: string;
    code: string;
    message: string;
    actorUid?: string;
    actorRole?: string;
    relatedOrderId?: string;
    severity?: 'warning' | 'error' | 'critical';
  },
): Promise<void> {
  if (!db) return;
  try {
    const errorId = safeCommerceId('operr');
    await db.doc(`medora_operational_errors/${errorId}`).set({
      errorId,
      scope: String(params.scope || 'system').slice(0, 80),
      code: String(params.code || 'INTERNAL_ERROR').slice(0, 80),
      message: String(params.message || '').slice(0, 500),
      ...(params.actorUid ? { actorUid: params.actorUid } : {}),
      ...(params.actorRole ? { actorRole: params.actorRole } : {}),
      ...(params.relatedOrderId ? { relatedOrderId: params.relatedOrderId } : {}),
      severity: params.severity || 'error',
      resolved: false,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Operational logger must never mask primary response errors
  }
}

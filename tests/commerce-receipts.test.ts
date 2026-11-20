import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import {
  getBaghdadDateCompact,
  issueUnifiedReceiptOnCompletion,
  preReadReceiptStateInTx,
} from '../server/commerceReceiptsEngine.ts';
import { createCommerceRouter } from '../server/commerceRoutes.ts';
import { allocateFefoBatches } from '../server/pharmacyWholesalerEngine.ts';
import type { PharmacyBatchRecord } from '../src/types/pharmacy.ts';

function createCommerceMockDb() {
  const cols = new Map<string, Map<string, Record<string, unknown>>>();

  const ensureCol = (name: string) => {
    let m = cols.get(name);
    if (!m) {
      m = new Map();
      cols.set(name, m);
    }
    return m;
  };

  ensureCol('admin_roles').set('admin_uid', { active: true });
  ensureCol('pharmacy_profiles').set('pharm_uid', {
    pharmacyUid: 'pharm_uid',
    pharmacyNameAr: 'صيدلية بغداد',
    status: 'Approved',
  });
  ensureCol('doctor_profiles').set('doc_uid', {
    uid: 'doc_uid',
    fullName: 'د. أحمد الكناني',
    status: 'Approved',
  });
  ensureCol('patient_profiles').set('pat_uid', {
    uid: 'pat_uid',
    fullName: 'مريض',
    status: 'Active',
  });

  const makeSnap = (id: string, data: Record<string, unknown> | undefined) => ({
    id,
    exists: Boolean(data),
    data: () => (data ? structuredClone(data) : undefined),
  });

  const docHandle = (path: string) => {
    const [colName, docId] = path.split('/');
    return {
      path,
      id: docId,
      async get() {
        return makeSnap(docId, ensureCol(colName).get(docId));
      },
      async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
        const prev = ensureCol(colName).get(docId) || {};
        ensureCol(colName).set(
          docId,
          opts?.merge ? { ...prev, ...structuredClone(data) } : structuredClone(data),
        );
      },
      async update(patch: Record<string, unknown>) {
        const prev = ensureCol(colName).get(docId) || {};
        ensureCol(colName).set(docId, { ...prev, ...structuredClone(patch) });
      },
    };
  };

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
            const ok = filters.every((f) => f.op === '==' && data[f.field] === f.val);
            if (ok) docs.push(makeSnap(id, data));
            if (docs.length >= maxLimit) break;
          }
          return { docs };
        },
      };
      return q;
    },
    doc: docHandle,
    async runTransaction<T>(fn: (tx: {
      get: (ref: ReturnType<typeof docHandle>) => Promise<ReturnType<typeof makeSnap>>;
      set: (ref: ReturnType<typeof docHandle>, data: Record<string, unknown>, opts?: { merge?: boolean }) => void;
      update: (ref: ReturnType<typeof docHandle>, patch: Record<string, unknown>) => void;
    }) => Promise<T>): Promise<T> {
      const tx = {
        get: (ref: ReturnType<typeof docHandle>) => ref.get(),
        set: (ref: ReturnType<typeof docHandle>, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
          void ref.set(data, opts);
        },
        update: (ref: ReturnType<typeof docHandle>, patch: Record<string, unknown>) => {
          void ref.update(patch);
        },
      };
      return fn(tx);
    },
  };

  return { db, cols };
}

test('3-Party Linked Receipts Engine is sequential, idempotent, and binds Seller + Buyer + Admin', async () => {
  const { db, cols } = createCommerceMockDb();
  const compactDate = getBaghdadDateCompact();

  // Issue 1: Wholesaler -> Pharmacy
  const r1 = await db.runTransaction(async (tx) => {
    const pre = await preReadReceiptStateInTx(db as never, tx as never, 'ord_wh_1');
    return issueUnifiedReceiptOnCompletion(
      db as never,
      tx as never,
      {
        transactionType: 'wholesaler_to_pharmacy',
        orderId: 'ord_wh_1',
        orderNumber: 'WH-2026-0001',
        sellerUid: 'wh_uid',
        sellerRole: 'wholesaler',
        sellerName: 'مذخر الرافدين',
        buyerUid: 'pharm_uid',
        buyerRole: 'pharmacy',
        buyerName: 'صيدلية بغداد',
        items: [{ productId: 'p1', medicineName: 'Amoxicillin 500mg', quantity: 10, unitPriceIqd: 2500, lineTotalIqd: 25000 }],
        subtotalAmountIqd: 25000,
        discountAmountIqd: 0,
        deliveryFeeIqd: 0,
        totalAmountIqd: 25000,
        paidAmountIqd: 25000,
        balanceDueIqd: 0,
        paymentMethod: 'direct',
        paymentStatus: 'paid',
        fulfillmentType: 'seller_delivery',
        actorUid: 'pharm_uid',
        actorName: 'صيدلية بغداد',
        actorRole: 'pharmacy',
      },
      pre,
    );
  });
  assert.equal(r1.alreadyExisted, false);
  assert.equal(r1.receipt.receiptId, 'rcpt_ord_wh_1');
  assert.equal(r1.receipt.receiptNumber, `MDR-RCPT-${compactDate}-0001`);

  // Idempotent duplicate completion does NOT increment sequence or duplicate receipt
  const r1Dup = await db.runTransaction(async (tx) => {
    const pre = await preReadReceiptStateInTx(db as never, tx as never, 'ord_wh_1');
    return issueUnifiedReceiptOnCompletion(
      db as never,
      tx as never,
      {
        transactionType: 'wholesaler_to_pharmacy',
        orderId: 'ord_wh_1',
        orderNumber: 'WH-2026-0001',
        sellerUid: 'wh_uid',
        sellerRole: 'wholesaler',
        sellerName: 'مذخر الرافدين',
        buyerUid: 'pharm_uid',
        buyerRole: 'pharmacy',
        buyerName: 'صيدلية بغداد',
        items: [{ productId: 'p1', medicineName: 'Amoxicillin 500mg', quantity: 10, unitPriceIqd: 2500, lineTotalIqd: 25000 }],
        subtotalAmountIqd: 25000,
        discountAmountIqd: 0,
        deliveryFeeIqd: 0,
        totalAmountIqd: 25000,
        paidAmountIqd: 25000,
        balanceDueIqd: 0,
        paymentMethod: 'direct',
        paymentStatus: 'paid',
        fulfillmentType: 'seller_delivery',
        actorUid: 'pharm_uid',
        actorName: 'صيدلية بغداد',
        actorRole: 'pharmacy',
      },
      pre,
    );
  });
  assert.equal(r1Dup.alreadyExisted, true);
  assert.equal(r1Dup.receipt.receiptNumber, `MDR-RCPT-${compactDate}-0001`);
  assert.equal(cols.get('medora_receipt_events')?.size, 1);

  // Issue 2: Pharmacy -> Doctor increments to 0002
  const r2 = await db.runTransaction(async (tx) => {
    const pre = await preReadReceiptStateInTx(db as never, tx as never, 'ord_doc_1');
    return issueUnifiedReceiptOnCompletion(
      db as never,
      tx as never,
      {
        transactionType: 'pharmacy_to_doctor',
        orderId: 'ord_doc_1',
        orderNumber: 'PDO-2026-0001',
        sellerUid: 'pharm_uid',
        sellerRole: 'pharmacy',
        sellerName: 'صيدلية بغداد',
        buyerUid: 'doc_uid',
        buyerRole: 'doctor',
        buyerName: 'د. أحمد الكناني',
        items: [{ productId: 'p2', medicineName: 'Paracetamol 500mg', quantity: 5, unitPriceIqd: 1500, lineTotalIqd: 7500 }],
        subtotalAmountIqd: 7500,
        discountAmountIqd: 0,
        deliveryFeeIqd: 0,
        totalAmountIqd: 7500,
        paidAmountIqd: 7500,
        balanceDueIqd: 0,
        paymentMethod: 'cash_on_pickup',
        paymentStatus: 'paid',
        fulfillmentType: 'buyer_pickup',
        actorUid: 'doc_uid',
        actorName: 'د. أحمد الكناني',
        actorRole: 'doctor',
      },
      pre,
    );
  });
  assert.equal(r2.receipt.receiptNumber, `MDR-RCPT-${compactDate}-0002`);
});

test('FEFO batch allocation picks earliest unexpired batch first and skips expired stock', () => {
  const batches: PharmacyBatchRecord[] = [
    {
      batchId: 'b_expired',
      pharmacyUid: 'pharm_uid',
      institutionId: 'inst_pharm',
      productId: 'prod_1',
      medicineId: 'med_1',
      productName: 'Test Med',
      batchNumber: 'EXP-01',
      expiryDate: '2020-01-01',
      availableQty: 50,
      reservedQty: 0,
      purchasePriceIqd: 1000,
      sourceType: 'manual',
      isExpired: true,
    },
    {
      batchId: 'b_late',
      pharmacyUid: 'pharm_uid',
      institutionId: 'inst_pharm',
      productId: 'prod_1',
      medicineId: 'med_1',
      productName: 'Test Med',
      batchNumber: 'LATE-02',
      expiryDate: '2029-12-01',
      availableQty: 10,
      reservedQty: 0,
      purchasePriceIqd: 1000,
      sourceType: 'manual',
      isExpired: false,
    },
    {
      batchId: 'b_soon',
      pharmacyUid: 'pharm_uid',
      institutionId: 'inst_pharm',
      productId: 'prod_1',
      medicineId: 'med_1',
      productName: 'Test Med',
      batchNumber: 'SOON-03',
      expiryDate: '2028-03-01',
      availableQty: 4,
      reservedQty: 0,
      purchasePriceIqd: 1000,
      sourceType: 'manual',
      isExpired: false,
    },
  ];

  const allocation = allocateFefoBatches(batches, 6, '2026-11-20');
  assert.equal(allocation.ok, true);
  if (allocation.ok) {
    assert.deepEqual(
      allocation.allocations.map((a) => ({ id: a.batchId, qty: a.quantity })),
      [
        { id: 'b_soon', qty: 4 },
        { id: 'b_late', qty: 2 },
      ],
    );
  }
});

test('Commerce Router enforces scoped access to 3-party receipts and Super Admin voiding', async () => {
  const { db } = createCommerceMockDb();
  await db.runTransaction(async (tx) => {
    const pre = await preReadReceiptStateInTx(db as never, tx as never, 'ord_1');
    await issueUnifiedReceiptOnCompletion(
      db as never,
      tx as never,
      {
        transactionType: 'pharmacy_to_doctor',
        orderId: 'ord_1',
        orderNumber: 'PDO-1',
        sellerUid: 'pharm_uid',
        sellerRole: 'pharmacy',
        sellerName: 'صيدلية بغداد',
        buyerUid: 'doc_uid',
        buyerRole: 'doctor',
        buyerName: 'د. أحمد الكناني',
        items: [{ productId: 'p1', medicineName: 'Vitamin C', quantity: 2, unitPriceIqd: 3000, lineTotalIqd: 6000 }],
        subtotalAmountIqd: 6000,
        discountAmountIqd: 0,
        deliveryFeeIqd: 0,
        totalAmountIqd: 6000,
        paidAmountIqd: 6000,
        balanceDueIqd: 0,
        paymentMethod: 'direct',
        paymentStatus: 'paid',
        fulfillmentType: 'buyer_pickup',
        actorUid: 'doc_uid',
        actorName: 'د. أحمد الكناني',
        actorRole: 'doctor',
      },
      pre,
    );
  });

  const tokenUsers: Record<string, { uid: string; email: string; email_verified: boolean; name: string }> = {
    tok_doc: { uid: 'doc_uid', email: 'doc@medora.test', email_verified: true, name: 'د. أحمد' },
    tok_pat: { uid: 'pat_uid', email: 'pat@medora.test', email_verified: true, name: 'مريض آخر' },
    tok_admin: { uid: 'admin_uid', email: 'aqbs250@gmail.com', email_verified: true, name: 'Super Admin' },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createCommerceRouter({
      adminAuth: {
        verifyIdToken: async (tok: string) => {
          const u = tokenUsers[tok];
          if (!u) throw new Error('NO');
          return u;
        },
      } as never,
      getAdminDb: () => db as never,
      requireSuperAdmin: async (req, res, next) => {
        const hdr = req.headers.authorization || '';
        if (hdr === 'Bearer tok_admin') {
          (req as unknown as { superAdmin?: { uid: string; email: string } }).superAdmin = {
            uid: 'admin_uid',
            email: 'aqbs250@gmail.com',
          };
          next();
          return;
        }
        res.status(403).json({ error: 'ADMIN_ONLY' });
      },
    }),
  );

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;

  try {
    // Doctor (buyer) sees receipt
    const docList = await fetch(`http://127.0.0.1:${port}/api/receipts`, {
      headers: { Authorization: 'Bearer tok_doc' },
    }).then((r) => r.json() as Promise<{ receipts: Array<{ receiptId: string }> }>);
    assert.equal(docList.receipts.length, 1);
    assert.equal(docList.receipts[0].receiptId, 'rcpt_ord_1');

    // Unrelated patient cannot open doctor<->pharmacy receipt
    const forbiddenDetail = await fetch(`http://127.0.0.1:${port}/api/receipts/rcpt_ord_1`, {
      headers: { Authorization: 'Bearer tok_pat' },
    });
    assert.equal(forbiddenDetail.status, 403);

    // Super Admin can void receipt with mandatory reason
    const voidRes = await fetch(`http://127.0.0.1:${port}/api/admin/receipts/rcpt_ord_1/void`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok_admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'خطأ في كمية التسليم الموثقة' }),
    });
    assert.equal(voidRes.status, 200);
    const voided = (await voidRes.json()) as { receipt: { status: string; voidReason?: string } };
    assert.equal(voided.receipt.status, 'voided');
    assert.equal(voided.receipt.voidReason, 'خطأ في كمية التسليم الموثقة');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import {
  acceptSecretaryInvitationService,
  createEmployerInvitationService,
  createSecretaryRouter,
  loadScopedWorkspaceForEmployment,
  rejectSecretaryInvitationService,
  resolveActiveSecretaryEmployment,
  resolveEmployerContext,
  revokeEmployerInvitationService,
  sanitizePermissionsForEmployer,
  updateEmployerEmploymentService,
} from '../server/secretaryRoutes.ts';

type DocData = Record<string, unknown>;

function cloneValue<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function applyFieldSentinels(
  target: DocData,
  patch: DocData,
): DocData {
  const serverTsSentinel = FieldValue.serverTimestamp();
  const next = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (
      v === serverTsSentinel ||
      (typeof v === 'object' &&
        v !== null &&
        v.constructor?.name === 'ServerTimestampTransform')
    ) {
      next[k] = new Date().toISOString();
    } else if (
      typeof v === 'object' &&
      v !== null &&
      v.constructor?.name === 'NumericIncrementTransform' &&
      typeof (v as { operand?: unknown }).operand === 'number'
    ) {
      const curr = typeof next[k] === 'number' ? (next[k] as number) : 0;
      next[k] = curr + Number((v as { operand: number }).operand);
    } else {
      next[k] = cloneValue(v);
    }
  }
  return next;
}

class InMemoryFirestore {
  readonly store = new Map<string, Map<string, DocData>>();

  private getCollectionMap(col: string): Map<string, DocData> {
    let m = this.store.get(col);
    if (!m) {
      m = new Map<string, DocData>();
      this.store.set(col, m);
    }
    return m;
  }

  seed(col: string, id: string, data: DocData): void {
    this.getCollectionMap(col).set(id, applyFieldSentinels({}, data));
  }

  count(col: string): number {
    return this.getCollectionMap(col).size;
  }

  doc(path: string) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Expected col/doc path, got: ${path}`);
    }
    const [col, id] = parts;
    const self = this;

    const ref = {
      id,
      path,
      async get() {
        const data = self.getCollectionMap(col).get(id);
        return {
          id,
          exists: Boolean(data),
          ref,
          data: () => (data ? cloneValue(data) : undefined),
        };
      },
      async set(data: DocData, opts?: { merge?: boolean }) {
        const map = self.getCollectionMap(col);
        const existing = opts?.merge ? map.get(id) || {} : {};
        map.set(id, applyFieldSentinels(existing, data));
      },
      async update(patch: DocData) {
        const map = self.getCollectionMap(col);
        const existing = map.get(id);
        if (!existing) {
          throw new Error(`Cannot update missing document: ${path}`);
        }
        map.set(id, applyFieldSentinels(existing, patch));
      },
    };
    return ref;
  }

  collection(col: string) {
    const self = this;
    const filters: Array<{ field: string; op: string; value: unknown }> = [];
    let limitCount = Infinity;

    const queryObj = {
      where(field: string, op: string, value: unknown) {
        filters.push({ field, op, value });
        return queryObj;
      },
      limit(n: number) {
        limitCount = n;
        return queryObj;
      },
      async get() {
        const map = self.getCollectionMap(col);
        const matched: Array<{
          id: string;
          exists: true;
          ref: ReturnType<InMemoryFirestore['doc']>;
          data: () => DocData;
        }> = [];
        for (const [id, data] of map.entries()) {
          const passes = filters.every((f) => {
            if (f.op === '==') return data[f.field] === f.value;
            return true;
          });
          if (!passes) continue;
          matched.push({
            id,
            exists: true,
            ref: self.doc(`${col}/${id}`),
            data: () => cloneValue(data),
          });
          if (matched.length >= limitCount) break;
        }
        return {
          empty: matched.length === 0,
          size: matched.length,
          docs: matched,
        };
      },
    };
    return queryObj;
  }

  batch() {
    const ops: Array<() => Promise<void>> = [];
    return {
      set(
        ref: ReturnType<InMemoryFirestore['doc']>,
        data: DocData,
        opts?: { merge?: boolean },
      ) {
        ops.push(() => ref.set(data, opts));
      },
      update(ref: ReturnType<InMemoryFirestore['doc']>, patch: DocData) {
        ops.push(() => ref.update(patch));
      },
      async commit() {
        for (const op of ops) {
          await op();
        }
      },
    };
  }
}

async function main() {
  const memDb = new InMemoryFirestore();
  const db = memDb as unknown as Firestore;

  // Seed Doctor A, Lab B, Secretary 1, Secretary 2
  const doctorAUid = 'doc_a_uid_1234';
  const labBUid = 'lab_b_uid_5678';
  const sec1Uid = 'sec_1_uid_aaaa1111';
  const sec2Uid = 'sec_2_uid_bbbb2222';

  memDb.seed('users', doctorAUid, {
    uid: doctorAUid,
    email: 'doctor.a@medora.test',
    fullName: 'د. أحمد الجبوري',
    selectedPortal: 'doctor',
    accountStatus: 'active',
  });
  memDb.seed('doctor_profiles', doctorAUid, {
    uid: doctorAUid,
    status: 'Approved',
    fullName: 'د. أحمد الجبوري',
    clinicName: 'عيادة القلب المتقدمة',
    specialty: 'أمراض القلب',
    institutionId: 'inst_clinic_a',
    email: 'doctor.a@medora.test',
  });
  memDb.seed('institutions', 'inst_clinic_a', {
    institutionId: 'inst_clinic_a',
    status: 'active',
  });

  memDb.seed('users', labBUid, {
    uid: labBUid,
    email: 'lab.b@medora.test',
    fullName: 'مدير مختبر النور',
    selectedPortal: 'lab',
    accountStatus: 'active',
  });
  memDb.seed('lab_profiles', labBUid, {
    uid: labBUid,
    status: 'Approved',
    labNameAr: 'مختبر النور التخصصي',
    managerFullName: 'أ. سارة العلي',
    governorate: 'بغداد',
    institutionId: 'inst_lab_b',
  });
  memDb.seed('institutions', 'inst_lab_b', {
    institutionId: 'inst_lab_b',
    status: 'active',
  });

  memDb.seed('users', sec1Uid, {
    uid: sec1Uid,
    email: 'sec1@medora.test',
    fullName: 'زينب حسن',
    selectedPortal: 'secretary',
    accountStatus: 'active',
  });
  memDb.seed('secretary_profiles', sec1Uid, {
    uid: sec1Uid,
    secretaryCode: 'SEC-SEC11111',
    fullName: 'زينب حسن',
    email: 'sec1@medora.test',
    phone: '07701234567',
    educationQualification: 'بكالوريوس إدارة صحية',
    status: 'Approved',
  });

  memDb.seed('users', sec2Uid, {
    uid: sec2Uid,
    email: 'sec2@medora.test',
    fullName: 'علي كريم',
    selectedPortal: 'secretary',
    accountStatus: 'active',
  });
  memDb.seed('secretary_profiles', sec2Uid, {
    uid: sec2Uid,
    secretaryCode: 'SEC-SEC22222',
    fullName: 'علي كريم',
    email: 'sec2@medora.test',
    phone: '07709998887',
    educationQualification: 'دبلوم سكرتارية طبية',
    status: 'Approved',
  });

  // Seed Doctor A operational records
  memDb.seed('appointments', 'appt_doc_1', {
    appointmentId: 'appt_doc_1',
    doctorUid: doctorAUid,
    patientName: 'مريض العيادة 1',
    patientPhone: '07710000001',
    date: '2026-11-20',
    time: '10:00',
    status: 'pending',
    visitType: 'scheduled',
  });
  memDb.seed('doctor_conversations', 'conv_doc_1', {
    conversationId: 'conv_doc_1',
    doctorUid: doctorAUid,
    patientUid: 'pat_1',
    patientName: 'مريض العيادة 1',
    lastMessagePreview: 'مرحبا دكتور',
    unreadByDoctor: 1,
  });

  // Seed Lab B operational records
  memDb.seed('lab_bookings', 'lb_1', {
    bookingId: 'lb_1',
    facilityUid: labBUid,
    patientName: 'مراجع المختبر 1',
    patientPhone: '07720000002',
    date: '2026-11-20',
    time: '09:30',
    requestedTests: ['CBC'],
    status: 'confirmed',
    arrivalRegistered: false,
  });
  memDb.seed('lab_orders', 'lo_1', {
    orderId: 'lo_1',
    orderNumber: 'LAB-1001',
    labUid: labBUid,
    patientName: 'مراجع المختبر 1',
    patientPhone: '07720000002',
    priority: 'routine',
    status: 'ordered',
    tests: [{ nameAr: 'صورة دم كاملة' }],
  });

  // -------------------------------------------------------------------------
  // Test 1: Permission Sanitization & Invitation Pending Only (0 employments)
  // -------------------------------------------------------------------------
  const sanitizedDoctor = sanitizePermissionsForEmployer('doctor', [
    'manageBookings',
    'approveResults',
    'manageMedicalRecords',
    'writePrescription',
  ]);
  assert.deepEqual(sanitizedDoctor, ['manageBookings']);

  const sanitizedLab = sanitizePermissionsForEmployer('lab', [
    'trackOrders',
    'enterResults',
    'approveResults',
  ]);
  assert.deepEqual(sanitizedLab, ['trackOrders']);

  const docCtxRes = await resolveEmployerContext(
    db,
    doctorAUid,
    'doctor.a@medora.test',
    'doctor',
  );
  assert.equal(docCtxRes.ok, true);
  if (!docCtxRes.ok) throw new Error('Doctor context failed');

  const inv1Res = await createEmployerInvitationService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    {
      identifier: 'sec1@medora.test',
      message: 'دعوة لإدارة حجوزات العيادة',
      proposedPermissions: ['manageBookings', 'adminMessaging', 'approveResults'],
      initialTasks: [
        { title: 'تأكيد حجوزات الصباح', priority: 'high' },
      ],
    },
  );
  assert.equal(inv1Res.ok, true);
  if (!inv1Res.ok) throw new Error('Invite 1 failed');
  assert.equal(inv1Res.invitation.status, 'Pending');
  assert.deepEqual(inv1Res.invitation.proposedPermissions, [
    'manageBookings',
    'adminMessaging',
  ]);
  assert.equal(memDb.count('secretary_employments'), 0, 'Invite must not create active employment');

  // -------------------------------------------------------------------------
  // Test 2: Rejection workflow creates 0 employments
  // -------------------------------------------------------------------------
  const invSec2Res = await createEmployerInvitationService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    {
      identifier: 'SEC-SEC22222',
      proposedPermissions: ['manageBookings'],
    },
  );
  assert.equal(invSec2Res.ok, true);
  if (!invSec2Res.ok) throw new Error('Invite sec2 failed');

  const rejectRes = await rejectSecretaryInvitationService(db, {
    invitationId: String(invSec2Res.invitation.invitationId),
    secretaryUid: sec2Uid,
    secretaryName: 'علي كريم',
  });
  assert.equal(rejectRes.ok, true);
  if (!rejectRes.ok) throw new Error('Reject failed');
  assert.equal(rejectRes.invitation.status, 'Rejected');
  assert.equal(memDb.count('secretary_employments'), 0);

  // -------------------------------------------------------------------------
  // Test 3: Revoking pending invitation blocks subsequent acceptance
  // -------------------------------------------------------------------------
  const invToRevokeRes = await createEmployerInvitationService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    {
      identifier: sec2Uid,
      proposedPermissions: ['manageBookings'],
    },
  );
  assert.equal(invToRevokeRes.ok, true);
  if (!invToRevokeRes.ok) throw new Error('Invite to revoke failed');

  const revokeRes = await revokeEmployerInvitationService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    String(invToRevokeRes.invitation.invitationId),
  );
  assert.equal(revokeRes.ok, true);
  if (!revokeRes.ok) throw new Error('Revoke failed');
  assert.equal(revokeRes.invitation.status, 'Revoked');

  const acceptRevokedRes = await acceptSecretaryInvitationService(db, {
    invitationId: String(invToRevokeRes.invitation.invitationId),
    secretaryUid: sec2Uid,
    secretaryEmail: 'sec2@medora.test',
    secretaryName: 'علي كريم',
  });
  assert.equal(acceptRevokedRes.ok, false);
  if (!acceptRevokedRes.ok) {
    assert.equal(acceptRevokedRes.statusCode, 409);
  }

  // -------------------------------------------------------------------------
  // Test 4: Secretary 1 accepts Doctor A invitation -> Active + Initial Task
  // -------------------------------------------------------------------------
  const acceptDocRes = await acceptSecretaryInvitationService(db, {
    invitationId: String(inv1Res.invitation.invitationId),
    secretaryUid: sec1Uid,
    secretaryEmail: 'sec1@medora.test',
    secretaryName: 'زينب حسن',
  });
  assert.equal(acceptDocRes.ok, true);
  if (!acceptDocRes.ok) throw new Error('Accept doc invite failed');
  assert.equal(acceptDocRes.invitation.status, 'Accepted');
  assert.equal(acceptDocRes.employment.status, 'Active');
  const docEmpId = String(acceptDocRes.employment.employmentId);
  assert.equal(memDb.count('secretary_tasks'), 1);

  // -------------------------------------------------------------------------
  // Test 5: Multi-employer isolation (same secretary linked to Doctor A + Lab B)
  // -------------------------------------------------------------------------
  const labCtxRes = await resolveEmployerContext(
    db,
    labBUid,
    'lab.b@medora.test',
    'lab',
  );
  assert.equal(labCtxRes.ok, true);
  if (!labCtxRes.ok) throw new Error('Lab context failed');

  const labInvRes = await createEmployerInvitationService(
    db,
    labCtxRes.ctx,
    labBUid,
    {
      identifier: 'sec1@medora.test',
      proposedPermissions: ['manageBookings', 'registerPatientArrival', 'trackOrders'],
      initialTasks: [{ title: 'تجهيز استقبال العينات', priority: 'medium' }],
    },
  );
  assert.equal(labInvRes.ok, true);
  if (!labInvRes.ok) throw new Error('Lab invite failed');

  const acceptLabRes = await acceptSecretaryInvitationService(db, {
    invitationId: String(labInvRes.invitation.invitationId),
    secretaryUid: sec1Uid,
    secretaryEmail: 'sec1@medora.test',
    secretaryName: 'زينب حسن',
  });
  assert.equal(acceptLabRes.ok, true);
  if (!acceptLabRes.ok) throw new Error('Accept lab invite failed');
  const labEmpId = String(acceptLabRes.employment.employmentId);

  const docResolve = await resolveActiveSecretaryEmployment(db, sec1Uid, docEmpId);
  assert.equal(docResolve.ok, true);
  if (!docResolve.ok) throw new Error('Resolve doc emp failed');
  const docWorkspace = await loadScopedWorkspaceForEmployment(db, docResolve.employment);
  assert.equal((docWorkspace.appointments as unknown[]).length, 1);
  assert.equal((docWorkspace.conversations as unknown[]).length, 1);
  assert.equal((docWorkspace.tasks as unknown[]).length, 1);
  assert.equal(
    (docWorkspace.tasks as Array<Record<string, unknown>>)[0].employmentId,
    docEmpId,
  );
  assert.equal(docWorkspace.labBookings, undefined, 'Doctor scope must not include lab bookings');
  assert.equal(docWorkspace.labOrders, undefined, 'Doctor scope must not include lab orders');

  const labResolve = await resolveActiveSecretaryEmployment(db, sec1Uid, labEmpId);
  assert.equal(labResolve.ok, true);
  if (!labResolve.ok) throw new Error('Resolve lab emp failed');
  const labWorkspace = await loadScopedWorkspaceForEmployment(db, labResolve.employment);
  assert.equal((labWorkspace.labBookings as unknown[]).length, 1);
  assert.equal((labWorkspace.labOrders as unknown[]).length, 1);
  assert.equal((labWorkspace.tasks as unknown[]).length, 1);
  assert.equal(
    (labWorkspace.tasks as Array<Record<string, unknown>>)[0].employmentId,
    labEmpId,
  );
  assert.equal(labWorkspace.appointments, undefined, 'Lab scope must not include doctor appointments');

  // -------------------------------------------------------------------------
  // Test 6: Cross-user isolation, Suspension isolation & Termination permanence
  // -------------------------------------------------------------------------
  const crossUserResolve = await resolveActiveSecretaryEmployment(db, sec2Uid, docEmpId);
  assert.equal(crossUserResolve.ok, false);
  if (!crossUserResolve.ok) {
    assert.equal(crossUserResolve.statusCode, 403);
    assert.equal(crossUserResolve.error, 'FORBIDDEN_EMPLOYER_ACCESS');
  }

  const suspendRes = await updateEmployerEmploymentService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    docEmpId,
    { status: 'Suspended', statusReason: 'إجازة مؤقتة' },
  );
  assert.equal(suspendRes.ok, true);

  const docSuspendedResolve = await resolveActiveSecretaryEmployment(db, sec1Uid, docEmpId);
  assert.equal(docSuspendedResolve.ok, false);
  if (!docSuspendedResolve.ok) {
    assert.equal(docSuspendedResolve.statusCode, 403);
    assert.equal(docSuspendedResolve.error, 'EMPLOYMENT_SUSPENDED');
  }
  // Lab B remains Active & usable!
  const labStillActive = await resolveActiveSecretaryEmployment(db, sec1Uid, labEmpId);
  assert.equal(labStillActive.ok, true);

  const terminateRes = await updateEmployerEmploymentService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    docEmpId,
    { status: 'Terminated' },
  );
  assert.equal(terminateRes.ok, true);

  const docTerminatedResolve = await resolveActiveSecretaryEmployment(db, sec1Uid, docEmpId);
  assert.equal(docTerminatedResolve.ok, false);
  if (!docTerminatedResolve.ok) {
    assert.equal(docTerminatedResolve.statusCode, 403);
    assert.equal(docTerminatedResolve.error, 'EMPLOYMENT_TERMINATED');
  }

  const reactivateAttempt = await updateEmployerEmploymentService(
    db,
    docCtxRes.ctx,
    doctorAUid,
    docEmpId,
    { status: 'Active' },
  );
  assert.equal(reactivateAttempt.ok, false);
  if (!reactivateAttempt.ok) {
    assert.equal(reactivateAttempt.statusCode, 409);
    assert.equal(reactivateAttempt.error, 'TERMINATED_LINK_IS_FINAL');
  }

  // -------------------------------------------------------------------------
  // Test 7: HTTP Router Enforcement (Clinical Stage Lock + Auth Isolation)
  // -------------------------------------------------------------------------
  const tokenMap: Record<string, { uid: string; email: string; name: string; email_verified: boolean }> = {
    'token-sec-1': {
      uid: sec1Uid,
      email: 'sec1@medora.test',
      name: 'زينب حسن',
      email_verified: true,
    },
    'token-doc-a': {
      uid: doctorAUid,
      email: 'doctor.a@medora.test',
      name: 'د. أحمد الجبوري',
      email_verified: true,
    },
  };
  const mockAuth = {
    async verifyIdToken(token: string) {
      const rec = tokenMap[token];
      if (!rec) throw new Error('INVALID');
      return rec;
    },
  } as unknown as Auth;

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createSecretaryRouter({
      adminAuth: mockAuth,
      getAdminDb: () => db,
      isFirestoreAdminReady: () => true,
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    // Unauthenticated check
    const unauthRes = await fetch(`${baseUrl}/secretary/workspace`);
    assert.equal(unauthRes.status, 401);

    // Suspended/Terminated Doctor employment HTTP access denied via ?employmentId=
    const termHttpRes = await fetch(
      `${baseUrl}/secretary/workspace?employmentId=${encodeURIComponent(docEmpId)}`,
      {
        headers: { Authorization: 'Bearer token-sec-1' },
      },
    );
    assert.equal(termHttpRes.status, 403);

    // Active Lab employment HTTP workspace loads cleanly
    const labHttpRes = await fetch(
      `${baseUrl}/secretary/workspace?employmentId=${encodeURIComponent(labEmpId)}`,
      {
        headers: { Authorization: 'Bearer token-sec-1' },
      },
    );
    assert.equal(labHttpRes.status, 200);

    // Active Lab employment clinical lock: reject 'result_entered'
    const clinicalLockRes = await fetch(
      `${baseUrl}/secretary/employments/${labEmpId}/lab/orders/lo_1/tracking`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-sec-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'result_entered' }),
      },
    );
    assert.equal(clinicalLockRes.status, 403);
    const clinicalLockJson = (await clinicalLockRes.json()) as { error: string };
    assert.equal(clinicalLockJson.error, 'CLINICAL_STAGE_RESTRICTED_TO_LAB_TECHNICAL_STAFF');

    // Allowed administrative intake stage update succeeds
    const intakeOkRes = await fetch(
      `${baseUrl}/secretary/employments/${labEmpId}/lab/orders/lo_1/tracking`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer token-sec-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'sample_collected' }),
      },
    );
    assert.equal(intakeOkRes.status, 200);

    // Privilege escalation blocked on PUT /secretary/profile
    const escRes = await fetch(`${baseUrl}/secretary/profile`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer token-sec-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'زينب حسن',
        phone: '07701234567',
        educationQualification: 'بكالوريوس إدارة صحية',
        permissionsGranted: true,
      }),
    });
    assert.equal(escRes.status, 403);

    // Doctor cannot access Lab employer secretary endpoints
    const wrongEmployerRes = await fetch(`${baseUrl}/employer/lab/secretaries/workspace`, {
      headers: { Authorization: 'Bearer token-doc-a' },
    });
    assert.equal(wrongEmployerRes.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        passedTests: 7,
        scenarios: [
          'permission_sanitization_and_pending_only_invite',
          'invitation_rejection_creates_zero_employments',
          'revoked_invitation_blocks_acceptance',
          'accepted_invitation_creates_active_employment_and_initial_tasks',
          'multi_employer_isolation_doctor_vs_lab',
          'cross_user_suspension_and_permanent_termination_guards',
          'http_router_auth_and_lab_clinical_stage_lock',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

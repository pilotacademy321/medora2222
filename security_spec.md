# MEDORA Firestore Security Specification

## 1. Core Data Invariants
1. **Identity Integrity**: Every user document (`users/{uid}`) and portal profile (`patient_profiles/{uid}`, `doctor_profiles/{uid}`, `lab_profiles/{uid}`, `imaging_profiles/{uid}`, `secretary_profiles/{uid}`) is strictly keyed by `request.auth.uid` and requires `request.auth.token.email_verified == true`.
2. **No Self-Privilege Escalation**: Regular users cannot create, update, or delete their own `admin_roles/{uid}` document, nor can doctors, labs, imaging centers, or secretaries set their own `status` to `Approved` or `permissionsGranted` to `true`.
3. **Portal Activation Rules**:
   - `patient`: activates immediately (`Approved` / `patient_instant`) upon policy acceptance.
   - `doctor`, `lab`, `imaging`: created only in `Draft` or `Submitted` with `activationRule == 'admin_approval'`.
   - `secretary`: created only with `permissionsGranted == false` and `activationRule == 'institution_approval'`.
4. **PII & Institutional Isolation**: Users may only `get` their own PII documents (`users`, `*_profiles`) and `list` only their own `registration_requests`, `institutions`, and `institution_members`. Only verified Super Admins (`admin_roles/{uid}.active == true`) can review cross-user data.
5. **Immutable Audit Trail**: `audit_logs` are append-only (`actorUid == request.auth.uid`, `createdAt == request.time`); `update` and `delete` are unconditionally denied.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unverified Email Spoof**: Write `users/{uid}` with `email_verified: false` -> `PERMISSION_DENIED`.
2. **Identity Spoofing**: Create `registration_requests/req_1` with `uid: "victim_uid"` while signed in as `attacker_uid` -> `PERMISSION_DENIED`.
3. **Self-Admin Escalation**: Create `admin_roles/{attacker_uid}` with `{ role: "super_admin", active: true }` -> `PERMISSION_DENIED`.
4. **Doctor Self-Approval**: Create `doctor_profiles/{uid}` with `{ status: "Approved" }` -> `PERMISSION_DENIED`.
5. **Secretary Auto-Permissions**: Create `secretary_profiles/{uid}` with `{ permissionsGranted: true }` -> `PERMISSION_DENIED`.
6. **Shadow Ghost Field**: Update `users/{uid}` injecting `{ isAdmin: true }` -> `PERMISSION_DENIED`.
7. **PII Cross-Read**: `get` `users/{otherUid}` as a non-admin user -> `PERMISSION_DENIED`.
8. **Blanket Request Scraping**: `list` `registration_requests` without `where('uid', '==', auth.uid)` as non-admin -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Create `registration_requests` with a 500-char or slash-containing document ID -> `PERMISSION_DENIED`.
10. **Timestamp Forgery**: Create `audit_logs/{id}` with a backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
11. **Terminal State Tampering**: Update an `Approved` or `Rejected` `registration_requests` doc as the applicant -> `PERMISSION_DENIED`.
12. **Audit Log Erasure**: Delete or update any `audit_logs/{id}` document -> `PERMISSION_DENIED`.

## 3. Commerce, Receipts, Ads & Messaging Invariants
6. **3-Party Linked Receipts (`medora_receipts`)**: Each completed order emits a single immutable receipt keyed deterministically (`rcpt_{orderId}`), readable strictly by `sellerUid`, `buyerUid`, or an active Super Admin. Totals, order linkage, and party identities are write-protected; amendments and voids require Super Admin authorization with mandatory reason logging in `medora_receipt_events`.
7. **Targeted Ads & Closed Imaging Portal**: `medora_ads` creation and updates remain strictly Super Admin controlled; `radiology_info` ads inside the Lab portal are informational/referral cards only, while the Imaging Portal remains disabled (`IMAGING_PORTAL_ENABLED = false`).
8. **Cross-Portal Messaging Isolation**: `medora_threads` and `medora_thread_messages` enforce `request.auth.uid in resource.data.participantUids`, rejecting unauthorized cross-tenant reads/writes with HTTP 403 / `PERMISSION_DENIED`.
9. **Commerce Atomic FEFO Lock**: Supply and sales orders (`wholesaler_supply_orders`, `pharmacy_doctor_orders`, `pharmacy_orders`) enforce valid seller/buyer ownership and idempotency guards preventing duplicate receipts or double stock deductions.


import { type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  fileToDataUrl,
  isValidStorageImageUrl,
  prepareNormalizedImageFile,
  prepareUploadPayloadFromFile,
} from '../utils/imagePreparation';
import type {
  ClinicStaffMember,
  DiagnosticOrderRecord,
  DiagnosticOrderStatus,
  DiagnosticOrderType,
  DoctorAppointment,
  DoctorMedicineSearchItem,
  DoctorPatientRecord,
  DoctorPortalProfile,
  DoctorSlotOption,
  DoctorWorkspaceData,
  MedicationItem,
  PatientVisitRecord,
  PrescriptionRecord,
  PublicDoctorCard,
  SecretaryPermissionKey,
  WorkingSchedule,
  DoctorNotificationPrefs,
  DoctorPrivacyPrefs,
  DoctorConversation,
  DoctorMessageRecord,
} from '../types/doctor';
import type { DoctorReviewRecord } from '../types/patient';
import type { UploadedDocMeta } from '../types/medora';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CLINICAL_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJsonOrThrow<T>(res: Response, fallbackCode: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!res.ok) {
    throw new Error(body.error || body.message || fallbackCode);
  }
  return body;
}

export async function fetchDoctorWorkspace(
  firebaseUser: User,
): Promise<DoctorWorkspaceData> {
  const res = await fetch('/api/doctor/workspace', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<DoctorWorkspaceData>(res, 'DOCTOR_WORKSPACE_FAILED');
}

export async function fetchPublicDoctorDirectory(): Promise<PublicDoctorCard[]> {
  const res = await fetch('/api/doctors/public');
  const body = await parseJsonOrThrow<{ doctors: PublicDoctorCard[] }>(
    res,
    'DIRECTORY_FETCH_FAILED',
  );
  return body.doctors || [];
}

export async function fetchPublicDoctorDetails(doctorUid: string): Promise<{
  doctor: PublicDoctorCard;
  slots: DoctorSlotOption[];
  reviews?: DoctorReviewRecord[];
}> {
  const res = await fetch(
    `/api/doctors/${encodeURIComponent(doctorUid)}/public`,
  );
  return parseJsonOrThrow<{
    doctor: PublicDoctorCard;
    slots: DoctorSlotOption[];
    reviews?: DoctorReviewRecord[];
  }>(res, 'DOCTOR_DETAIL_FAILED');
}

export async function bookPublicAppointment(
  firebaseUser: User,
  input: {
    doctorUid: string;
    date: string;
    time: string;
    patientName: string;
    patientPhone: string;
    reason?: string;
  },
): Promise<DoctorAppointment> {
  const res = await fetch('/api/appointments/book', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ appointment: DoctorAppointment }>(
    res,
    'BOOKING_FAILED',
  );
  return body.appointment;
}

export async function createDoctorAppointment(
  firebaseUser: User,
  input: {
    patientName: string;
    patientPhone: string;
    patientRecordId?: string;
    date: string;
    time: string;
    visitType: 'scheduled' | 'walk_in' | 'follow_up';
    isWaitlist: boolean;
    reason?: string;
  },
): Promise<DoctorAppointment> {
  const res = await fetch('/api/doctor/appointments', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ appointment: DoctorAppointment }>(
    res,
    'APPOINTMENT_CREATE_FAILED',
  );
  return body.appointment;
}

export async function updateDoctorAppointment(
  firebaseUser: User,
  appointmentId: string,
  patch: {
    status?: DoctorAppointment['status'];
    date?: string;
    time?: string;
    promoteFromWaitlist?: boolean;
    cancelledReason?: string;
  },
): Promise<DoctorAppointment> {
  const res = await fetch(
    `/api/doctor/appointments/${encodeURIComponent(appointmentId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(patch),
    },
  );
  const body = await parseJsonOrThrow<{ appointment: DoctorAppointment }>(
    res,
    'APPOINTMENT_UPDATE_FAILED',
  );
  return body.appointment;
}

export async function saveDoctorWorkingSchedule(
  firebaseUser: User,
  workingSchedule: WorkingSchedule,
): Promise<WorkingSchedule> {
  const res = await fetch('/api/doctor/schedule', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ workingSchedule }),
  });
  const body = await parseJsonOrThrow<{ workingSchedule: WorkingSchedule }>(
    res,
    'SCHEDULE_UPDATE_FAILED',
  );
  return body.workingSchedule;
}

export async function createDoctorPatient(
  firebaseUser: User,
  input: {
    fullName: string;
    phone: string;
    dateOfBirth?: string;
    gender?: 'male' | 'female';
    bloodType?: string;
    allergies?: string;
    chronicConditions?: string;
    address?: string;
  },
): Promise<DoctorPatientRecord> {
  const res = await fetch('/api/doctor/patients', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ patient: DoctorPatientRecord }>(
    res,
    'PATIENT_CREATE_FAILED',
  );
  return body.patient;
}

export async function addPatientVisitRecord(
  firebaseUser: User,
  input: {
    patientRecordId: string;
    visitDate: string;
    visitTime?: string;
    visitReason?: string;
    chiefComplaint: string;
    diagnosis: string;
    clinicalNotes: string;
    procedures?: string;
    treatmentRecommendations?: string;
    appointmentId?: string;
    clientSubmissionKey?: string;
    vitals?: PatientVisitRecord['vitals'];
    attachments?: UploadedDocMeta[];
    createPrescription?: {
      medications: MedicationItem[];
      doctorNotes?: string;
      prescribedDate?: string;
    };
  },
): Promise<{
  visit: PatientVisitRecord;
  prescription?: PrescriptionRecord | null;
  duplicate?: boolean;
}> {
  const res = await fetch('/api/doctor/visits', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{
    visit: PatientVisitRecord;
    prescription?: PrescriptionRecord | null;
    duplicate?: boolean;
  }>(res, 'VISIT_CREATE_FAILED');
}

export async function createDoctorPrescription(
  firebaseUser: User,
  input: {
    patientRecordId: string;
    visitId?: string;
    prescribedDate: string;
    medications: MedicationItem[];
    doctorNotes?: string;
  },
): Promise<PrescriptionRecord> {
  const res = await fetch('/api/doctor/prescriptions', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ prescription: PrescriptionRecord }>(
    res,
    'PRESCRIPTION_CREATE_FAILED',
  );
  return body.prescription;
}

export async function searchDoctorMedicines(
  firebaseUser: User,
  params: { q: string; governorate?: string },
): Promise<DoctorMedicineSearchItem[]> {
  const qs = new URLSearchParams();
  qs.set('q', params.q.trim());
  if (params.governorate) qs.set('governorate', params.governorate.trim());
  const res = await fetch(`/api/doctor/medicines/search?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ medicines: DoctorMedicineSearchItem[] }>(
    res,
    'DOCTOR_MEDICINES_SEARCH_FAILED',
  );
  return body.medicines || [];
}

export async function createDiagnosticOrder(
  firebaseUser: User,
  input: {
    patientRecordId: string;
    orderType: DiagnosticOrderType;
    targetFacilityName?: string;
    requestedTests: string[];
    clinicalIndication?: string;
    priority: 'routine' | 'urgent';
  },
): Promise<DiagnosticOrderRecord> {
  const res = await fetch('/api/doctor/diagnostics', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ order: DiagnosticOrderRecord }>(
    res,
    'DIAGNOSTIC_ORDER_FAILED',
  );
  return body.order;
}

export async function updateDiagnosticOrderResult(
  firebaseUser: User,
  orderId: string,
  input: {
    status: DiagnosticOrderStatus;
    resultSummary?: string;
    doctorNotes?: string;
    resultFiles?: UploadedDocMeta[];
  },
): Promise<DiagnosticOrderRecord> {
  const res = await fetch(
    `/api/doctor/diagnostics/${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  const body = await parseJsonOrThrow<{ order: DiagnosticOrderRecord }>(
    res,
    'DIAGNOSTIC_UPDATE_FAILED',
  );
  return body.order;
}

export async function openOrCreateConversation(
  firebaseUser: User,
  patientRecordId: string,
): Promise<DoctorConversation> {
  const res = await fetch('/api/doctor/conversations', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ patientRecordId }),
  });
  const body = await parseJsonOrThrow<{ conversation: DoctorConversation }>(
    res,
    'CONVERSATION_CREATE_FAILED',
  );
  return body.conversation;
}

export async function fetchConversationMessages(
  firebaseUser: User,
  conversationId: string,
): Promise<DoctorMessageRecord[]> {
  const res = await fetch(
    `/api/doctor/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      headers: await authHeaders(firebaseUser),
    },
  );
  const body = await parseJsonOrThrow<{ messages: DoctorMessageRecord[] }>(
    res,
    'MESSAGES_LOAD_FAILED',
  );
  return body.messages || [];
}

export async function sendDoctorMessage(
  firebaseUser: User,
  conversationId: string,
  input: { text: string; attachments?: UploadedDocMeta[] },
): Promise<DoctorMessageRecord> {
  const res = await fetch(
    `/api/doctor/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  const body = await parseJsonOrThrow<{ message: DoctorMessageRecord }>(
    res,
    'MESSAGE_SEND_FAILED',
  );
  return body.message;
}

export async function saveDoctorClinicInfo(
  firebaseUser: User,
  input: {
    clinicName: string;
    governorate: string;
    district: string;
    workAddress: string;
    professionalPhone: string;
    mapLocationUrl?: string;
    workDaysAndHours: string;
    consultationFee: number;
    clinicPhotoUrl?: string;
    clinicServices: string[];
  },
): Promise<DoctorPortalProfile> {
  const res = await fetch('/api/doctor/clinic', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ doctorProfile: DoctorPortalProfile }>(
    res,
    'CLINIC_UPDATE_FAILED',
  );
  return body.doctorProfile;
}

export async function decideClinicStaffRequest(
  firebaseUser: User,
  memberId: string,
  input: {
    uid: string;
    decision: 'approve' | 'reject';
    permissions?: SecretaryPermissionKey[];
  },
): Promise<void> {
  const res = await fetch(
    `/api/doctor/staff/${encodeURIComponent(memberId)}/decision`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'STAFF_DECISION_FAILED');
}

export async function updateClinicStaffPermissions(
  firebaseUser: User,
  memberId: string,
  input: {
    status?: ClinicStaffMember['status'];
    permissions?: SecretaryPermissionKey[];
  },
): Promise<void> {
  const res = await fetch(
    `/api/doctor/staff/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'STAFF_UPDATE_FAILED');
}

export async function uploadDoctorStorageAsset(
  firebaseUserOrUid: User | string,
  folder:
    | 'avatars'
    | 'doctor_banners'
    | 'clinic_photos'
    | 'patient_records'
    | 'diagnostic_results'
    | 'message_files',
  file: File,
  meta?: {
    patientRecordId?: string;
    conversationId?: string;
  },
): Promise<UploadedDocMeta & { storagePath: string }> {
  const activeUser =
    typeof firebaseUserOrUid === 'string' ? auth.currentUser : firebaseUserOrUid;
  if (!activeUser) {
    throw new Error('UNAUTHENTICATED');
  }

  const kind =
    folder === 'avatars'
      ? 'avatar'
      : folder === 'clinic_photos' || folder === 'doctor_banners'
        ? 'image'
        : 'clinical_doc';

  if (kind === 'clinical_doc' && !CLINICAL_MIMES.has(file.type) && !file.type.startsWith('image/')) {
    throw new Error('INVALID_DOC_TYPE');
  }
  if (kind === 'image' && !IMAGE_MIMES.has(file.type) && !file.type.startsWith('image/')) {
    throw new Error('INVALID_IMAGE_TYPE');
  }

  const prepared = await prepareUploadPayloadFromFile(file, {
    kind,
    defaultBaseName: folder,
  });

  const endpoint =
    folder === 'avatars' ? '/api/doctor/avatar/upload' : '/api/doctor/files/upload';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: await authHeaders(activeUser),
    body: JSON.stringify({
      folder,
      dataBase64: prepared.dataBase64,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      ...(meta?.patientRecordId ? { patientRecordId: meta.patientRecordId } : {}),
      ...(meta?.conversationId ? { conversationId: meta.conversationId } : {}),
    }),
  });

  const body = await parseJsonOrThrow<{
    ok: boolean;
    file: UploadedDocMeta & { storagePath: string };
  }>(res, folder === 'avatars' ? 'AVATAR_UPLOAD_FAILED' : 'FILE_UPLOAD_FAILED');

  return {
    name: body.file.name || prepared.fileName,
    size: body.file.size || prepared.preparedFile.size,
    mimeType: body.file.mimeType || prepared.mimeType,
    url: body.file.url,
    storagePath: body.file.storagePath || '',
    uploadedAtIso: body.file.uploadedAtIso || new Date().toISOString(),
  };
}

export async function uploadDoctorAvatar(
  firebaseUser: User,
  file: File,
): Promise<UploadedDocMeta & { storagePath: string }> {
  return uploadDoctorStorageAsset(firebaseUser, 'avatars', file);
}

export async function saveDoctorAvatar(
  firebaseUser: User,
  input: {
    avatarUrl: string;
    avatarPath?: string;
  },
): Promise<DoctorPortalProfile> {
  const res = await fetch('/api/doctor/avatar', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ doctorProfile: DoctorPortalProfile }>(
    res,
    'DOCTOR_AVATAR_SAVE_FAILED',
  );
  return body.doctorProfile;
}

async function uploadDoctorBannerViaServer(
  firebaseUser: User,
  file: File,
): Promise<{ url: string; storagePath: string }> {
  const dataBase64 = await fileToDataUrl(file);
  const res = await fetch('/api/doctor/promotional-banner/upload', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({
      dataBase64,
      mimeType: file.type,
      fileName: file.name,
    }),
  });
  const body = await parseJsonOrThrow<{
    ok: boolean;
    url: string;
    storagePath: string;
  }>(res, 'PROMO_BANNER_STORAGE_UPLOAD_FAILED');
  if (!body.url || !body.storagePath || !isValidStorageImageUrl(body.url, body.storagePath)) {
    throw new Error('PROMO_BANNER_STORAGE_UPLOAD_FAILED');
  }
  return { url: body.url, storagePath: body.storagePath };
}

export async function saveDoctorPromotionalBanner(
  firebaseUser: User,
  params: {
    file?: File | null;
    removeBanner?: boolean;
    oldBannerPath?: string;
    promotionalTagline?: string;
    currentBannerUrl?: string;
  },
): Promise<DoctorPortalProfile> {
  let nextUrl = params.currentBannerUrl || '';
  let nextPath = params.oldBannerPath || '';

  if (params.removeBanner) {
    nextUrl = '';
    nextPath = '';
  } else if (params.file) {
    const preparedFile = await prepareNormalizedImageFile(params.file, {
      maxBytes: 900 * 1024,
      maxWidth: 1600,
      defaultBaseName: 'doctor_banner',
    });
    const serverUploaded = await uploadDoctorBannerViaServer(
      firebaseUser,
      preparedFile,
    );
    nextUrl = serverUploaded.url;
    nextPath = serverUploaded.storagePath;
  }

  const res = await fetch('/api/doctor/promotional-banner', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({
      promotionalBannerUrl: nextUrl,
      promotionalBannerPath: nextPath,
      promotionalTagline: params.promotionalTagline || '',
    }),
  });
  const body = await parseJsonOrThrow<{ doctorProfile: DoctorPortalProfile }>(
    res,
    'PROMO_BANNER_UPDATE_FAILED',
  );
  return body.doctorProfile;
}

export async function saveDoctorSettings(
  firebaseUser: User,
  input: {
    professionalPhone?: string;
    avatarUrl?: string;
    avatarPath?: string;
    subSpecialty?: string;
    languages?: string[];
    notificationPrefs?: DoctorNotificationPrefs;
    privacyPrefs?: DoctorPrivacyPrefs;
  },
): Promise<DoctorPortalProfile> {
  const res = await fetch('/api/doctor/settings', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ doctorProfile: DoctorPortalProfile }>(
    res,
    'DOCTOR_SETTINGS_FAILED',
  );
  return body.doctorProfile;
}

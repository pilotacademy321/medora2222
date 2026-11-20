import { type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { prepareUploadPayloadFromFile } from '../utils/imagePreparation';
import type { GenderType, UploadedDocMeta, UserAccount } from '../types/medora';
import type { DoctorAppointment, DoctorMessageRecord } from '../types/doctor';
import type {
  DoctorReviewRecord,
  FacilityBookingRecord,
  LabDirectoryCard,
  MedicalRecordShareRecord,
  MedicalSharePermissions,
  MedoraAdRecord,
  PatientFeedbackCategory,
  PatientFeedbackRecord,
  PatientMedicalFileCategory,
  PatientMedicalFileRecord,
  PatientMessageThreadResult,
  PatientPreferences,
  PatientProfileDocument,
  PatientWorkspaceData,
} from '../types/patient';
import type {
  LabConversationRecord,
  LabHomeCollectionRequest,
  LabMessageRecord,
  LabReviewRecord,
} from '../types/lab';

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

export async function fetchActiveMedoraAds(): Promise<MedoraAdRecord[]> {
  const res = await fetch('/api/ads/active');
  const body = await parseJsonOrThrow<{ ads: MedoraAdRecord[] }>(
    res,
    'ADS_FETCH_FAILED',
  );
  return body.ads || [];
}

export async function fetchPatientWorkspace(
  firebaseUser: User,
): Promise<PatientWorkspaceData> {
  const res = await fetch('/api/patient/workspace', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<PatientWorkspaceData>(res, 'PATIENT_WORKSPACE_FAILED');
}

export async function addFavoriteDoctor(
  firebaseUser: User,
  doctorUid: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/favorites/${encodeURIComponent(doctorUid)}`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'FAVORITE_ADD_FAILED');
}

export async function removeFavoriteDoctor(
  firebaseUser: User,
  doctorUid: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/favorites/${encodeURIComponent(doctorUid)}`,
    {
      method: 'DELETE',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'FAVORITE_REMOVE_FAILED');
}

export async function cancelPatientAppointment(
  firebaseUser: User,
  appointmentId: string,
  cancelledReason?: string,
): Promise<DoctorAppointment> {
  const res = await fetch(
    `/api/patient/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify({ cancelledReason: cancelledReason || '' }),
    },
  );
  const body = await parseJsonOrThrow<{ appointment: DoctorAppointment }>(
    res,
    'APPOINTMENT_CANCEL_FAILED',
  );
  return body.appointment;
}

export async function reschedulePatientAppointment(
  firebaseUser: User,
  appointmentId: string,
  input: { date: string; time: string },
): Promise<DoctorAppointment> {
  const res = await fetch(
    `/api/patient/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  const body = await parseJsonOrThrow<{ appointment: DoctorAppointment }>(
    res,
    'APPOINTMENT_RESCHEDULE_FAILED',
  );
  return body.appointment;
}

export async function uploadPatientStorageAsset(
  firebaseUserOrUid: User | string,
  folder: 'avatars' | 'patient_records' | 'message_files',
  file: File,
  meta?: { conversationId?: string },
): Promise<UploadedDocMeta> {
  const activeUser =
    typeof firebaseUserOrUid === 'string' ? auth.currentUser : firebaseUserOrUid;
  if (!activeUser) {
    throw new Error('UNAUTHENTICATED');
  }

  const isImageOnly = folder === 'avatars';
  const prepared = await prepareUploadPayloadFromFile(file, {
    kind: isImageOnly ? 'avatar' : 'clinical_doc',
    defaultBaseName: folder,
  });

  const res = await fetch('/api/patient/files/upload', {
    method: 'POST',
    headers: await authHeaders(activeUser),
    body: JSON.stringify({
      folder,
      dataBase64: prepared.dataBase64,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      ...(meta?.conversationId ? { conversationId: meta.conversationId } : {}),
    }),
  });

  const body = await parseJsonOrThrow<{
    ok: boolean;
    file: UploadedDocMeta;
  }>(res, 'FILE_UPLOAD_FAILED');

  return {
    name: body.file.name || prepared.fileName,
    size: body.file.size || prepared.preparedFile.size,
    mimeType: body.file.mimeType || prepared.mimeType,
    url: body.file.url,
    storagePath: body.file.storagePath || '',
    uploadedAtIso: body.file.uploadedAtIso || new Date().toISOString(),
  };
}

export async function createPatientMedicalFile(
  firebaseUser: User,
  input: {
    title: string;
    category: PatientMedicalFileCategory;
    documentDate: string;
    notes?: string;
    file: UploadedDocMeta;
  },
): Promise<PatientMedicalFileRecord> {
  const res = await fetch('/api/patient/medical-files', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{
    fileRecord?: PatientMedicalFileRecord;
    medicalFile?: PatientMedicalFileRecord;
  }>(res, 'MEDICAL_FILE_SAVE_FAILED');
  const saved = body.fileRecord || body.medicalFile;
  if (!saved) {
    throw new Error('MEDICAL_FILE_SAVE_FAILED');
  }
  return saved;
}

export async function deletePatientMedicalFile(
  firebaseUser: User,
  fileId: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/medical-files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'MEDICAL_FILE_DELETE_FAILED');
}

export async function createMedicalRecordShare(
  firebaseUser: User,
  input: {
    doctorUid: string;
    permissions: MedicalSharePermissions;
    expiresAt: string | null;
  },
): Promise<MedicalRecordShareRecord> {
  const res = await fetch('/api/patient/shares', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ share: MedicalRecordShareRecord }>(
    res,
    'SHARE_CREATE_FAILED',
  );
  return body.share;
}

export async function updateMedicalRecordShare(
  firebaseUser: User,
  shareId: string,
  input: Partial<{
    permissions: MedicalSharePermissions;
    expiresAt: string | null;
    revoked: boolean;
  }>,
): Promise<MedicalRecordShareRecord> {
  const res = await fetch(`/api/patient/shares/${encodeURIComponent(shareId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ share: MedicalRecordShareRecord }>(
    res,
    'SHARE_UPDATE_FAILED',
  );
  return body.share;
}

export async function deleteMedicalRecordShare(
  firebaseUser: User,
  shareId: string,
): Promise<void> {
  const res = await fetch(`/api/patient/shares/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'SHARE_DELETE_FAILED');
}

export async function fetchLabsDirectory(
  firebaseUser: User,
): Promise<LabDirectoryCard[]> {
  const res = await fetch('/api/patient/labs', {
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ labs: LabDirectoryCard[] }>(
    res,
    'LABS_FETCH_FAILED',
  );
  return body.labs || [];
}

export async function bookLabAppointment(
  firebaseUser: User,
  input: {
    labUid: string;
    requestedServices: string[];
    date: string;
    time: string;
    notes?: string;
    patientPhone?: string;
  },
): Promise<FacilityBookingRecord> {
  const res = await fetch('/api/patient/labs/book', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ booking: FacilityBookingRecord }>(
    res,
    'LAB_BOOKING_FAILED',
  );
  return body.booking;
}

export async function cancelLabBooking(
  firebaseUser: User,
  bookingId: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/labs/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'LAB_CANCEL_FAILED');
}

export async function openOrCreatePatientConversation(
  firebaseUser: User,
  doctorUid: string,
): Promise<PatientMessageThreadResult> {
  const res = await fetch('/api/patient/conversations', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ doctorUid }),
  });
  return parseJsonOrThrow<PatientMessageThreadResult>(
    res,
    'PATIENT_CONVERSATION_FAILED',
  );
}

export async function fetchPatientMessages(
  firebaseUser: User,
  conversationId: string,
): Promise<DoctorMessageRecord[]> {
  const res = await fetch(
    `/api/patient/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      headers: await authHeaders(firebaseUser),
    },
  );
  const body = await parseJsonOrThrow<{ messages: DoctorMessageRecord[] }>(
    res,
    'PATIENT_MESSAGES_FAILED',
  );
  return body.messages || [];
}

export async function sendPatientMessage(
  firebaseUser: User,
  conversationId: string,
  input: { text: string; attachments?: UploadedDocMeta[] },
): Promise<DoctorMessageRecord> {
  const res = await fetch(
    `/api/patient/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  const body = await parseJsonOrThrow<{ message: DoctorMessageRecord }>(
    res,
    'PATIENT_MESSAGE_SEND_FAILED',
  );
  return body.message;
}

export async function markNotificationRead(
  firebaseUser: User,
  notificationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/patient/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'PATCH',
      headers: await authHeaders(firebaseUser),
    },
  );
  await parseJsonOrThrow<{ ok: boolean }>(res, 'NOTIFICATION_READ_FAILED');
}

export async function markAllNotificationsRead(
  firebaseUser: User,
): Promise<void> {
  const res = await fetch('/api/patient/notifications/read-all', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'NOTIFICATIONS_READ_ALL_FAILED');
}

export async function submitDoctorReview(
  firebaseUser: User,
  input: { appointmentId: string; rating: number; comment: string },
): Promise<DoctorReviewRecord> {
  const res = await fetch('/api/patient/reviews', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ review: DoctorReviewRecord }>(
    res,
    'REVIEW_SUBMIT_FAILED',
  );
  return body.review;
}

export async function submitPatientFeedback(
  firebaseUser: User,
  input: {
    category: PatientFeedbackCategory;
    subject: string;
    message: string;
    relatedDoctorUid?: string;
  },
): Promise<PatientFeedbackRecord> {
  const res = await fetch('/api/patient/feedback', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ feedback: PatientFeedbackRecord }>(
    res,
    'FEEDBACK_SUBMIT_FAILED',
  );
  return body.feedback;
}

export async function savePatientSettings(
  firebaseUser: User,
  input: {
    fullName?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: GenderType;
    governorate?: string;
    district?: string;
    address?: string;
    avatarUrl?: string;
    avatarPath?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelation?: string;
    preferences?: PatientPreferences;
  },
): Promise<{
  userAccount: UserAccount;
  patientProfile: PatientProfileDocument;
  preferences: PatientPreferences;
}> {
  const res = await fetch('/api/patient/settings', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{
    userAccount: UserAccount;
    patientProfile: PatientProfileDocument;
    preferences: PatientPreferences;
  }>(res, 'PATIENT_SETTINGS_SAVE_FAILED');
}

export async function requestLabHomeCollection(
  firebaseUser: User,
  input: {
    labUid: string;
    address: string;
    governorate?: string;
    district?: string;
    requestedDate: string;
    preferredWindow: string;
    requestedTests: string[];
    patientPhone?: string;
    notes?: string;
  },
): Promise<LabHomeCollectionRequest> {
  const res = await fetch('/api/patient/labs/home-collection', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ homeCollection: LabHomeCollectionRequest }>(
    res,
    'HOME_COLLECTION_CREATE_FAILED',
  );
  return body.homeCollection;
}

export async function submitPatientLabReview(
  firebaseUser: User,
  input: {
    labUid: string;
    rating: number;
    reviewType: 'review' | 'complaint';
    comment: string;
    bookingId?: string;
  },
): Promise<LabReviewRecord> {
  const res = await fetch('/api/patient/labs/reviews', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ review: LabReviewRecord }>(
    res,
    'LAB_REVIEW_CREATE_FAILED',
  );
  return body.review;
}

export async function openOrCreatePatientLabConversation(
  firebaseUser: User,
  labUid: string,
): Promise<LabConversationRecord> {
  const res = await fetch('/api/patient/lab-conversations', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ labUid }),
  });
  const body = await parseJsonOrThrow<{ conversation: LabConversationRecord }>(
    res,
    'LAB_CONVERSATION_CREATE_FAILED',
  );
  return body.conversation;
}

export async function fetchPatientLabMessages(
  firebaseUser: User,
  conversationId: string,
): Promise<LabMessageRecord[]> {
  const res = await fetch(
    `/api/patient/lab-conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      headers: await authHeaders(firebaseUser),
    },
  );
  const body = await parseJsonOrThrow<{ messages: LabMessageRecord[] }>(
    res,
    'LAB_MESSAGES_LOAD_FAILED',
  );
  return body.messages || [];
}

export async function sendPatientLabMessage(
  firebaseUser: User,
  conversationId: string,
  input: { text: string; attachments?: UploadedDocMeta[] },
): Promise<LabMessageRecord> {
  const res = await fetch(
    `/api/patient/lab-conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(input),
    },
  );
  const body = await parseJsonOrThrow<{ message: LabMessageRecord }>(
    res,
    'LAB_MESSAGE_SEND_FAILED',
  );
  return body.message;
}


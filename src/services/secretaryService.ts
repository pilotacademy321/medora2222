import type { User } from 'firebase/auth';
import type {
  AnySecretaryPermission,
  EmployerSecretaryWorkspace,
  EmployerType,
  InitialTaskTemplate,
  SecretaryCandidateSummary,
  SecretaryEmploymentRecord,
  SecretaryEmploymentStatus,
  SecretaryInvitationRecord,
  SecretaryPortalWorkspaceData,
  SecretaryProfileRecord,
  SecretaryTaskRecord,
} from '../types/secretary';
import type { RegistrationRequest } from '../types/medora';

async function authFetch<T>(
  firebaseUser: User,
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await firebaseUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const body = (await res.json().catch(() => ({}))) as T & {
    ok?: boolean;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || body.message || `HTTP_${res.status}`);
  }
  return body;
}

export async function registerIndependentSecretary(
  firebaseUser: User,
  payload: {
    phone: string;
    educationQualification: string;
    previousExperience?: string;
    bio?: string;
    acceptedTerms: boolean;
  },
): Promise<{ request: RegistrationRequest; profile: SecretaryProfileRecord }> {
  return authFetch(firebaseUser, '/api/secretary/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function probeSecretaryAccess(firebaseUser: User): Promise<{
  hasAccess: boolean;
  hasProfile: boolean;
  pendingInvitationsCount: number;
  activeEmploymentsCount: number;
}> {
  return authFetch(firebaseUser, '/api/secretary/access', { method: 'GET' });
}

export async function fetchSecretaryWorkspace(
  firebaseUser: User,
  employmentId?: string | null,
): Promise<SecretaryPortalWorkspaceData> {
  const qs = employmentId ? `?employmentId=${encodeURIComponent(employmentId)}` : '';
  return authFetch(firebaseUser, `/api/secretary/workspace${qs}`, { method: 'GET' });
}

export async function acceptSecretaryInvitation(
  firebaseUser: User,
  invitationId: string,
): Promise<{
  invitation: SecretaryInvitationRecord;
  employment: SecretaryEmploymentRecord;
}> {
  return authFetch(
    firebaseUser,
    `/api/secretary/invitations/${encodeURIComponent(invitationId)}/accept`,
    { method: 'POST' },
  );
}

export async function rejectSecretaryInvitation(
  firebaseUser: User,
  invitationId: string,
): Promise<{ invitation: SecretaryInvitationRecord }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/invitations/${encodeURIComponent(invitationId)}/reject`,
    { method: 'POST' },
  );
}

export async function updateIndependentSecretaryProfile(
  firebaseUser: User,
  payload: {
    fullName: string;
    phone: string;
    governorate?: string;
    district?: string;
    educationQualification: string;
    previousExperience?: string;
    bio?: string;
  },
): Promise<{ profile: SecretaryProfileRecord }> {
  return authFetch(firebaseUser, '/api/secretary/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function markSecretaryNotificationRead(
  firebaseUser: User,
  notificationId: string,
): Promise<{ ok: boolean }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'PATCH' },
  );
}

export async function markAllSecretaryNotificationsRead(
  firebaseUser: User,
): Promise<{ ok: boolean }> {
  return authFetch(firebaseUser, '/api/secretary/notifications/read-all', {
    method: 'POST',
  });
}

export async function updateSecretaryTaskStatus(
  firebaseUser: User,
  taskId: string,
  status: 'todo' | 'in_progress' | 'done',
): Promise<{ task: SecretaryTaskRecord }> {
  return authFetch(firebaseUser, `/api/secretary/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function createScopedDoctorAppointment(
  firebaseUser: User,
  employmentId: string,
  payload: {
    patientName: string;
    patientPhone: string;
    date: string;
    time: string;
    visitType?: 'scheduled' | 'walk_in' | 'follow_up';
    isWaitlist?: boolean;
    reason?: string;
    autoConfirm?: boolean;
  },
): Promise<{ appointment: Record<string, unknown> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/doctor/appointments`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function updateScopedDoctorAppointment(
  firebaseUser: User,
  employmentId: string,
  appointmentId: string,
  payload: {
    status?: string;
    isWaitlist?: boolean;
  },
): Promise<{ appointment: Record<string, unknown> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/doctor/appointments/${encodeURIComponent(appointmentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchScopedMessages(
  firebaseUser: User,
  employmentId: string,
  conversationId: string,
): Promise<{ messages: Array<Record<string, unknown>> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'GET' },
  );
}

export async function sendScopedMessage(
  firebaseUser: User,
  employmentId: string,
  conversationId: string,
  text: string,
): Promise<{ message: Record<string, unknown> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
  );
}

export async function updateScopedLabBooking(
  firebaseUser: User,
  employmentId: string,
  bookingId: string,
  payload: {
    status?: string;
    registerArrival?: boolean;
  },
): Promise<{ booking: Record<string, unknown> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/lab/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function updateScopedLabOrderTracking(
  firebaseUser: User,
  employmentId: string,
  orderId: string,
  status: 'ordered' | 'sample_collected' | 'in_lab',
): Promise<{ status: string }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/lab/orders/${encodeURIComponent(orderId)}/tracking`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}

export async function createScopedPharmacyItem(
  firebaseUser: User,
  employmentId: string,
  payload: {
    kind: 'order' | 'pickup_booking' | 'inventory' | 'supplier_order';
    title: string;
    counterpartyName?: string;
    status?: string;
    quantity?: number;
    scheduledDate?: string;
    notes?: string;
  },
): Promise<{ item: Record<string, unknown> }> {
  return authFetch(
    firebaseUser,
    `/api/secretary/employments/${encodeURIComponent(employmentId)}/pharmacy/items`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

// ---------------------------------------------------------------------------
// Employer Hiring & Management APIs (Doctor, Lab, Pharmacy)
// ---------------------------------------------------------------------------

export async function searchEmployerSecretaries(
  firebaseUser: User,
  employerType: EmployerType,
  q: string,
): Promise<{ candidates: SecretaryCandidateSummary[] }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/search?q=${encodeURIComponent(q)}`,
    { method: 'GET' },
  );
}

export async function fetchEmployerSecretaryWorkspace(
  firebaseUser: User,
  employerType: EmployerType,
): Promise<EmployerSecretaryWorkspace> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/workspace`,
    { method: 'GET' },
  );
}

export async function sendSecretaryInvitation(
  firebaseUser: User,
  employerType: EmployerType,
  payload: {
    secretaryQuery?: string;
    secretaryUid?: string;
    message?: string;
    proposedPermissions: AnySecretaryPermission[];
    initialTasks?: InitialTaskTemplate[];
    expiryDays?: number;
  },
): Promise<{ invitation: SecretaryInvitationRecord }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/invitations`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function revokeSecretaryInvitation(
  firebaseUser: User,
  employerType: EmployerType,
  invitationId: string,
): Promise<{ invitation: SecretaryInvitationRecord }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/invitations/${encodeURIComponent(invitationId)}/revoke`,
    { method: 'POST' },
  );
}

export async function updateSecretaryEmployment(
  firebaseUser: User,
  employerType: EmployerType,
  employmentId: string,
  payload: {
    status?: SecretaryEmploymentStatus;
    permissions?: AnySecretaryPermission[];
    statusReason?: string;
  },
): Promise<{ employment: SecretaryEmploymentRecord }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/employments/${encodeURIComponent(employmentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function createEmployerSecretaryTask(
  firebaseUser: User,
  employerType: EmployerType,
  payload: {
    employmentId: string;
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
    dueDate?: string;
  },
): Promise<{ task: SecretaryTaskRecord }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/tasks`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export async function updateEmployerSecretaryTask(
  firebaseUser: User,
  employerType: EmployerType,
  taskId: string,
  payload: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    status?: 'todo' | 'in_progress' | 'done';
    dueDate?: string;
  },
): Promise<{ task: SecretaryTaskRecord }> {
  return authFetch(
    firebaseUser,
    `/api/employer/${encodeURIComponent(employerType)}/secretaries/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

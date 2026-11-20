import type {
  DoctorSectionId,
  DoctorWorkspaceData,
  SecretaryPermissionKey,
} from '../types/doctor';

export type DoctorSectionRule =
  | 'all'
  | 'doctor_only'
  | readonly SecretaryPermissionKey[];

export const DOCTOR_SECTION_PERMISSIONS: Record<DoctorSectionId, DoctorSectionRule> = {
  overview: 'all',
  appointments: [
    'viewAppointments',
    'manageAppointments',
    'manageWaitlist',
    'editClinicSchedule',
  ],
  patients: ['viewPatientBasic', 'viewMedicalRecords'],
  prescriptions: 'doctor_only',
  diagnostics: ['viewMedicalRecords', 'uploadLabResults'],
  pharmacy_orders: 'doctor_only',
  messages: ['messagePatients'],
  clinic_staff: 'doctor_only',
  reports: 'all',
  promotional_banner: 'doctor_only',
  settings: 'all',
};

export function canAccessDoctorSection(
  workspace: Pick<DoctorWorkspaceData, 'actorRole' | 'permissions'> | null | undefined,
  section: DoctorSectionId | string,
): boolean {
  if (!workspace) return false;
  if (!(section in DOCTOR_SECTION_PERMISSIONS)) return false;

  const rule = DOCTOR_SECTION_PERMISSIONS[section as DoctorSectionId];
  if (rule === 'all') return true;
  if (workspace.actorRole === 'doctor') {
    return true;
  }
  if (rule === 'doctor_only') {
    return false;
  }
  const perms = Array.isArray(workspace.permissions) ? workspace.permissions : [];
  return rule.some((perm) => perms.includes(perm));
}

export function resolveSafeDoctorSection(
  workspace: Pick<DoctorWorkspaceData, 'actorRole' | 'permissions'> | null | undefined,
  requestedSection: DoctorSectionId | string,
  fallbackSection: DoctorSectionId = 'overview',
): DoctorSectionId {
  if (canAccessDoctorSection(workspace, requestedSection)) {
    return requestedSection as DoctorSectionId;
  }
  if (canAccessDoctorSection(workspace, fallbackSection)) {
    return fallbackSection;
  }
  return 'overview';
}

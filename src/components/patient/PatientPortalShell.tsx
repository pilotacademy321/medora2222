import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquareWarning,
  Moon,
  Pill,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../../constants/brand';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { useMedora } from '../../contexts/MedoraContext';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import {
  fetchPublicDoctorDetails,
  fetchPublicDoctorDirectory,
} from '../../services/doctorService';
import {
  addFavoriteDoctor,
  fetchLabsDirectory,
  fetchPatientWorkspace,
  openOrCreatePatientLabConversation,
  removeFavoriteDoctor,
} from '../../services/patientService';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import type { PublicDoctorCard } from '../../types/doctor';
import type {
  LabDirectoryCard,
  MedoraAdRecord,
  PatientNotificationRecord,
  PatientSectionId,
  PatientWorkspaceData,
} from '../../types/patient';
import { DoctorPublicCard } from '../directory/DoctorPublicCard';
import { DoctorPublicProfileModal } from '../directory/DoctorPublicProfileModal';
import { PatientAppointmentsSection } from './PatientAppointmentsSection';
import { PatientDoctorSearchSection } from './PatientDoctorSearchSection';
import {
  FacilityBookingModal,
  FacilityDirectoryCard,
  normalizeLabFacility,
  PatientFacilitiesSection,
  type NormalizedFacility,
} from './PatientFacilitiesSection';
import { PatientFavoritesSection } from './PatientFavoritesSection';
import { PatientFeedbackSection } from './PatientFeedbackSection';
import { MedoraTargetedAdShowcase } from '../shared/MedoraTargetedAdShowcase';
import {
  PatientMedicalRecordSection,
  type MedicalRecordTabId,
} from './PatientMedicalRecordSection';
import { PatientMessagesSection } from './PatientMessagesSection';
import { HaneenAvatar } from './HaneenAvatar';
import { PatientHaneenSection } from './PatientHaneenSection';
import { PatientNotificationsSection } from './PatientNotificationsSection';
import { PatientSettingsSection } from './PatientSettingsSection';
import { PatientMedicineFinderSection } from './PatientMedicineFinderSection';

function matchesHomeGov(val: string, govId: string): boolean {
  const gov = IRAQ_GOVERNORATES.find((g) => g.id === govId);
  if (!gov) return false;
  const n = val.trim().toLowerCase();
  return (
    n === gov.id.toLowerCase() ||
    n === gov.ar.toLowerCase() ||
    n === gov.en.toLowerCase()
  );
}

interface PatientPortalShellProps {
  onExitPortal: () => void;
  onOpenStatus: () => void;
  onCompletePatientRegistration: () => void;
  initialPharmacyStoreId?: string | null;
  onConsumedPharmacyStore?: () => void;
}

interface PatientNavSpec {
  id: PatientSectionId;
  icon: typeof Home;
}

const PATIENT_NAV_ITEMS: PatientNavSpec[] = [
  { id: 'home_ads', icon: Home },
  { id: 'haneen_ai', icon: Sparkles },
  { id: 'doctor_search', icon: Search },
  { id: 'my_appointments', icon: CalendarCheck2 },
  { id: 'favorites', icon: Star },
  { id: 'medical_record', icon: ClipboardList },
  { id: 'medicine_finder', icon: Pill },
  { id: 'labs', icon: FlaskConical },
  { id: 'messages', icon: MessageSquare },
  { id: 'notifications', icon: Bell },
  { id: 'feedback', icon: MessageSquareWarning },
  { id: 'settings', icon: Settings },
];

export function PatientPortalShell({
  onExitPortal,
  onOpenStatus,
  onCompletePatientRegistration,
  initialPharmacyStoreId,
  onConsumedPharmacyStore,
}: PatientPortalShellProps) {
  const {
    firebaseUser,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    logout,
  } = useMedora();
  const pt = PATIENT_TRANSLATIONS[language];

  const [section, setSection] = useState<PatientSectionId>(
    initialPharmacyStoreId ? 'medicine_finder' : 'home_ads',
  );
  const [medicalRecordInitialTab, setMedicalRecordInitialTab] =
    useState<MedicalRecordTabId>('visits');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [workspace, setWorkspace] = useState<PatientWorkspaceData | null>(null);
  const [doctors, setDoctors] = useState<PublicDoctorCard[]>([]);
  const [labs, setLabs] = useState<LabDirectoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [homeSearch, setHomeSearch] = useState('');
  const [homeGovernorateId, setHomeGovernorateId] = useState('');
  const [homeCategory, setHomeCategory] = useState<'doctors' | 'labs'>(
    'doctors',
  );
  const [homeBookingNotice, setHomeBookingNotice] = useState<string | null>(
    null,
  );

  const [activeDoctorModal, setActiveDoctorModal] = useState<{
    doctor: PublicDoctorCard;
    focusBooking: boolean;
  } | null>(null);

  const [activeFacilityModal, setActiveFacilityModal] = useState<{
    mode: 'lab';
    facility: NormalizedFacility;
  } | null>(null);
  const [messageChannelFocus, setMessageChannelFocus] = useState<'doctors' | 'labs'>('doctors');
  const [focusedLabConvId, setFocusedLabConvId] = useState<string | undefined>(undefined);
  const [haneenInitialResultId, setHaneenInitialResultId] = useState<string | null>(null);
  const [finderInitialRxId, setFinderInitialRxId] = useState<string | null>(null);
  const [finderInitialStoreId, setFinderInitialStoreId] = useState<string | null>(
    initialPharmacyStoreId || null,
  );
  const [haneenQuickOpen, setHaneenQuickOpen] = useState(false);

  useEffect(() => {
    if (initialPharmacyStoreId) {
      setFinderInitialStoreId(initialPharmacyStoreId);
      setSection('medicine_finder');
    }
  }, [initialPharmacyStoreId]);
  const prefersReducedMotion = useReducedMotion();

  const loadWorkspaceAndDoctors = useCallback(async () => {
    if (!firebaseUser) return;
    setErrorCode(null);
    try {
      const [wsData, docList, labList] = await Promise.all([
        fetchPatientWorkspace(firebaseUser),
        fetchPublicDoctorDirectory().catch(() => []),
        fetchLabsDirectory(firebaseUser).catch(() => []),
      ]);
      setWorkspace(wsData);
      setDoctors(docList);
      setLabs(labList);
    } catch (err) {
      setErrorCode(
        err instanceof Error ? err.message : 'PATIENT_WORKSPACE_FAILED',
      );
    }
  }, [firebaseUser]);

  const refreshWorkspaceOnly = useCallback(async () => {
    if (!firebaseUser) return;
    const wsData = await fetchPatientWorkspace(firebaseUser);
    setWorkspace(wsData);
  }, [firebaseUser]);

  useEffect(() => {
    setLoading(true);
    loadWorkspaceAndDoctors().finally(() => setLoading(false));
  }, [loadWorkspaceAndDoctors]);

  useRealtimeNotifications<PatientNotificationRecord>({
    collectionName: 'patient_notifications',
    uidField: 'patientUid',
    uid: firebaseUser?.uid,
    enabled: Boolean(workspace && firebaseUser?.uid),
    onUpdate: (items) => {
      setWorkspace((prev) => (prev ? { ...prev, notifications: items } : prev));
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWorkspaceAndDoctors();
    setRefreshing(false);
  };

  const handleToggleFavorite = async (doctor: PublicDoctorCard) => {
    if (!firebaseUser || !workspace) return;
    const currentlyFav = workspace.favoriteDoctorUids.includes(doctor.doctorUid);
    // Optimistic update
    setWorkspace((prev) => {
      if (!prev) return prev;
      const nextFavs = currentlyFav
        ? prev.favoriteDoctorUids.filter((id) => id !== doctor.doctorUid)
        : [doctor.doctorUid, ...prev.favoriteDoctorUids];
      return { ...prev, favoriteDoctorUids: nextFavs };
    });
    try {
      if (currentlyFav) {
        await removeFavoriteDoctor(firebaseUser, doctor.doctorUid);
      } else {
        await addFavoriteDoctor(firebaseUser, doctor.doctorUid);
      }
    } catch {
      await refreshWorkspaceOnly();
    }
  };

  const handleBookFromAd = async (ad: MedoraAdRecord, isBookable = true) => {
    setHomeBookingNotice(null);
    const entityType = ad.entityType || 'doctor';
    const targetUid = ad.entityUid || ad.doctorUid;

    if (entityType === 'lab') {
      const matchedLab =
        ad.labCard || labs.find((l) => l.labUid === targetUid) || null;
      if (matchedLab) {
        setActiveFacilityModal({
          mode: 'lab',
          facility: normalizeLabFacility(matchedLab),
        });
        return;
      }
      setActiveFacilityModal({
        mode: 'lab',
        facility: {
          uid: targetUid,
          name: ad.entityName || ad.doctorName || ad.clinicName,
          governorate: '',
          district: '',
          address: ad.clinicName || '',
          workDaysAndHours: '',
          services: [],
          catalog: [],
        },
      });
      return;
    }

    const matched =
      ad.doctorCard ||
      doctors.find((d) => d.doctorUid === targetUid) ||
      null;
    if (matched) {
      setActiveDoctorModal({
        doctor: matched,
        focusBooking: isBookable && matched.hasAvailableSlots !== false,
      });
      return;
    }
    try {
      const details = await fetchPublicDoctorDetails(targetUid);
      setActiveDoctorModal({
        doctor: details.doctor,
        focusBooking: isBookable && details.doctor.hasAvailableSlots !== false,
      });
    } catch {
      // Fallback to minimal doctor card so modal can still inspect/load
      setActiveDoctorModal({
        doctor: {
          doctorUid: targetUid,
          fullName: ad.entityName || ad.doctorName,
          specialty: ad.specialty,
          governorate: '',
          district: '',
          clinicName: ad.clinicName,
          workAddress: '',
          workDaysAndHours: '',
          consultationDurationMinutes: 20,
          showFee: false,
          bookingConfirmationMode: 'manual',
          hasAvailableSlots: false,
          availableSlotsCount: 0,
        },
        focusBooking: false,
      });
    }
  };

  const handlePatientAdAction = (ad: MedoraAdRecord) => {
    const validPatientSections: PatientSectionId[] = [
      'home_ads',
      'haneen_ai',
      'doctor_search',
      'my_appointments',
      'favorites',
      'medical_record',
      'medicine_finder',
      'labs',
      'messages',
      'notifications',
      'feedback',
      'settings',
    ];
    if (ad.actionType === 'open_portal_tab' && ad.destinationTarget) {
      if (validPatientSections.includes(ad.destinationTarget as PatientSectionId)) {
        setSection(ad.destinationTarget as PatientSectionId);
        return;
      }
    }
    if (ad.entityType === 'pharmacy') {
      const storeId = ad.pharmacyCard?.pharmacyUid || ad.entityUid || null;
      if (storeId) {
        setFinderInitialStoreId(storeId);
      }
      setSection('medicine_finder');
      return;
    }
    if (ad.entityType === 'platform_service') {
      const target = ad.destinationTarget as PatientSectionId | undefined;
      if (target && validPatientSections.includes(target)) {
        setSection(target);
      } else {
        setSection('haneen_ai');
      }
      return;
    }
    void handleBookFromAd(ad, true);
  };

  const filteredHomeDoctors = useMemo(() => {
    const q = homeSearch.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (homeGovernorateId && !matchesHomeGov(doc.governorate, homeGovernorateId)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        doc.fullName,
        doc.specialty,
        doc.subSpecialty || '',
        doc.clinicName,
        doc.governorate,
        doc.district,
        doc.workAddress,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [doctors, homeSearch, homeGovernorateId]);

  const filteredHomeLabs = useMemo(() => {
    const q = homeSearch.trim().toLowerCase();
    return labs.map(normalizeLabFacility).filter((fac) => {
      if (homeGovernorateId && !matchesHomeGov(fac.governorate, homeGovernorateId)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        fac.name,
        fac.nameEn || '',
        fac.governorate,
        fac.district,
        fac.address,
        ...fac.services,
        ...fac.catalog.map((c) => c.name),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [labs, homeSearch, homeGovernorateId]);

  const BackArrow = language === 'ar' ? ArrowRight : ArrowLeft;
  const CollapseIcon =
    language === 'ar'
      ? sidebarCollapsed
        ? ChevronLeft
        : ChevronRight
      : sidebarCollapsed
        ? ChevronRight
        : ChevronLeft;

  if (!firebaseUser || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-[#030712] dark:text-slate-300">
        {pt.loadingWorkspace}
      </div>
    );
  }

  if (errorCode || !workspace) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-[#030712]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-[#07122a]">
          <img
            src={MEDORA_LOGO_URL}
            alt="MEDORA"
            className="medora-logo-adaptive mx-auto h-14 w-auto object-contain"
          />
          <h1 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">
            {pt.accessDeniedTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {pt.accessDeniedBody}
          </p>
          {errorCode && (
            <p className="mt-3 font-latin text-xs text-rose-600 dark:text-rose-400">
              {errorCode}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={
                errorCode === 'PATIENT_PORTAL_REQUIRED' ||
                errorCode === 'USER_ACCOUNT_MISSING'
                  ? onCompletePatientRegistration
                  : onOpenStatus
              }
              className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
            >
              {pt.completeRegistrationBtn}
            </button>
            <button
              type="button"
              onClick={onExitPortal}
              className="min-h-[42px] rounded-xl border border-slate-300 px-5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {pt.backToHome}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unreadMessagesCount = workspace.conversations.reduce(
    (sum, c) => sum + (c.unreadByPatient || 0),
    0,
  );
  const unreadNotificationsCount = workspace.notifications.filter(
    (n) => !n.isRead,
  ).length;
  const patientName =
    workspace.patientProfile?.fullName ||
    workspace.userAccount.fullName ||
    firebaseUser.displayName ||
    '';
  const patientPhone =
    workspace.patientProfile?.phone || workspace.userAccount.phone || '';

  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside
        className={`medora-no-print hidden shrink-0 flex-col justify-between border-e border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-[#061028] lg:flex ${
          sidebarCollapsed ? 'w-[84px]' : 'w-[272px]'
        }`}
      >
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
            {!sidebarCollapsed && (
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={MEDORA_LOGO_URL}
                  alt="MEDORA"
                  className="medora-logo-adaptive h-9 w-auto shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="font-latin truncate text-sm font-bold tracking-wider text-[#0c3585] dark:text-[#f4d378]">
                    {pt.brandTitle}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {patientName}
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label="Toggle sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3">
            {PATIENT_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              const badge =
                item.id === 'messages'
                  ? unreadMessagesCount
                  : item.id === 'notifications'
                    ? unreadNotificationsCount
                    : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'medical_record') {
                      setMedicalRecordInitialTab('visits');
                    }
                    setSection(item.id);
                  }}
                  title={pt.nav[item.id]}
                  className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{pt.nav[item.id]}</span>
                    )}
                  </span>
                  {!sidebarCollapsed && badge > 0 && (
                    <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onExitPortal}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900 cursor-pointer"
          >
            <BackArrow className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{pt.backToHome}</span>}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span>{pt.signOutBtn}</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="medora-no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 flex-col justify-between overflow-y-auto bg-white p-4 dark:bg-[#061028]"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <span className="font-latin text-sm font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {pt.brandTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-500 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {PATIENT_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  const badge =
                    item.id === 'messages'
                      ? unreadMessagesCount
                      : item.id === 'notifications'
                        ? unreadNotificationsCount
                        : 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'medical_record') {
                          setMedicalRecordInitialTab('visits');
                        }
                        setSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold cursor-pointer ${
                        active
                          ? 'bg-[#0c3585] text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{pt.nav[item.id]}</span>
                      </span>
                      {badge > 0 && (
                        <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={onExitPortal}
                className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                <BackArrow className="h-4 w-4" />
                <span>{pt.backToHome}</span>
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-600 dark:border-rose-900 dark:text-rose-400 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>{pt.signOutBtn}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="medora-no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-[#061028]/95 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {pt.nav[section]}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {patientName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSection('haneen_ai')}
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold text-[#040917] cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{language === 'ar' ? 'اسأل حنين' : 'Ask Haneen'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">{pt.refreshBtn}</span>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 font-latin text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              {language === 'ar' ? 'EN' : 'AR'}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#f4d378]" />
              ) : (
                <Moon className="h-4 w-4 text-[#0c3585]" />
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {section === 'home_ads' && (
            <div className="space-y-6">
              {/* 1. Super Admin Targeted Ads Carousel */}
              <MedoraTargetedAdShowcase
                portal="patient"
                language={language}
                firebaseUser={firebaseUser}
                onAdAction={handlePatientAdAction}
              />

              {homeBookingNotice && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{homeBookingNotice}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setHomeBookingNotice(null)}
                    className="text-xs font-bold opacity-75 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* 1.5 Ask Haneen Educational Assistant Spotlight (Patient Portal Only) */}
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#0c3585]/20 bg-white p-4 shadow-sm dark:border-[#d9a43b]/30 dark:bg-[#07122a] sm:px-5">
                <div className="flex items-center gap-3.5">
                  <HaneenAvatar size="md" language={language} />
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {language === 'ar' ? 'اسألني' : 'Ask Me'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {language === 'ar'
                        ? 'مساعد تثقيفي للمريض فقط · تشرح المديات المرجعية والتحضيرات باللهجة العراقية البسيطة استناداً إلى مصادر طبية موثوقة.'
                        : 'Patient-only educational assistant · Explains reference ranges and test preparations from trusted sources.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('haneen_ai')}
                  className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-xs font-extrabold text-[#040917] cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>{language === 'ar' ? 'اسأل حنين الآن' : 'Ask Haneen Now'}</span>
                </button>
              </section>

              {/* 2. Unified Search Bar */}
              <section
                aria-label={pt.homeWorkspace.searchPlaceholder}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a] sm:p-5"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="relative sm:col-span-8">
                    <Search
                      className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={homeSearch}
                      onChange={(e) => setHomeSearch(e.target.value)}
                      placeholder={pt.homeWorkspace.searchPlaceholder}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-10 pe-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0c3585] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-[#f4d378]"
                    />
                    {homeSearch && (
                      <button
                        type="button"
                        onClick={() => setHomeSearch('')}
                        aria-label={pt.homeWorkspace.clearSearch}
                        className="absolute end-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={homeGovernorateId}
                      onChange={(e) => setHomeGovernorateId(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 focus:border-[#0c3585] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-[#f4d378]"
                    >
                      <option value="">{pt.homeWorkspace.allGovernorates}</option>
                      {IRAQ_GOVERNORATES.map((gov) => (
                        <option key={gov.id} value={gov.id}>
                          {language === 'ar' ? gov.ar : gov.en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* 3. Category Selector: Doctors | Labs */}
              <div
                role="tablist"
                aria-label="Provider Categories"
                className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
              >
                {(
                  [
                    {
                      id: 'doctors' as const,
                      label: pt.homeWorkspace.categories.doctors,
                      count: filteredHomeDoctors.length,
                      Icon: Stethoscope,
                    },
                    {
                      id: 'labs' as const,
                      label: pt.homeWorkspace.categories.labs,
                      count: filteredHomeLabs.length,
                      Icon: FlaskConical,
                    },
                  ] as const
                ).map(({ id, label, count, Icon }) => {
                  const selected = homeCategory === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setHomeCategory(id)}
                      className={`flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-2.5 text-xs font-bold transition-colors whitespace-nowrap sm:px-4 sm:text-sm cursor-pointer ${
                        selected
                          ? 'bg-[#0c3585] text-white shadow-sm dark:bg-[#d9a43b] dark:text-[#040917]'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{label}</span>
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-latin text-[11px] font-bold tabular-nums ${
                          selected
                            ? 'bg-white/20 text-white dark:bg-[#040917]/15 dark:text-[#040917]'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 4. Category Results Grid */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="font-latin text-sm font-extrabold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                      {homeCategory === 'doctors'
                        ? filteredHomeDoctors.length
                        : filteredHomeLabs.length}
                    </span>{' '}
                    {pt.homeWorkspace.resultsCountLabel}
                  </p>
                  {(homeSearch.trim() || homeGovernorateId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setHomeSearch('');
                        setHomeGovernorateId('');
                      }}
                      className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
                    >
                      {pt.homeWorkspace.clearSearch}
                    </button>
                  )}
                </div>

                {homeCategory === 'doctors' && (
                  <>
                    {filteredHomeDoctors.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
                        {pt.homeWorkspace.emptyCategorySearch}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {filteredHomeDoctors.map((doc) => (
                          <DoctorPublicCard
                            key={doc.doctorUid}
                            doctor={doc}
                            language={language}
                            isFavorite={workspace.favoriteDoctorUids.includes(
                              doc.doctorUid,
                            )}
                            onToggleFavorite={(target) =>
                              void handleToggleFavorite(target)
                            }
                            onViewProfile={(target) =>
                              setActiveDoctorModal({
                                doctor: target,
                                focusBooking: false,
                              })
                            }
                            onBookAppointment={(target) =>
                              setActiveDoctorModal({
                                doctor: target,
                                focusBooking: true,
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {homeCategory === 'labs' && (
                  <>
                    {filteredHomeLabs.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
                        {pt.homeWorkspace.emptyCategorySearch}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {filteredHomeLabs.map((fac) => (
                          <FacilityDirectoryCard
                            key={fac.uid}
                            fac={fac}
                            language={language}
                            onBook={(facility) => {
                              setHomeBookingNotice(null);
                              setActiveFacilityModal({ mode: 'lab', facility });
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

              </section>
            </div>
          )}

          {section === 'doctor_search' && (
            <PatientDoctorSearchSection
              doctors={doctors}
              favoriteDoctorUids={workspace.favoriteDoctorUids}
              language={language}
              onToggleFavorite={(doc) => void handleToggleFavorite(doc)}
              onViewProfile={(doc) =>
                setActiveDoctorModal({ doctor: doc, focusBooking: false })
              }
              onBookAppointment={(doc) =>
                setActiveDoctorModal({ doctor: doc, focusBooking: true })
              }
            />
          )}

          {section === 'my_appointments' && (
            <PatientAppointmentsSection
              firebaseUser={firebaseUser}
              appointments={workspace.appointments}
              language={language}
              onRefreshWorkspace={refreshWorkspaceOnly}
            />
          )}

          {section === 'favorites' && (
            <PatientFavoritesSection
              doctors={doctors}
              favoriteDoctorUids={workspace.favoriteDoctorUids}
              language={language}
              onToggleFavorite={(doc) => void handleToggleFavorite(doc)}
              onViewProfile={(doc) =>
                setActiveDoctorModal({ doctor: doc, focusBooking: false })
              }
              onBookAppointment={(doc) =>
                setActiveDoctorModal({ doctor: doc, focusBooking: true })
              }
              onBrowseDoctors={() => setSection('doctor_search')}
            />
          )}

          {section === 'haneen_ai' && (
            <PatientHaneenSection
              firebaseUser={firebaseUser}
              workspace={workspace}
              language={language}
              initialResultId={haneenInitialResultId}
              onConsumedInitialResult={() => setHaneenInitialResultId(null)}
            />
          )}

          {section === 'medical_record' && (
            <PatientMedicalRecordSection
              firebaseUser={firebaseUser}
              workspace={workspace}
              doctors={doctors}
              language={language}
              initialTab={medicalRecordInitialTab}
              onRefreshWorkspace={refreshWorkspaceOnly}
              onAskHaneenAboutResult={(resultId) => {
                setHaneenInitialResultId(resultId);
                setSection('haneen_ai');
              }}
              onOpenMedicineFinder={(prescriptionId) => {
                setFinderInitialRxId(prescriptionId);
                setSection('medicine_finder');
              }}
            />
          )}

          {section === 'medicine_finder' && (
            <PatientMedicineFinderSection
              firebaseUser={firebaseUser}
              workspace={workspace}
              language={language}
              initialPrescriptionId={finderInitialRxId}
              onConsumedInitialPrescription={() => setFinderInitialRxId(null)}
              initialStorefrontId={finderInitialStoreId}
              onConsumedInitialStorefront={() => {
                setFinderInitialStoreId(null);
                onConsumedPharmacyStore?.();
              }}
            />
          )}

          {section === 'labs' && (
            <PatientFacilitiesSection
              mode="lab"
              firebaseUser={firebaseUser}
              bookings={workspace.labBookings}
              homeCollections={workspace.labHomeCollections || []}
              defaultPhone={patientPhone}
              language={language}
              onRefreshWorkspace={refreshWorkspaceOnly}
              onOpenLabChat={async (labUid) => {
                const conv = await openOrCreatePatientLabConversation(firebaseUser, labUid);
                await refreshWorkspaceOnly();
                setFocusedLabConvId(conv.conversationId);
                setMessageChannelFocus('labs');
                setSection('messages');
              }}
            />
          )}

          {section === 'messages' && (
            <PatientMessagesSection
              firebaseUser={firebaseUser}
              conversations={workspace.conversations}
              labConversations={workspace.labConversations || []}
              labs={labs}
              initialChannel={messageChannelFocus}
              initialLabConversationId={focusedLabConvId}
              doctors={doctors}
              language={language}
              onRefreshWorkspace={refreshWorkspaceOnly}
            />
          )}

          {section === 'notifications' && (
            <PatientNotificationsSection
              firebaseUser={firebaseUser}
              notifications={workspace.notifications}
              language={language}
              onRefreshWorkspace={refreshWorkspaceOnly}
              onNavigateAction={(route) => {
                if (route.section === 'medical_record') {
                  if (
                    route.tab === 'diagnostics' ||
                    route.tab === 'prescriptions' ||
                    route.tab === 'visits' ||
                    route.tab === 'files' ||
                    route.tab === 'sharing'
                  ) {
                    setMedicalRecordInitialTab(route.tab);
                  }
                  setSection('medical_record');
                  return;
                }
                if (route.section === 'messages') {
                  if (route.tab === 'labs' || route.tab === 'doctors') {
                    setMessageChannelFocus(route.tab);
                  }
                  setSection('messages');
                  return;
                }
                if (
                  route.section === 'my_appointments' ||
                  route.section === 'labs' ||
                  route.section === 'settings' ||
                  route.section === 'doctor_search' ||
                  route.section === 'favorites' ||
                  route.section === 'haneen_ai'
                ) {
                  setSection(route.section);
                }
              }}
            />
          )}

          {section === 'feedback' && (
            <PatientFeedbackSection
              firebaseUser={firebaseUser}
              feedbackList={workspace.feedback}
              doctors={doctors}
              language={language}
              onRefreshWorkspace={refreshWorkspaceOnly}
            />
          )}

          {section === 'settings' && (
            <PatientSettingsSection
              firebaseUser={firebaseUser}
              workspace={workspace}
              onRefreshWorkspace={refreshWorkspaceOnly}
              onOpenSharingTab={() => {
                setMedicalRecordInitialTab('sharing');
                setSection('medical_record');
              }}
            />
          )}
        </main>
      </div>

      {activeDoctorModal && (
        <DoctorPublicProfileModal
          doctor={activeDoctorModal.doctor}
          focusBooking={activeDoctorModal.focusBooking}
          isFavorite={workspace.favoriteDoctorUids.includes(
            activeDoctorModal.doctor.doctorUid,
          )}
          onToggleFavorite={(doc) => void handleToggleFavorite(doc)}
          onBooked={refreshWorkspaceOnly}
          onClose={() => setActiveDoctorModal(null)}
        />
      )}

      {activeFacilityModal && (
        <FacilityBookingModal
          mode={activeFacilityModal.mode}
          facility={activeFacilityModal.facility}
          firebaseUser={firebaseUser}
          defaultPhone={patientPhone}
          language={language}
          onClose={() => setActiveFacilityModal(null)}
          onBooked={async () => {
            setHomeBookingNotice(pt.facilities.bookingSuccessMsg);
            await refreshWorkspaceOnly();
          }}
        />
      )}

      {/* Floating Official Haneen Icon on Patient Home */}
      {section === 'home_ads' && !haneenQuickOpen && (
        <button
          type="button"
          onClick={() => setHaneenQuickOpen(true)}
          aria-label={language === 'ar' ? 'فتح نافذة حنين الذكية' : 'Open HANEEN AI Assistant'}
          title={language === 'ar' ? 'المحادثة مع حنين الذكية' : 'Chat with HANEEN AI'}
          className="medora-no-print group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] end-5 z-40 flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4d378] cursor-pointer"
        >
          <HaneenAvatar size="fab" language={language} />
        </button>
      )}

      {/* Haneen Quick Assistant Modal */}
      <AnimatePresence>
        {haneenQuickOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            onClick={() => setHaneenQuickOpen(false)}
            className="medora-no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={language === 'ar' ? 'نافذة حنين الذكية' : 'HANEEN AI Assistant Window'}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-violet-400/35 bg-slate-50 p-4 shadow-[0_24px_70px_-15px_rgba(109,40,217,0.55)] dark:border-[#d9a43b]/35 dark:bg-[#050d22] sm:max-h-[88dvh] sm:max-w-3xl sm:rounded-3xl sm:p-6"
            >
              <div className="mb-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setHaneenQuickOpen(false)}
                  aria-label={language === 'ar' ? 'إغلاق نافذة حنين' : 'Close Haneen window'}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-[#0c3585] hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <PatientHaneenSection
                firebaseUser={firebaseUser}
                workspace={workspace}
                language={language}
                initialResultId={haneenInitialResultId}
                onConsumedInitialResult={() => setHaneenInitialResultId(null)}
                compactModal
                onExpandFull={() => {
                  setHaneenQuickOpen(false);
                  setSection('haneen_ai');
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

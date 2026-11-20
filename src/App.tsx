/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { GoogleAuthEntry } from './components/GoogleAuthEntry';
import { MedoraIntroStage } from './components/MedoraIntroStage';
import { PersonalInfoForm } from './components/PersonalInfoForm';
import { PortalFormWrapper } from './components/PortalFormWrapper';
import { PortalSelectionView } from './components/PortalSelectionView';
import { PreLoginPortalSelectionView } from './components/PreLoginPortalSelectionView';
import { RequestStatusView } from './components/RequestStatusView';
import { ReviewAndSubmitView } from './components/ReviewAndSubmitView';
import { SuperAdminShell } from './components/SuperAdminShell';
import { DoctorDirectoryView } from './components/directory/DoctorDirectoryView';
import { DoctorPortalShell } from './components/doctor/DoctorPortalShell';
import { LabPortalShell } from './components/lab/LabPortalShell';
import { PatientPortalShell } from './components/patient/PatientPortalShell';
import { PharmacyPortalShell } from './components/pharmacy/PharmacyPortalShell';
import { SecretaryPortalShell } from './components/secretary/SecretaryPortalShell';
import { WholesalerPortalShell } from './components/wholesaler/WholesalerPortalShell';
import { ImagingPortalDisabledView } from './components/ImagingPortalDisabledView';
import { MedoraProvider, useMedora } from './contexts/MedoraContext';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  isImagingPortalIdentifier,
  isImagingRouteLocation,
} from './config/featureFlags';
import { probeLabAccess } from './services/labService';
import { probePharmacyAccess } from './services/pharmacyService';
import { probeSecretaryAccess } from './services/secretaryService';
import { probeWholesalerAccess } from './services/wholesalerService';
import type {
  PortalFormPayload,
  PortalIntent,
  PortalType,
  RegistrationRequest,
  UserAccount,
} from './types/medora';

type OnboardingStep =
  | 'intro'
  | 'portal_select'
  | 'doctor_directory'
  | 'doctor_portal'
  | 'patient_portal'
  | 'lab_portal'
  | 'pharmacy_portal'
  | 'wholesaler_portal'
  | 'secretary_portal'
  | 'imaging_disabled'
  | 'auth'
  | 'personal'
  | 'portals'
  | 'portal_form'
  | 'review'
  | 'status'
  | 'super_admin';

type DraftMap = Partial<Record<PortalType, PortalFormPayload>>;

function getDraftStorageKey(uid: string): string {
  return `medora_drafts_${uid}`;
}

function readDraftsFromStorage(uid: string): DraftMap {
  try {
    const raw = window.sessionStorage.getItem(getDraftStorageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraftsToStorage(uid: string, drafts: DraftMap): void {
  try {
    if (Object.keys(drafts).length === 0) {
      window.sessionStorage.removeItem(getDraftStorageKey(uid));
    } else {
      window.sessionStorage.setItem(
        getDraftStorageKey(uid),
        JSON.stringify(drafts),
      );
    }
  } catch {
    // Ignore storage quota issues gracefully
  }
}

function MedoraFlowRouter() {
  const {
    firebaseUser,
    userAccount,
    requests,
    authLoading,
    authError,
    isSuperAdmin,
    adminCheckDone,
    reverifySuperAdmin,
    imagingPortalEnabled,
    imagingAccessBlocked,
    hasOtherAllowedPortal,
    imagingBlockedRouteNotice,
    clearImagingBlockedRouteNotice,
    portalIntent,
    setPortalIntent,
    pendingRedirectRoute,
    consumePendingRedirectRoute,
    logout,
    t,
  } = useMedora();

  const [step, setStep] = useState<OnboardingStep>(() => {
    if (
      !CLIENT_IMAGING_PORTAL_ENABLED &&
      isImagingRouteLocation(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      )
    ) {
      return 'imaging_disabled';
    }
    if (window.location.pathname === '/super-admin') return 'super_admin';
    try {
      const savedStep = window.sessionStorage.getItem('medora_active_step');
      if (savedStep === 'imaging_disabled' && !CLIENT_IMAGING_PORTAL_ENABLED) {
        return 'imaging_disabled';
      }
      if (
        savedStep === 'portal_select' ||
        savedStep === 'doctor_directory' ||
        savedStep === 'doctor_portal' ||
        savedStep === 'patient_portal' ||
        savedStep === 'lab_portal' ||
        savedStep === 'pharmacy_portal' ||
        savedStep === 'wholesaler_portal' ||
        savedStep === 'secretary_portal' ||
        savedStep === 'auth' ||
        savedStep === 'personal' ||
        savedStep === 'portals' ||
        savedStep === 'portal_form' ||
        savedStep === 'status'
      ) {
        return savedStep as OnboardingStep;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'intro';
  });
  const [selectedPortal, setSelectedPortal] = useState<PortalType | null>(() => {
    try {
      const savedPortal = window.sessionStorage.getItem('medora_selected_portal');
      if (
        savedPortal === 'patient' ||
        savedPortal === 'doctor' ||
        savedPortal === 'lab' ||
        savedPortal === 'pharmacy' ||
        savedPortal === 'wholesaler' ||
        savedPortal === 'secretary'
      ) {
        return savedPortal;
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  });
  const [draftsByPortal, setDraftsByPortal] = useState<DraftMap>({});
  const [justSubmittedRequest, setJustSubmittedRequest] =
    useState<RegistrationRequest | null>(null);
  const [highlightedPortal, setHighlightedPortal] = useState<PortalType | null>(
    null,
  );
  const [initialPharmacyStoreId, setInitialPharmacyStoreId] = useState<string | null>(() => {
    try {
      const store = new URLSearchParams(window.location.search).get('pharmacyStore');
      return store ? store.trim() : null;
    } catch {
      return null;
    }
  });
  const [editingPersonalFromPortal, setEditingPersonalFromPortal] =
    useState(false);

  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (step === 'intro') {
        window.sessionStorage.removeItem('medora_active_step');
      } else {
        window.sessionStorage.setItem('medora_active_step', step);
      }
    } catch {
      // Ignore storage errors
    }
  }, [step]);

  useEffect(() => {
    try {
      if (selectedPortal) {
        window.sessionStorage.setItem('medora_selected_portal', selectedPortal);
      } else {
        window.sessionStorage.removeItem('medora_selected_portal');
      }
    } catch {
      // Ignore storage errors
    }
  }, [selectedPortal]);

  // Sync browser back/forward navigation with /super-admin and blocked /imaging routes
  useEffect(() => {
    const handlePopState = () => {
      if (
        !imagingPortalEnabled &&
        isImagingRouteLocation(
          window.location.pathname,
          window.location.search,
          window.location.hash,
        )
      ) {
        setStep('imaging_disabled');
        return;
      }
      if (window.location.pathname === '/super-admin') {
        setStep('super_admin');
      } else if (step === 'super_admin') {
        setStep('portal_select');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [step, imagingPortalEnabled]);

  useEffect(() => {
    if (!imagingPortalEnabled && imagingBlockedRouteNotice) {
      setStep('imaging_disabled');
    }
  }, [imagingPortalEnabled, imagingBlockedRouteNotice]);

  // Enforce Imaging Portal account lock after session hydration (preserve legacy data, block entry)
  useEffect(() => {
    if (
      !authLoading &&
      adminCheckDone &&
      firebaseUser &&
      !imagingPortalEnabled &&
      imagingAccessBlocked &&
      !isSuperAdmin &&
      !hasOtherAllowedPortal &&
      step !== 'intro' &&
      step !== 'portal_select' &&
      step !== 'doctor_directory' &&
      step !== 'imaging_disabled'
    ) {
      setStep('imaging_disabled');
    }
  }, [
    authLoading,
    adminCheckDone,
    firebaseUser,
    imagingPortalEnabled,
    imagingAccessBlocked,
    isSuperAdmin,
    hasOtherAllowedPortal,
    step,
  ]);

  // Reset/load per-user drafts ONLY when UID actually changes (never on authLoading transitions)
  useEffect(() => {
    const nextUid = firebaseUser?.uid ?? null;
    if (prevUidRef.current !== nextUid) {
      const hadPrevUid = prevUidRef.current !== null;
      prevUidRef.current = nextUid;
      if (hadPrevUid || nextUid === null) {
        setSelectedPortal(null);
      }
      setJustSubmittedRequest(null);
      setHighlightedPortal(null);
      setEditingPersonalFromPortal(false);
      setDraftsByPortal(nextUid ? readDraftsFromStorage(nextUid) : {});
    }
  }, [firebaseUser?.uid]);

  // Redirect unauthenticated users back to auth/portal_select if session ends outside public routes
  useEffect(() => {
    if (
      !authLoading &&
      !firebaseUser &&
      step !== 'intro' &&
      step !== 'portal_select' &&
      step !== 'doctor_directory' &&
      step !== 'imaging_disabled' &&
      step !== 'auth' &&
      step !== 'super_admin'
    ) {
      setStep(portalIntent ? 'auth' : 'portal_select');
    }
  }, [authLoading, firebaseUser, step, portalIntent]);

  // Route based on explicit portalIntent and server-verified permissions
  const routeAfterAuth = useCallback(
    (
      intent: PortalIntent | null,
      account: UserAccount,
      userRequests: RegistrationRequest[],
      verifiedAdmin: boolean,
      blockedByImagingLock = imagingAccessBlocked,
      otherPortalAllowed = hasOtherAllowedPortal,
    ) => {
      if (
        !imagingPortalEnabled &&
        intent &&
        isImagingPortalIdentifier(intent as string)
      ) {
        setStep('imaging_disabled');
        return;
      }

      if (intent === 'super_admin') {
        if (verifiedAdmin) {
          window.history.pushState({}, '', '/super-admin');
          setStep('super_admin');
        } else {
          // Stay strictly on auth screen where unauthorized alert & switch account are displayed
          setStep('auth');
        }
        return;
      }

      if (
        !imagingPortalEnabled &&
        blockedByImagingLock &&
        !verifiedAdmin &&
        !otherPortalAllowed
      ) {
        setStep('imaging_disabled');
        return;
      }

      if (intent) {
        setSelectedPortal(intent);
        setHighlightedPortal(intent);
        setJustSubmittedRequest(null);

        if (!account.personalProfileCompleted) {
          setStep('personal');
          return;
        }

        const existingForIntent = userRequests.find(
          (r) => r.portalType === intent,
        );
        if (intent === 'lab') {
          if (existingForIntent?.status === 'Approved') {
            setStep('lab_portal');
            return;
          }
          if (firebaseUser) {
            void probeLabAccess(firebaseUser)
              .then((res) => {
                if (res.hasAccess) {
                  setStep('lab_portal');
                } else {
                  setStep(existingForIntent ? 'status' : 'portal_form');
                }
              })
              .catch(() => {
                setStep(existingForIntent ? 'status' : 'portal_form');
              });
            return;
          }
        }
        if (intent === 'pharmacy') {
          if (existingForIntent?.status === 'Approved') {
            setStep('pharmacy_portal');
            return;
          }
          if (firebaseUser) {
            void probePharmacyAccess(firebaseUser)
              .then((res) => {
                if (res.hasAccess) {
                  setStep('pharmacy_portal');
                } else {
                  setStep(existingForIntent ? 'status' : 'portal_form');
                }
              })
              .catch(() => {
                setStep(existingForIntent ? 'status' : 'portal_form');
              });
            return;
          }
        }
        if (intent === 'wholesaler') {
          if (existingForIntent?.status === 'Approved') {
            setStep('wholesaler_portal');
            return;
          }
          if (firebaseUser) {
            void probeWholesalerAccess(firebaseUser)
              .then((res) => {
                if (res.hasAccess) {
                  setStep('wholesaler_portal');
                } else {
                  setStep(existingForIntent ? 'status' : 'portal_form');
                }
              })
              .catch(() => {
                setStep(existingForIntent ? 'status' : 'portal_form');
              });
            return;
          }
        }
        if (intent === 'secretary') {
          if (existingForIntent?.status === 'Approved') {
            setStep('secretary_portal');
            return;
          }
          if (firebaseUser) {
            void probeSecretaryAccess(firebaseUser)
              .then((res) => {
                if (res.hasAccess) {
                  setStep('secretary_portal');
                } else {
                  setStep(existingForIntent ? 'status' : 'portal_form');
                }
              })
              .catch(() => {
                setStep(existingForIntent ? 'status' : 'portal_form');
              });
            return;
          }
        }
        if (
          intent === 'doctor' &&
          existingForIntent?.status === 'Approved'
        ) {
          setStep('doctor_portal');
        } else if (
          intent === 'patient' &&
          existingForIntent?.status === 'Approved'
        ) {
          setStep('patient_portal');
        } else if (existingForIntent) {
          setStep('status');
        } else {
          setStep('portal_form');
        }
        return;
      }

      if (!account.personalProfileCompleted) {
        setStep('personal');
      } else if (userRequests.length > 0) {
        const approvedDoctor = userRequests.find(
          (r) => r.portalType === 'doctor' && r.status === 'Approved',
        );
        const approvedLab = userRequests.find(
          (r) => r.portalType === 'lab' && r.status === 'Approved',
        );
        const approvedPharmacy = userRequests.find(
          (r) => r.portalType === 'pharmacy' && r.status === 'Approved',
        );
        const approvedWholesaler = userRequests.find(
          (r) => r.portalType === 'wholesaler' && r.status === 'Approved',
        );
        const approvedSecretary = userRequests.find(
          (r) => r.portalType === 'secretary' && r.status === 'Approved',
        );
        const approvedPatient = userRequests.find(
          (r) => r.portalType === 'patient' && r.status === 'Approved',
        );
        if (initialPharmacyStoreId && approvedPatient) {
          setStep('patient_portal');
          return;
        }
        setStep(
          approvedDoctor
            ? 'doctor_portal'
            : approvedLab
              ? 'lab_portal'
              : approvedPharmacy
                ? 'pharmacy_portal'
                : approvedWholesaler
                  ? 'wholesaler_portal'
                  : approvedSecretary
                    ? 'secretary_portal'
                    : approvedPatient
                      ? 'patient_portal'
                      : 'status',
        );
      } else {
        setStep('portal_select');
      }
    },
    [firebaseUser, imagingPortalEnabled, imagingAccessBlocked, hasOtherAllowedPortal, initialPharmacyStoreId],
  );

  // When already on auth with super_admin intent and verified admin completes check, enter /super-admin
  useEffect(() => {
    if (
      !authLoading &&
      adminCheckDone &&
      firebaseUser &&
      isSuperAdmin &&
      portalIntent === 'super_admin' &&
      step === 'auth'
    ) {
      window.history.replaceState({}, '', '/super-admin');
      setStep('super_admin');
    }
  }, [authLoading, adminCheckDone, firebaseUser, isSuperAdmin, portalIntent, step]);

  // Handle returning from Google Sign-In Redirect flow
  useEffect(() => {
    if (!pendingRedirectRoute || authLoading) return;

    if (firebaseUser && userAccount && adminCheckDone) {
      consumePendingRedirectRoute();
      routeAfterAuth(portalIntent, userAccount, requests, isSuperAdmin);
    } else if (!firebaseUser && authError) {
      consumePendingRedirectRoute();
      setStep('auth');
    } else if (!firebaseUser && adminCheckDone) {
      consumePendingRedirectRoute();
    }
  }, [
    pendingRedirectRoute,
    authLoading,
    adminCheckDone,
    firebaseUser,
    userAccount,
    requests,
    isSuperAdmin,
    portalIntent,
    authError,
    consumePendingRedirectRoute,
    routeAfterAuth,
  ]);

  const handleSaveDraft = useCallback(
    (payload: PortalFormPayload) => {
      setDraftsByPortal((prev) => {
        const next: DraftMap = { ...prev, [payload.portal]: payload };
        if (firebaseUser?.uid) {
          writeDraftsToStorage(firebaseUser.uid, next);
        }
        return next;
      });
    },
    [firebaseUser?.uid],
  );

  const handleClearDraft = useCallback(
    (portal: PortalType) => {
      setDraftsByPortal((prev) => {
        const next: DraftMap = { ...prev };
        delete next[portal];
        if (firebaseUser?.uid) {
          writeDraftsToStorage(firebaseUser.uid, next);
        }
        return next;
      });
    },
    [firebaseUser?.uid],
  );

  const exitAdminRoute = () => {
    if (window.location.pathname === '/super-admin') {
      window.history.replaceState({}, '', '/');
    }
    setStep('portal_select');
  };

  const returnFromImagingDisabled = useCallback(() => {
    clearImagingBlockedRouteNotice();
    if (
      isImagingRouteLocation(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      )
    ) {
      window.history.replaceState({}, '', '/');
    }
    setStep('portal_select');
  }, [clearImagingBlockedRouteNotice]);

  if (step === 'imaging_disabled') {
    return (
      <ImagingPortalDisabledView
        accountBlocked={imagingAccessBlocked}
        onBackToHome={returnFromImagingDisabled}
        onContinueAllowedPortal={
          firebaseUser && userAccount && hasOtherAllowedPortal
            ? () => {
                clearImagingBlockedRouteNotice();
                if (
                  isImagingRouteLocation(
                    window.location.pathname,
                    window.location.search,
                    window.location.hash,
                  )
                ) {
                  window.history.replaceState({}, '', '/');
                }
                routeAfterAuth(
                  null,
                  userAccount,
                  requests,
                  isSuperAdmin,
                  imagingAccessBlocked,
                  hasOtherAllowedPortal,
                );
              }
            : undefined
        }
      />
    );
  }

  if (step === 'super_admin') {
    return <SuperAdminShell onExitAdminRoute={exitAdminRoute} />;
  }

  if (step === 'doctor_portal' && firebaseUser) {
    return (
      <DoctorPortalShell
        onExitPortal={() => setStep('portal_select')}
        onOpenStatus={() => setStep('status')}
        onOpenDirectory={() => setStep('doctor_directory')}
      />
    );
  }

  if (step === 'lab_portal' && firebaseUser) {
    return (
      <LabPortalShell
        firebaseUser={firebaseUser}
        onBackToMedora={() => setStep('portal_select')}
        onSignOut={logout}
      />
    );
  }

  if (step === 'pharmacy_portal' && firebaseUser) {
    return (
      <PharmacyPortalShell
        firebaseUser={firebaseUser}
        onBackToMedora={() => setStep('portal_select')}
        onSignOut={logout}
      />
    );
  }

  if (step === 'wholesaler_portal' && firebaseUser) {
    return (
      <WholesalerPortalShell
        firebaseUser={firebaseUser}
        onBackToMedora={() => setStep('portal_select')}
        onSignOut={logout}
      />
    );
  }

  if (step === 'secretary_portal' && firebaseUser) {
    return (
      <SecretaryPortalShell
        firebaseUser={firebaseUser}
        onExitPortal={() => setStep('portal_select')}
        onSignOut={logout}
      />
    );
  }

  if (step === 'patient_portal' && firebaseUser) {
    return (
      <PatientPortalShell
        onExitPortal={() => setStep('portal_select')}
        onOpenStatus={() => setStep('status')}
        initialPharmacyStoreId={initialPharmacyStoreId}
        onConsumedPharmacyStore={() => {
          setInitialPharmacyStoreId(null);
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('pharmacyStore')) {
              url.searchParams.delete('pharmacyStore');
              window.history.replaceState({}, '', url.toString());
            }
          } catch {
            // Ignore URL cleanup errors
          }
        }}
        onCompletePatientRegistration={() => {
          setPortalIntent('patient');
          setSelectedPortal('patient');
          setStep(
            userAccount?.personalProfileCompleted ? 'portal_form' : 'personal',
          );
        }}
      />
    );
  }

  if (
    step !== 'intro' &&
    step !== 'portal_select' &&
    step !== 'doctor_directory' &&
    authLoading
  ) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#030712] text-sm text-slate-300">
        {t.common.loading}
      </div>
    );
  }

  const activeDraftPayload = selectedPortal
    ? draftsByPortal[selectedPortal] ?? null
    : null;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <MedoraIntroStage
            key="medora-intro"
            onStartJourney={() => {
              setStep('portal_select');
            }}
          />
        )}

        {step === 'portal_select' && (
          <PreLoginPortalSelectionView
            key="medora-portal-select"
            onBackToIntro={() => setStep('intro')}
            onOpenDirectory={() => setStep('doctor_directory')}
            onOpenRequests={
              firebaseUser && userAccount && requests.length > 0
                ? () => {
                    setJustSubmittedRequest(null);
                    setStep('status');
                  }
                : undefined
            }
            onSelectIntent={(intent) => {
              setPortalIntent(intent);
              if (intent === 'super_admin') {
                if (firebaseUser && adminCheckDone && isSuperAdmin) {
                  window.history.pushState({}, '', '/super-admin');
                  setStep('super_admin');
                } else if (firebaseUser) {
                  void reverifySuperAdmin().then((authorized) => {
                    if (authorized) {
                      window.history.pushState({}, '', '/super-admin');
                      setStep('super_admin');
                    } else {
                      setStep('auth');
                    }
                  });
                } else {
                  setStep('auth');
                }
                return;
              }

              if (firebaseUser && userAccount && adminCheckDone) {
                routeAfterAuth(intent, userAccount, requests, isSuperAdmin);
              } else {
                setStep('auth');
              }
            }}
          />
        )}

        {step === 'doctor_directory' && (
          <DoctorDirectoryView
            key="medora-doctor-directory"
            onBack={() => setStep('portal_select')}
            onRequestSignIn={() => {
              setPortalIntent('patient');
              setStep('auth');
            }}
          />
        )}

        {step === 'auth' && (
          <GoogleAuthEntry
            key="medora-auth"
            onBackToIntro={() => setStep('intro')}
            onBackToPortalSelection={() => setStep('portal_select')}
            onAuthenticated={({
              user,
              requests: freshReqs,
              isSuperAdmin: verifiedAdmin,
              imagingAccessBlocked: nextImagingBlocked,
              hasOtherAllowedPortal: nextOtherAllowed,
            }) => {
              routeAfterAuth(
                portalIntent,
                user,
                freshReqs,
                verifiedAdmin,
                nextImagingBlocked,
                nextOtherAllowed,
              );
            }}
            onContinueSignedIn={
              firebaseUser && userAccount
                ? () =>
                    routeAfterAuth(
                      portalIntent,
                      userAccount,
                      requests,
                      isSuperAdmin,
                    )
                : undefined
            }
          />
        )}

        {step === 'personal' && firebaseUser && userAccount && (
          <PersonalInfoForm
            key={`medora-personal-${firebaseUser.uid}`}
            onBackToPortals={() => setStep('portal_select')}
            onCancelEdit={
              editingPersonalFromPortal
                ? () => {
                    setEditingPersonalFromPortal(false);
                    setStep(selectedPortal ? 'portal_form' : 'portals');
                  }
                : undefined
            }
            onSaved={() => {
              const targetPortal =
                selectedPortal ||
                (portalIntent && portalIntent !== 'super_admin'
                  ? portalIntent
                  : null);

              if (editingPersonalFromPortal && targetPortal) {
                setEditingPersonalFromPortal(false);
                setSelectedPortal(targetPortal);
                setStep('portal_form');
              } else if (targetPortal) {
                setEditingPersonalFromPortal(false);
                setSelectedPortal(targetPortal);
                setHighlightedPortal(targetPortal);
                const existing = requests.find(
                  (r) => r.portalType === targetPortal,
                );
                setStep(existing ? 'status' : 'portal_form');
              } else {
                setEditingPersonalFromPortal(false);
                setStep('portals');
              }
            }}
          />
        )}

        {step === 'portals' && firebaseUser && userAccount && (
          <PortalSelectionView
            key="medora-portals"
            onSelectPortal={(portal) => {
              setPortalIntent(portal);
              setSelectedPortal(portal);
              setHighlightedPortal(portal);
              setJustSubmittedRequest(null);
              const existing = requests.find((r) => r.portalType === portal);
              if (portal === 'lab') {
                if (existing?.status === 'Approved') {
                  setStep('lab_portal');
                } else {
                  void probeLabAccess(firebaseUser)
                    .then((res) => {
                      if (res.hasAccess) {
                        setStep('lab_portal');
                      } else {
                        setStep(existing ? 'status' : 'portal_form');
                      }
                    })
                    .catch(() => {
                      setStep(existing ? 'status' : 'portal_form');
                    });
                }
              } else if (portal === 'pharmacy') {
                if (existing?.status === 'Approved') {
                  setStep('pharmacy_portal');
                } else {
                  void probePharmacyAccess(firebaseUser)
                    .then((res) => {
                      if (res.hasAccess) {
                        setStep('pharmacy_portal');
                      } else {
                        setStep(existing ? 'status' : 'portal_form');
                      }
                    })
                    .catch(() => {
                      setStep(existing ? 'status' : 'portal_form');
                    });
                }
              } else if (portal === 'wholesaler') {
                if (existing?.status === 'Approved') {
                  setStep('wholesaler_portal');
                } else {
                  void probeWholesalerAccess(firebaseUser)
                    .then((res) => {
                      if (res.hasAccess) {
                        setStep('wholesaler_portal');
                      } else {
                        setStep(existing ? 'status' : 'portal_form');
                      }
                    })
                    .catch(() => {
                      setStep(existing ? 'status' : 'portal_form');
                    });
                }
              } else if (portal === 'secretary') {
                if (existing?.status === 'Approved') {
                  setStep('secretary_portal');
                } else {
                  void probeSecretaryAccess(firebaseUser)
                    .then((res) => {
                      if (res.hasAccess) {
                        setStep('secretary_portal');
                      } else {
                        setStep(existing ? 'status' : 'portal_form');
                      }
                    })
                    .catch(() => {
                      setStep(existing ? 'status' : 'portal_form');
                    });
                }
              } else if (portal === 'doctor' && existing?.status === 'Approved') {
                setStep('doctor_portal');
              } else if (portal === 'patient' && existing?.status === 'Approved') {
                setStep('patient_portal');
              } else {
                setStep(existing ? 'status' : 'portal_form');
              }
            }}
            onEditPersonal={() => {
              setEditingPersonalFromPortal(true);
              setStep('personal');
            }}
            onOpenRequests={() => {
              setJustSubmittedRequest(null);
              setStep('status');
            }}
          />
        )}

        {step === 'portal_form' &&
          firebaseUser &&
          userAccount &&
          selectedPortal && (
            <PortalFormWrapper
              key={`medora-form-${selectedPortal}`}
              portal={selectedPortal}
              draftPayload={activeDraftPayload}
              onDraftChange={handleSaveDraft}
              onEditPersonal={() => {
                setEditingPersonalFromPortal(true);
                setStep('personal');
              }}
              onBackToPortals={() => setStep('portal_select')}
              onProceedToReview={(payload) => {
                handleSaveDraft(payload);
                setStep('review');
              }}
              onOpenRequests={() => setStep('status')}
            />
          )}

        {step === 'review' &&
          firebaseUser &&
          userAccount &&
          activeDraftPayload && (
            <ReviewAndSubmitView
              key={`medora-review-${activeDraftPayload.portal}`}
              payload={activeDraftPayload}
              onEditPersonal={() => {
                setEditingPersonalFromPortal(true);
                setStep('personal');
              }}
              onEditPortal={() => setStep('portal_form')}
              onBackToPortals={() => setStep('portal_select')}
              onSubmitted={(savedReq) => {
                handleClearDraft(savedReq.portalType);
                setJustSubmittedRequest(savedReq);
                setHighlightedPortal(savedReq.portalType);
                setSelectedPortal(null);
                if (
                  savedReq.portalType === 'patient' &&
                  savedReq.status === 'Approved'
                ) {
                  setStep('patient_portal');
                } else if (
                  savedReq.portalType === 'secretary' &&
                  savedReq.status === 'Approved'
                ) {
                  setStep('secretary_portal');
                } else {
                  setStep('status');
                }
              }}
              onOpenRequests={() => setStep('status')}
            />
          )}

        {step === 'status' && firebaseUser && userAccount && (
          <RequestStatusView
            key="medora-status"
            justSubmittedRequest={justSubmittedRequest}
            highlightedPortal={highlightedPortal}
            onSelectAnotherPortal={() => {
              setJustSubmittedRequest(null);
              setStep('portal_select');
            }}
            onEditResubmitPortal={(portal) => {
              setPortalIntent(portal);
              setSelectedPortal(portal);
              setHighlightedPortal(portal);
              setJustSubmittedRequest(null);
              setStep('portal_form');
            }}
            onOpenDoctorPortal={() => setStep('doctor_portal')}
            onOpenPatientPortal={() => setStep('patient_portal')}
            onOpenLabPortal={() => setStep('lab_portal')}
            onOpenPharmacyPortal={() => setStep('pharmacy_portal')}
            onOpenWholesalerPortal={() => setStep('wholesaler_portal')}
            onOpenSecretaryPortal={() => setStep('secretary_portal')}
            onOpenDirectory={() => setStep('doctor_directory')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <MedoraProvider>
        <MedoraFlowRouter />
      </MedoraProvider>
    </MotionConfig>
  );
}

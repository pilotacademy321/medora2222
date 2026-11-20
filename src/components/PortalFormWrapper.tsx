import { motion } from 'motion/react';
import type {
  DoctorPortalInput,
  LabPortalInput,
  PatientPortalInput,
  PharmacyPortalInput,
  PortalFormPayload,
  PortalType,
  SecretaryPortalInput,
  WholesalerPortalInput,
} from '../types/medora';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';
import { DoctorForm } from './portals/DoctorForm';
import { LabForm } from './portals/LabForm';
import { PatientForm } from './portals/PatientForm';
import { PharmacyForm } from './portals/PharmacyForm';
import { SecretaryForm } from './portals/SecretaryForm';
import { WholesalerForm } from './portals/WholesalerForm';

interface PortalFormWrapperProps {
  portal: PortalType;
  draftPayload: PortalFormPayload | null;
  onDraftChange?: (payload: PortalFormPayload) => void;
  onEditPersonal: () => void;
  onBackToPortals: () => void;
  onProceedToReview: (payload: PortalFormPayload) => void;
  onOpenRequests: () => void;
}

export function PortalFormWrapper({
  portal,
  draftPayload,
  onDraftChange,
  onEditPersonal,
  onBackToPortals,
  onProceedToReview,
  onOpenRequests,
}: PortalFormWrapperProps) {
  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar
        showRequestsAction
        onBackToPortals={onBackToPortals}
        onOpenRequests={onOpenRequests}
      />

      <main className="relative z-10 mx-auto my-8 w-full max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur-xl dark:border-[#d9a43b]/20 dark:bg-[#07122a]/90 sm:p-8">
          {portal === 'patient' && (
            <PatientForm
              initialData={
                draftPayload?.portal === 'patient'
                  ? (draftPayload.data as PatientPortalInput)
                  : undefined
              }
              onDraftSave={(data) =>
                onDraftChange?.({ portal: 'patient', data })
              }
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) => onProceedToReview({ portal: 'patient', data })}
            />
          )}

          {portal === 'doctor' && (
            <DoctorForm
              initialData={
                draftPayload?.portal === 'doctor'
                  ? (draftPayload.data as DoctorPortalInput)
                  : undefined
              }
              onDraftSave={(data) =>
                onDraftChange?.({ portal: 'doctor', data })
              }
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) => onProceedToReview({ portal: 'doctor', data })}
            />
          )}

          {portal === 'lab' && (
            <LabForm
              initialData={
                draftPayload?.portal === 'lab'
                  ? (draftPayload.data as LabPortalInput)
                  : undefined
              }
              onDraftSave={(data) => onDraftChange?.({ portal: 'lab', data })}
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) => onProceedToReview({ portal: 'lab', data })}
            />
          )}

          {portal === 'secretary' && (
            <SecretaryForm
              initialData={
                draftPayload?.portal === 'secretary'
                  ? (draftPayload.data as SecretaryPortalInput)
                  : undefined
              }
              onDraftSave={(data) =>
                onDraftChange?.({ portal: 'secretary', data })
              }
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) =>
                onProceedToReview({ portal: 'secretary', data })
              }
            />
          )}

          {portal === 'pharmacy' && (
            <PharmacyForm
              initialData={
                draftPayload?.portal === 'pharmacy'
                  ? (draftPayload.data as PharmacyPortalInput)
                  : undefined
              }
              onDraftSave={(data) =>
                onDraftChange?.({ portal: 'pharmacy', data })
              }
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) =>
                onProceedToReview({ portal: 'pharmacy', data })
              }
            />
          )}

          {portal === 'wholesaler' && (
            <WholesalerForm
              initialData={
                draftPayload?.portal === 'wholesaler'
                  ? (draftPayload.data as WholesalerPortalInput)
                  : undefined
              }
              onDraftSave={(data) =>
                onDraftChange?.({ portal: 'wholesaler', data })
              }
              onEditPersonal={onEditPersonal}
              onBack={onBackToPortals}
              onNext={(data) =>
                onProceedToReview({ portal: 'wholesaler', data })
              }
            />
          )}
        </div>
      </main>
    </motion.section>
  );
}

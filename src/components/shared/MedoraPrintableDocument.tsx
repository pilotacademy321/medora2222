import React from 'react';
import type { Language } from '../../types/medora';
import type {
  DiagnosticOrderRecord,
  DoctorAppointment,
  DoctorPatientRecord,
  DoctorPortalProfile,
  PatientVisitRecord,
  PrescriptionRecord,
} from '../../types/doctor';
import type {
  LabInvoiceRecord,
  LabPaymentRecord,
  LabResultRecord,
} from '../../types/lab';
import type { PharmacyInvoiceRecord } from '../../types/pharmacy';
import type { WholesalerInvoiceRecord } from '../../types/wholesaler';
import type { MedoraReceiptRecord } from '../../types/commerce';

function SheetHeader({
  lang,
  title,
  subtitle,
  metaRight,
}: {
  lang: Language;
  title: string;
  subtitle?: string;
  metaRight?: Array<{ label: string; value: string }>;
}) {
  const isAr = lang === 'ar';
  return (
    <div
      data-pdf-block="header"
      style={{
        borderBottom: '2px solid #0c3585',
        paddingBottom: '14px',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: '#b68023',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
        >
          MEDORA HEALTHCARE PLATFORM
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569' }}>
            {subtitle}
          </p>
        )}
      </div>
      {metaRight && metaRight.length > 0 && (
        <div
          style={{
            textAlign: isAr ? 'left' : 'right',
            fontSize: '11.5px',
            color: '#334155',
            lineHeight: 1.6,
            flexShrink: 0,
          }}
        >
          {metaRight.map((item, idx) => (
            <div key={idx}>
              <span style={{ color: '#64748b' }}>{item.label}: </span>
              <strong style={{ color: '#0f172a' }}>{item.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetShell({
  lang,
  children,
}: {
  lang: Language;
  children: React.ReactNode;
}) {
  const isAr = lang === 'ar';
  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="medora-print-sheet"
      style={{
        backgroundColor: '#ffffff',
        color: '#0f172a',
        fontFamily: isAr
          ? '"IBM Plex Sans Arabic", system-ui, sans-serif'
          : '"Plus Jakarta Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
        padding: '28px 32px',
        width: '100%',
        maxWidth: '794px',
        margin: '0 auto',
        boxSizing: 'border-box',
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  );
}

function InfoBox({
  title,
  rows,
}: {
  title?: string;
  rows: Array<{ label: string; value?: string | number | null }>;
}) {
  const validRows = rows.filter(
    (r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== ''
  );
  if (validRows.length === 0) return null;
  return (
    <div
      data-pdf-block="info-box"
      style={{
        border: '1px solid #cbd5e1',
        borderRadius: '10px',
        padding: '12px 14px',
        marginBottom: '14px',
        backgroundColor: '#f8fafc',
      }}
    >
      {title && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: '#0c3585',
            marginBottom: '8px',
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '8px 16px',
          fontSize: '12.5px',
        }}
      >
        {validRows.map((row, i) => (
          <div key={i}>
            <span style={{ color: '#64748b' }}>{row.label}: </span>
            <strong style={{ color: '#0f172a' }}>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 1. Prescription Print/PDF Sheet — STRICTLY NO QR CODE OR VERIFICATION BADGE
 */
export function PrescriptionPrintSheet({
  rx,
  lang,
}: {
  rx: PrescriptionRecord;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'وصفة طبية إلكترونية معتمدة' : 'Official Electronic Prescription'}
        subtitle={`${rx.clinicName || ''}${rx.clinicAddress ? ` — ${rx.clinicAddress}` : ''}`}
        metaRight={[
          { label: isAr ? 'التاريخ' : 'Date', value: rx.prescribedDate },
          ...(rx.clinicPhone
            ? [{ label: isAr ? 'هاتف العيادة' : 'Clinic Phone', value: rx.clinicPhone }]
            : []),
        ]}
      />

      <InfoBox
        rows={[
          {
            label: isAr ? 'الطبيب المعالج' : 'Attending Physician',
            value: rx.doctorName,
          },
          { label: isAr ? 'الاختصاص' : 'Specialty', value: rx.doctorSpecialty },
          { label: isAr ? 'اسم المريض' : 'Patient Name', value: rx.patientName },
          { label: isAr ? 'العمر' : 'Age', value: rx.patientAge },
          { label: isAr ? 'الجنس' : 'Gender', value: rx.patientGender },
        ]}
      />

      <div data-pdf-block="rx-meds" style={{ marginBottom: '16px' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#0c3585',
            marginBottom: '8px',
          }}
        >
          {isAr ? 'الأدوية الموصوفة (Rx)' : 'Prescribed Medications (Rx)'}
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            border: '1px solid #cbd5e1',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                #
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                {isAr ? 'الدواء' : 'Medication'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                {isAr ? 'الجرعة' : 'Dosage'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                {isAr ? 'التكرار' : 'Frequency'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                {isAr ? 'المدة' : 'Duration'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'start' }}>
                {isAr ? 'التعليمات' : 'Instructions'}
              </th>
            </tr>
          </thead>
          <tbody>
            {rx.medications.map((m, idx) => (
              <tr key={idx}>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{idx + 1}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 700 }}>
                  {m.name}
                </td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{m.dosage || '—'}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{m.frequency || '—'}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{m.duration || '—'}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>
                  {m.instructions || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rx.doctorNotes && (
        <div
          data-pdf-block="rx-notes"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '20px',
            fontSize: '12.5px',
          }}
        >
          <strong style={{ color: '#0c3585' }}>
            {isAr ? 'ملاحظات الطبيب: ' : 'Physician Notes: '}
          </strong>
          <span>{rx.doctorNotes}</span>
        </div>
      )}

      <div
        data-pdf-block="rx-signature"
        style={{
          marginTop: '28px',
          paddingTop: '14px',
          borderTop: '1px dashed #94a3b8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: '#334155',
        }}
      >
        <div>{rx.clinicName}</div>
        <div style={{ textAlign: isAr ? 'left' : 'right' }}>
          <div style={{ fontWeight: 700 }}>{isAr ? 'توقيع وختم الطبيب' : 'Physician Signature & Stamp'}</div>
          <div style={{ marginTop: '10px', color: '#64748b' }}>__________________________</div>
        </div>
      </div>
    </SheetShell>
  );
}

/**
 * 2. Medical Visit Print/PDF Sheet
 */
export function VisitPrintSheet({
  visit,
  patient,
  doctorProfile,
  linkedRx,
  lang,
}: {
  visit: PatientVisitRecord & {
    doctorName?: string;
    doctorSpecialty?: string;
    clinicName?: string;
  };
  patient?: Partial<DoctorPatientRecord> | null;
  doctorProfile?: Partial<DoctorPortalProfile> | null;
  linkedRx?: PrescriptionRecord | null;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const doctorName = visit.doctorName || doctorProfile?.fullName || visit.createdByName || '—';
  const clinicName = visit.clinicName || doctorProfile?.clinicName || '';
  const specialty = visit.doctorSpecialty || doctorProfile?.specialty || '';

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'تقرير زيارة ومراجعة طبية' : 'Medical Visit Clinical Report'}
        subtitle={[clinicName, specialty].filter(Boolean).join(' · ')}
        metaRight={[
          {
            label: isAr ? 'التاريخ' : 'Date',
            value: `${visit.visitDate}${visit.visitTime ? ` · ${visit.visitTime}` : ''}`,
          },
          ...(patient?.fileNumber
            ? [{ label: isAr ? 'رقم الملف' : 'File #', value: patient.fileNumber }]
            : []),
        ]}
      />

      <InfoBox
        title={isAr ? 'بيانات المريض والطبيب' : 'Patient & Physician Information'}
        rows={[
          { label: isAr ? 'اسم المريض' : 'Patient', value: patient?.fullName || '—' },
          { label: isAr ? 'رقم الهاتف' : 'Phone', value: patient?.phone },
          { label: isAr ? 'الطبيب المعالج' : 'Physician', value: doctorName },
          { label: isAr ? 'فصيلة الدم' : 'Blood Type', value: patient?.bloodType },
          { label: isAr ? 'الحساسية' : 'Allergies', value: patient?.allergies },
          { label: isAr ? 'الأمراض المزمنة' : 'Chronic Conditions', value: patient?.chronicConditions },
        ]}
      />

      {visit.vitals &&
        (visit.vitals.bloodPressure ||
          visit.vitals.temperature ||
          visit.vitals.heartRate ||
          visit.vitals.weightKg) && (
          <InfoBox
            title={isAr ? 'العلامات الحيوية' : 'Vital Signs'}
            rows={[
              { label: isAr ? 'ضغط الدم' : 'Blood Pressure', value: visit.vitals.bloodPressure },
              { label: isAr ? 'الحرارة' : 'Temperature', value: visit.vitals.temperature },
              { label: isAr ? 'النبض' : 'Heart Rate', value: visit.vitals.heartRate },
              { label: isAr ? 'الوزن (كغم)' : 'Weight (kg)', value: visit.vitals.weightKg },
            ]}
          />
        )}

      <div data-pdf-block="visit-clinical" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[
          { label: isAr ? 'سبب الزيارة' : 'Visit Reason', value: visit.visitReason },
          { label: isAr ? 'الشكوى الرئيسية' : 'Chief Complaint', value: visit.chiefComplaint },
          { label: isAr ? 'التشخيص الطبي' : 'Diagnosis', value: visit.diagnosis },
          { label: isAr ? 'الفحوصات والإجراءات المنجزة' : 'Procedures & Examinations', value: visit.procedures },
          { label: isAr ? 'الملاحظات السريرية' : 'Clinical Notes', value: visit.clinicalNotes },
          { label: isAr ? 'خطة العلاج والتوصيات' : 'Treatment Plan & Recommendations', value: visit.treatmentRecommendations },
        ]
          .filter((item) => item.value && item.value.trim())
          .map((item, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0c3585', marginBottom: '4px' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>{item.value}</div>
            </div>
          ))}
      </div>

      {linkedRx && linkedRx.medications.length > 0 && (
        <div
          data-pdf-block="visit-linked-rx"
          style={{
            marginTop: '14px',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
            {isAr ? 'الوصفة الطبية المرتبطة بالزيارة' : 'Linked Prescription'}
          </div>
          {linkedRx.medications.map((m, idx) => (
            <div key={idx} style={{ fontSize: '12px', marginBottom: '4px' }}>
              • <strong>{m.name}</strong> {m.dosage} — {m.frequency} ({m.duration}){' '}
              {m.instructions ? `· ${m.instructions}` : ''}
            </div>
          ))}
        </div>
      )}

      {visit.attachments && visit.attachments.length > 0 && (
        <div
          data-pdf-block="visit-attachments"
          style={{
            marginTop: '12px',
            fontSize: '11.5px',
            color: '#475569',
          }}
        >
          <strong>{isAr ? 'المرفقات المسجلة: ' : 'Attached Files: '}</strong>
          {visit.attachments.map((f) => f.name).join(' · ')}
        </div>
      )}
    </SheetShell>
  );
}

/**
 * 3. Comprehensive Medical Record Summary Print/PDF Sheet
 */
export function MedicalRecordSummaryPrintSheet({
  lang,
  patientName,
  patientPhone,
  fileNumber,
  bloodType,
  allergies,
  chronicConditions,
  visits,
  prescriptions,
  diagnostics,
}: {
  lang: Language;
  patientName: string;
  patientPhone?: string;
  fileNumber?: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  visits: Array<PatientVisitRecord & { doctorName?: string; clinicName?: string }>;
  prescriptions: PrescriptionRecord[];
  diagnostics: DiagnosticOrderRecord[];
}) {
  const isAr = lang === 'ar';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'الملف الطبي الشامل للمريض' : 'Comprehensive Patient Medical Record'}
        subtitle={isAr ? 'ملخص السجل الصحي الإلكتروني المعتمد' : 'Official Electronic Health Record Summary'}
        metaRight={[
          { label: isAr ? 'تاريخ التصدير' : 'Exported', value: new Date().toISOString().slice(0, 10) },
          ...(fileNumber ? [{ label: isAr ? 'رقم الملف' : 'File #', value: fileNumber }] : []),
        ]}
      />

      <InfoBox
        title={isAr ? 'ملخص المريض' : 'Patient Summary'}
        rows={[
          { label: isAr ? 'الاسم الكامل' : 'Full Name', value: patientName },
          { label: isAr ? 'الهاتف' : 'Phone', value: patientPhone },
          { label: isAr ? 'فصيلة الدم' : 'Blood Type', value: bloodType },
          { label: isAr ? 'الحساسية' : 'Allergies', value: allergies },
          { label: isAr ? 'الأمراض المزمنة' : 'Chronic Conditions', value: chronicConditions },
          {
            label: isAr ? 'إحصائيات السجل' : 'Record Counts',
            value: `${visits.length} ${isAr ? 'زيارة' : 'visits'} · ${prescriptions.length} ${isAr ? 'وصفة' : 'Rx'} · ${diagnostics.length} ${isAr ? 'فحص' : 'diagnostics'}`,
          },
        ]}
      />

      <div data-pdf-block="ehr-visits-title" style={{ fontSize: '13px', fontWeight: 700, color: '#0c3585', margin: '14px 0 8px' }}>
        {isAr ? `الزيارات السريرية (${visits.length})` : `Clinical Visits (${visits.length})`}
      </div>
      {visits.length === 0 ? (
        <div data-pdf-block="ehr-no-visits" style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
          {isAr ? 'لا توجد زيارات مسجلة.' : 'No visits recorded.'}
        </div>
      ) : (
        visits.map((v) => (
          <div
            key={v.visitId}
            data-pdf-block={`ehr-visit-${v.visitId}`}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '8px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
              <span>{v.visitReason || v.chiefComplaint}</span>
              <span>{v.visitDate}{v.visitTime ? ` ${v.visitTime}` : ''}</span>
            </div>
            {(v.doctorName || v.clinicName) && (
              <div style={{ color: '#475569', fontSize: '11.5px', marginBottom: '4px' }}>
                {[v.doctorName, v.clinicName].filter(Boolean).join(' · ')}
              </div>
            )}
            {v.diagnosis && (
              <div><strong>{isAr ? 'التشخيص: ' : 'Diagnosis: '}</strong>{v.diagnosis}</div>
            )}
            {v.procedures && (
              <div><strong>{isAr ? 'الإجراءات: ' : 'Procedures: '}</strong>{v.procedures}</div>
            )}
            {v.clinicalNotes && (
              <div><strong>{isAr ? 'الملاحظات: ' : 'Notes: '}</strong>{v.clinicalNotes}</div>
            )}
            {v.treatmentRecommendations && (
              <div><strong>{isAr ? 'التوصيات: ' : 'Treatment: '}</strong>{v.treatmentRecommendations}</div>
            )}
          </div>
        ))
      )}

      <div data-pdf-block="ehr-rx-title" style={{ fontSize: '13px', fontWeight: 700, color: '#0c3585', margin: '14px 0 8px' }}>
        {isAr ? `الوصفات الطبية (${prescriptions.length})` : `Prescriptions (${prescriptions.length})`}
      </div>
      {prescriptions.map((rx) => (
        <div
          key={rx.prescriptionId}
          data-pdf-block={`ehr-rx-${rx.prescriptionId}`}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '8px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
            <span>{rx.doctorName} · {rx.clinicName}</span>
            <span>{rx.prescribedDate}</span>
          </div>
          {rx.medications.map((m, idx) => (
            <div key={idx}>
              • <strong>{m.name}</strong> {m.dosage} — {m.frequency} ({m.duration})
            </div>
          ))}
        </div>
      ))}

      <div data-pdf-block="ehr-diag-title" style={{ fontSize: '13px', fontWeight: 700, color: '#0c3585', margin: '14px 0 8px' }}>
        {isAr ? `التحاليل والأشعة (${diagnostics.length})` : `Lab & Imaging Orders (${diagnostics.length})`}
      </div>
      {diagnostics.map((d) => (
        <div
          key={d.orderId}
          data-pdf-block={`ehr-diag-${d.orderId}`}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '8px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '4px' }}>
            <span>{d.requestedTests.join(' · ')}</span>
            <span>{d.orderedAt.slice(0, 10)}</span>
          </div>
          {d.targetFacilityName && <div style={{ color: '#475569' }}>{d.targetFacilityName}</div>}
          {d.resultSummary && <div>{d.resultSummary}</div>}
        </div>
      ))}
    </SheetShell>
  );
}

/**
 * 4. Diagnostic Order / Result Print/PDF Sheet
 */
export function DiagnosticOrderPrintSheet({
  order,
  clinicName,
  doctorName,
  lang,
}: {
  order: Omit<DiagnosticOrderRecord, 'status'> & { status: string };
  clinicName?: string;
  doctorName?: string;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={
          order.orderType === 'lab'
            ? isAr
              ? 'نموذج طلب ونتيجة تحليل مختبري'
              : 'Laboratory Diagnostic Order & Report'
            : isAr
            ? 'نموذج طلب ونتيجة تصوير وأشعة'
            : 'Imaging & Radiology Order & Report'
        }
        subtitle={clinicName}
        metaRight={[
          { label: isAr ? 'تاريخ الطلب' : 'Ordered', value: order.orderedAt.slice(0, 10) },
          { label: isAr ? 'الأولوية' : 'Priority', value: order.priority.toUpperCase() },
        ]}
      />

      <InfoBox
        rows={[
          { label: isAr ? 'المريض' : 'Patient', value: order.patientName },
          { label: isAr ? 'الطبيب' : 'Physician', value: doctorName },
          { label: isAr ? 'الجهة المقصودة' : 'Facility', value: order.targetFacilityName || '—' },
          { label: isAr ? 'الحالة' : 'Status', value: order.status },
        ]}
      />

      <div
        data-pdf-block="diag-tests"
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '12px',
          fontSize: '12.5px',
        }}
      >
        <div style={{ fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
          {isAr ? 'الفحوصات المطلوبة' : 'Requested Tests'}
        </div>
        <div>{order.requestedTests.join(' · ')}</div>
      </div>

      {order.clinicalIndication && (
        <div
          data-pdf-block="diag-indication"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '12px',
            fontSize: '12.5px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#0c3585', marginBottom: '4px' }}>
            {isAr ? 'الداعي السريري' : 'Clinical Indication'}
          </div>
          <div>{order.clinicalIndication}</div>
        </div>
      )}

      {(order.resultSummary || order.doctorNotes) && (
        <div
          data-pdf-block="diag-results"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '12.5px',
          }}
        >
          {order.resultSummary && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontWeight: 700, color: '#0c3585', marginBottom: '4px' }}>
                {isAr ? 'ملخص النتيجة' : 'Result Summary'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{order.resultSummary}</div>
            </div>
          )}
          {order.doctorNotes && (
            <div>
              <div style={{ fontWeight: 700, color: '#0c3585', marginBottom: '4px' }}>
                {isAr ? 'ملاحظات الطبيب' : 'Physician Notes'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{order.doctorNotes}</div>
            </div>
          )}
        </div>
      )}
    </SheetShell>
  );
}

/**
 * 5. Doctor Clinic Report Print/PDF Sheet
 */
export function DoctorClinicReportPrintSheet({
  lang,
  doctorProfile,
  periodLabel,
  stats,
}: {
  lang: Language;
  doctorProfile: DoctorPortalProfile;
  periodLabel: string;
  stats: {
    totalPatients: number;
    newPatients: number;
    totalVisits: number;
    completedBookings: number;
    cancelledBookings: number;
    noShowBookings: number;
    busiestDay: string;
    totalRevenue: number;
    statusCounts: Array<{ label: string; count: number }>;
    dayCounts: Array<{ label: string; count: number }>;
  };
}) {
  const isAr = lang === 'ar';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'تقرير العيادة والإحصائيات السريرية' : 'Clinic Analytics & Activity Report'}
        subtitle={`${doctorProfile.fullName} — ${doctorProfile.clinicName}`}
        metaRight={[
          { label: isAr ? 'الفترة' : 'Period', value: periodLabel },
          { label: isAr ? 'التاريخ' : 'Generated', value: new Date().toISOString().slice(0, 10) },
        ]}
      />

      <InfoBox
        title={isAr ? 'مؤشرات الأداء الرئيسية' : 'Key Performance Indicators'}
        rows={[
          { label: isAr ? 'إجمالي المرضى' : 'Total Patients', value: stats.totalPatients },
          { label: isAr ? 'مرضى جدد' : 'New Patients', value: stats.newPatients },
          { label: isAr ? 'عدد الزيارات' : 'Total Visits', value: stats.totalVisits },
          { label: isAr ? 'الحجوزات المكتملة' : 'Completed Bookings', value: stats.completedBookings },
          { label: isAr ? 'الحجوزات الملغاة' : 'Cancelled Bookings', value: stats.cancelledBookings },
          { label: isAr ? 'لم يحضر' : 'No Show', value: stats.noShowBookings },
          { label: isAr ? 'أكثر الأيام ازدحاماً' : 'Busiest Day', value: stats.busiestDay },
          {
            label: isAr ? 'الإيرادات المسجلة' : 'Recorded Revenue',
            value: stats.totalRevenue > 0 ? stats.totalRevenue.toLocaleString() : '—',
          },
        ]}
      />

      <div data-pdf-block="report-status" style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
          {isAr ? 'توزيع حالات المواعيد' : 'Appointment Status Breakdown'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <tbody>
            {stats.statusCounts.map((row, idx) => (
              <tr key={idx}>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1' }}>{row.label}</td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', fontWeight: 700, width: '90px' }}>
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-pdf-block="report-days">
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
          {isAr ? 'كثافة الحجوزات حسب اليوم' : 'Bookings by Day of Week'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <tbody>
            {stats.dayCounts.map((row, idx) => (
              <tr key={idx}>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1' }}>{row.label}</td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', fontWeight: 700, width: '90px' }}>
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SheetShell>
  );
}

/**
 * 6. Super Admin Platform Executive Report Print/PDF Sheet
 */
export function AdminExecutiveReportPrintSheet({
  lang,
  metrics,
}: {
  lang: Language;
  metrics: {
    totalInstitutions: number;
    activeInstitutions: number;
    pendingInstitutions: number;
    activeSubscriptions: number;
    totalRequests: number;
    pendingRequests: number;
    totalUsers: number;
    totalMessages: number;
    unreadMessages: number;
    totalAds: number;
    publishedAds: number;
    pendingReviews: number;
    openFeedback: number;
  };
}) {
  const isAr = lang === 'ar';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'التقرير التنفيذي لإدارة منصة MEDORA' : 'MEDORA Platform Executive Report'}
        subtitle={isAr ? 'ملخص المؤسسات والاشتراكات والطلبات والرقابة الإدارية' : 'Institutions, Requests, Users, and Governance Summary'}
        metaRight={[
          { label: isAr ? 'التاريخ' : 'Generated', value: new Date().toISOString().slice(0, 10) },
          { label: isAr ? 'بوابة الإصدار' : 'Source', value: 'Super Admin' },
        ]}
      />

      <InfoBox
        title={isAr ? 'المؤسسات والاشتراكات' : 'Institutions & Subscriptions'}
        rows={[
          { label: isAr ? 'إجمالي المؤسسات' : 'Total Institutions', value: metrics.totalInstitutions },
          { label: isAr ? 'المؤسسات الفعّالة' : 'Active Institutions', value: metrics.activeInstitutions },
          { label: isAr ? 'بانتظار الاعتماد' : 'Pending Approval', value: metrics.pendingInstitutions },
          { label: isAr ? 'الاشتراكات النشطة' : 'Active Subscriptions', value: metrics.activeSubscriptions },
        ]}
      />

      <InfoBox
        title={isAr ? 'الطلبات والمستخدمون والتواصل' : 'Requests, Users & Engagement'}
        rows={[
          { label: isAr ? 'إجمالي طلبات التسجيل' : 'Total Requests', value: metrics.totalRequests },
          { label: isAr ? 'طلبات بانتظار المراجعة' : 'Pending Requests', value: metrics.pendingRequests },
          { label: isAr ? 'إجمالي الحسابات المسجلة' : 'Registered Accounts', value: metrics.totalUsers },
          { label: isAr ? 'الرسائل الإدارية (غير مقروءة)' : 'Admin Messages (Unread)', value: `${metrics.totalMessages} (${metrics.unreadMessages})` },
          { label: isAr ? 'الإعلانات (منشور / الإجمالي)' : 'Ads (Published / Total)', value: `${metrics.publishedAds} / ${metrics.totalAds}` },
          { label: isAr ? 'تقييمات بانتظار المراجعة' : 'Pending Reviews', value: metrics.pendingReviews },
          { label: isAr ? 'شكاوى وملاحظات مفتوحة' : 'Open Patient Feedback', value: metrics.openFeedback },
        ]}
      />
    </SheetShell>
  );
}

/**
 * 7. MEDORA LAB Result Medical Report Print/PDF Sheet (Strictly NO Barcode/QR Code)
 */
export function LabResultReportPrintSheet({
  result,
  lang,
}: {
  result: LabResultRecord;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const flagLabels: Record<string, { ar: string; en: string; color: string; bg: string }> = {
    normal: { ar: 'طبيعي', en: 'Normal', color: '#065f46', bg: '#ecfdf5' },
    high: { ar: 'مرتفع (H)', en: 'High (H)', color: '#b45309', bg: '#fffbeb' },
    low: { ar: 'منخفض (L)', en: 'Low (L)', color: '#1d4ed8', bg: '#eff6ff' },
    critical: { ar: 'حرج (!)', en: 'Critical (!)', color: '#991b1b', bg: '#fef2f2' },
    abnormal: { ar: 'غير طبيعي', en: 'Abnormal', color: '#9a3412', bg: '#fff7ed' },
  };

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'تقرير نتائج التحاليل المختبرية' : 'Laboratory Medical Report'}
        subtitle={`${result.labNameAr}${result.labAddress ? ` — ${result.labAddress}` : ''}`}
        metaRight={[
          { label: isAr ? 'رقم التقرير' : 'Report No.', value: result.reportNumber },
          { label: isAr ? 'رقم الطلب' : 'Order No.', value: result.orderNumber },
          ...(result.labPhone
            ? [{ label: isAr ? 'هاتف المختبر' : 'Lab Phone', value: result.labPhone }]
            : []),
        ]}
      />

      <InfoBox
        title={isAr ? 'بيانات المريض والتقرير' : 'Patient & Report Details'}
        rows={[
          { label: isAr ? 'اسم المريض' : 'Patient Name', value: result.patientName },
          { label: isAr ? 'رقم الهاتف' : 'Phone', value: result.patientPhone },
          { label: isAr ? 'العمر' : 'Age', value: result.patientAge },
          { label: isAr ? 'الجنس' : 'Gender', value: result.patientGender },
          {
            label: isAr ? 'تاريخ الإدخال' : 'Entered At',
            value: result.enteredAt ? String(result.enteredAt).slice(0, 16).replace('T', ' ') : '',
          },
          {
            label: isAr ? 'الاعتماد الطبي' : 'Approved By',
            value: result.approvedByName
              ? `${result.approvedByName}${result.approvedAt ? ` (${String(result.approvedAt).slice(0, 10)})` : ''}`
              : isAr
                ? 'قيد المراجعة'
                : 'Pending Approval',
          },
        ]}
      />

      <div data-pdf-block="lab-analytes" style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0c3585', marginBottom: '8px' }}>
          {isAr ? 'جدول الفحوصات والنتائج' : 'Test Results & Reference Ranges'}
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            border: '1px solid #cbd5e1',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'الفحص' : 'Test'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'النتيجة' : 'Result'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الوحدة' : 'Unit'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'المدى المرجعي' : 'Reference Range'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'التقييم' : 'Flag'}
              </th>
            </tr>
          </thead>
          <tbody>
            {(result.analytes || []).map((a, idx) => {
              const fl = flagLabels[a.flag] || flagLabels.normal;
              return (
                <tr key={idx}>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                    {a.testName}
                    {a.comment ? (
                      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 400 }}>{a.comment}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                    {a.value || '—'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {a.unit || '—'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    {a.referenceRange || '—'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: fl.color,
                        backgroundColor: fl.bg,
                      }}
                    >
                      {isAr ? fl.ar : fl.en}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result.summaryNote && (
        <div
          data-pdf-block="lab-summary"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '14px',
            backgroundColor: '#f8fafc',
            fontSize: '12.5px',
          }}
        >
          <strong style={{ color: '#0c3585' }}>{isAr ? 'التعليق المخبري: ' : 'Clinical Note: '}</strong>
          <span>{result.summaryNote}</span>
        </div>
      )}

      {result.revisionCount > 0 && (
        <div
          data-pdf-block="lab-revisions"
          style={{
            border: '1px dashed #d97706',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '14px',
            backgroundColor: '#fffbeb',
            fontSize: '11.5px',
            color: '#92400e',
          }}
        >
          {isAr
            ? `تقرير معدّل وموثّق (${result.revisionCount} تعديل) — آخر سبب: ${result.revisionHistory[result.revisionHistory.length - 1]?.reason || ''}`
            : `Amended Report (${result.revisionCount} revision) — Latest reason: ${result.revisionHistory[result.revisionHistory.length - 1]?.reason || ''}`}
        </div>
      )}

      <div
        data-pdf-block="footer"
        style={{
          marginTop: '24px',
          paddingTop: '12px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11.5px',
          color: '#64748b',
        }}
      >
        <span>
          {isAr ? 'إصدار نظام MEDORA LAB' : 'Issued by MEDORA LAB LIMS'}
        </span>
        <span>
          {isAr ? 'اعتماد المخبر:' : 'Authorized Signature:'}{' '}
          <strong style={{ color: '#0f172a' }}>{result.approvedByName || result.enteredByName}</strong>
        </span>
      </div>
    </SheetShell>
  );
}

/**
 * 8. MEDORA LAB Invoice & Receipt Print/PDF Sheet (Strictly NO Barcode/QR Code)
 */
export function LabInvoicePrintSheet({
  invoice,
  payments,
  lang,
}: {
  invoice: LabInvoiceRecord;
  payments: LabPaymentRecord[];
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const currency = isAr ? 'د.ع' : 'IQD';
  const invPayments = payments.filter((p) => p.invoiceId === invoice.invoiceId);

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'فاتورة مختبر طبية وإيصال قبض' : 'Laboratory Invoice & Receipt'}
        subtitle={`${invoice.labNameAr}${invoice.labAddress ? ` — ${invoice.labAddress}` : ''}`}
        metaRight={[
          { label: isAr ? 'رقم الفاتورة' : 'Invoice No.', value: invoice.invoiceNumber },
          ...(invoice.orderNumber
            ? [{ label: isAr ? 'رقم الطلب' : 'Order No.', value: invoice.orderNumber }]
            : []),
          {
            label: isAr ? 'التاريخ' : 'Date',
            value: invoice.createdAt ? String(invoice.createdAt).slice(0, 10) : '',
          },
        ]}
      />

      <InfoBox
        title={isAr ? 'بيانات المريض والفاتورة' : 'Patient & Billing Info'}
        rows={[
          { label: isAr ? 'اسم المريض' : 'Patient Name', value: invoice.patientName },
          { label: isAr ? 'رقم الهاتف' : 'Phone', value: invoice.patientPhone },
          { label: isAr ? 'حالة الفاتورة' : 'Status', value: invoice.status.toUpperCase() },
          { label: isAr ? 'أُصدرت بواسطة' : 'Issued By', value: invoice.createdByName },
        ]}
      />

      <div data-pdf-block="invoice-items" style={{ marginBottom: '14px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            border: '1px solid #cbd5e1',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'التحليل / البند' : 'Description'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الكمية' : 'Qty'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'سعر الوحدة' : 'Unit Price'}
              </th>
              <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'المجموع' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, idx) => (
              <tr key={idx}>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{it.description}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{it.quantity}</td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {it.unitPriceIqd.toLocaleString()} {currency}
                </td>
                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {it.totalIqd.toLocaleString()} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InfoBox
        title={isAr ? 'الملخص المالي' : 'Financial Summary'}
        rows={[
          { label: isAr ? 'المجموع الفرعي' : 'Subtotal', value: `${invoice.subtotalIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'الخصم' : 'Discount', value: `${invoice.discountIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'أجور السحب المنزلي' : 'Home Collection Fee', value: `${invoice.homeCollectionFeeIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'الصافي المطلوب' : 'Net Total', value: `${invoice.totalIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'المبلغ المدفوع' : 'Paid Amount', value: `${invoice.paidIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'المتبقي' : 'Balance Due', value: `${invoice.balanceIqd.toLocaleString()} ${currency}` },
        ]}
      />

      {invPayments.length > 0 && (
        <div data-pdf-block="invoice-payments" style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
            {isAr ? 'إيصالات القبض المرتبطة' : 'Recorded Payment Receipts'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', border: '1px solid #cbd5e1' }}>
            <tbody>
              {invPayments.map((p) => (
                <tr key={p.paymentId}>
                  <td style={{ padding: '6px 8px', border: '1px solid #cbd5e1', fontWeight: 700 }}>{p.receiptNumber}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>{p.paidAt.slice(0, 10)}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>{p.method}</td>
                  <td style={{ padding: '6px 8px', border: '1px solid #cbd5e1', fontWeight: 700 }}>
                    {p.amountIqd.toLocaleString()} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SheetShell>
  );
}

/**
 * 9. MEDORA LAB Analytics Report Print/PDF Sheet (Strictly NO Barcode/QR Code)
 */
export function LabAnalyticsReportPrintSheet({
  lang,
  labName,
  fromDate,
  toDate,
  metrics,
}: {
  lang: Language;
  labName: string;
  fromDate: string;
  toDate: string;
  metrics: {
    totalOrders: number;
    approvedResults: number;
    totalBilledIqd: number;
    totalCollectedIqd: number;
    outstandingIqd: number;
    lowStockItems: number;
    expiringItems: number;
    topTests: Array<{ name: string; count: number; revenueIqd: number }>;
  };
}) {
  const isAr = lang === 'ar';
  const currency = isAr ? 'د.ع' : 'IQD';

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'التقرير التشغيلي والمالي للمختبر' : 'Laboratory Operations & Financial Report'}
        subtitle={labName}
        metaRight={[
          { label: isAr ? 'الفترة' : 'Period', value: `${fromDate || '—'} → ${toDate || '—'}` },
          { label: isAr ? 'تاريخ الإصدار' : 'Generated', value: new Date().toISOString().slice(0, 10) },
        ]}
      />

      <InfoBox
        title={isAr ? 'مؤشرات الأداء الرئيسية' : 'Key Performance Indicators'}
        rows={[
          { label: isAr ? 'إجمالي الطلبات' : 'Total Orders', value: metrics.totalOrders },
          { label: isAr ? 'النتائج المعتمدة' : 'Approved Results', value: metrics.approvedResults },
          { label: isAr ? 'إجمالي الفوترة' : 'Total Billed', value: `${metrics.totalBilledIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'المحصل الفعلي' : 'Collected Revenue', value: `${metrics.totalCollectedIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'المبالغ المتبقية' : 'Outstanding Balance', value: `${metrics.outstandingIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'نواقص المخزون / قرب الانتهاء' : 'Low Stock / Expiring', value: `${metrics.lowStockItems} / ${metrics.expiringItems}` },
        ]}
      />

      <div data-pdf-block="top-tests">
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0c3585', marginBottom: '6px' }}>
          {isAr ? 'أكثر التحاليل طلباً وإيراداً' : 'Top Requested Tests'}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'التحليل' : 'Test'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'عدد الطلبات' : 'Count'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الإيراد المقدر' : 'Estimated Revenue'}
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.topTests.map((t, idx) => (
              <tr key={idx}>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1' }}>{t.name}</td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {t.count}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {t.revenueIqd.toLocaleString()} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SheetShell>
  );
}

/**
 * 10. MEDORA Pharmacy Invoice Print/PDF Sheet
 */
export function PharmacyInvoicePrintSheet({
  invoice,
  lang,
}: {
  invoice: PharmacyInvoiceRecord;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const currency = isAr ? 'د.ع' : 'IQD';
  const pmLabel =
    invoice.paymentMethod === 'cash_on_pickup'
      ? isAr
        ? 'نقداً عند الاستلام'
        : 'Cash on Pickup'
      : invoice.paymentMethod === 'cash_on_delivery'
        ? isAr
          ? 'نقداً عند التوصيل'
          : 'Cash on Delivery'
        : isAr
          ? 'بيع مباشر (نقدي)'
          : 'Walk-in Cash (POS)';

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'فاتورة صرف دوائي رسمية' : 'Official Pharmacy Invoice'}
        subtitle={invoice.pharmacyName}
        metaRight={[
          { label: isAr ? 'رقم الفاتورة' : 'Invoice #', value: invoice.invoiceNumber },
          { label: isAr ? 'رقم الطلب' : 'Order #', value: invoice.orderNumber },
          { label: isAr ? 'التاريخ' : 'Issued', value: String(invoice.issuedAt || '').slice(0, 10) },
        ]}
      />

      <InfoBox
        title={isAr ? 'بيانات المريض والدفع' : 'Patient & Payment Details'}
        rows={[
          { label: isAr ? 'اسم المريض / الزبون' : 'Patient / Customer', value: invoice.patientName },
          { label: isAr ? 'طريقة الدفع' : 'Payment Method', value: pmLabel },
          { label: isAr ? 'حالة الفاتورة' : 'Status', value: invoice.status.toUpperCase() },
          { label: isAr ? 'المدفوع' : 'Paid', value: `${invoice.paidAmountIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'المتبقي' : 'Balance Due', value: `${invoice.balanceDueIqd.toLocaleString()} ${currency}` },
        ]}
      />

      <div data-pdf-block="pharmacy-invoice-items">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'الدواء' : 'Medicine'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الكمية' : 'Qty'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'سعر الوحدة' : 'Unit Price'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الإجمالي' : 'Line Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.itemId || idx}>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontWeight: 700 }}>{item.medicineName}</div>
                  {item.batchAllocations?.length > 0 && (
                    <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                      {item.batchAllocations.map((b) => `${b.batchNumber} (${b.expiryDate})`).join(' · ')}
                    </div>
                  )}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.confirmedQty || item.requestedQty}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {item.unitPriceIqd.toLocaleString()} {currency}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.lineTotalIqd.toLocaleString()} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-pdf-block="totals"
        style={{
          marginTop: '14px',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '12px 14px',
          backgroundColor: '#f8fafc',
          fontSize: '12.5px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px 16px',
        }}
      >
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'المجموع الفرعي' : 'Subtotal'}: </span>
          <strong>{invoice.subtotalIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'أجرة التوصيل' : 'Delivery Fee'}: </span>
          <strong>{invoice.deliveryFeeIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'الخصم' : 'Discount'}: </span>
          <strong>{invoice.discountIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#0c3585', fontWeight: 700 }}>{isAr ? 'الإجمالي النهائي' : 'Grand Total'}: </span>
          <strong style={{ color: '#0c3585', fontSize: '14px' }}>{invoice.totalIqd.toLocaleString()} {currency}</strong>
        </div>
      </div>
    </SheetShell>
  );
}

/**
 * 11. MEDORA Wholesaler Supply Invoice Print/PDF Sheet
 */
export function WholesalerInvoicePrintSheet({
  invoice,
  lang,
}: {
  invoice: WholesalerInvoiceRecord;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const currency = isAr ? 'د.ع' : 'IQD';
  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={isAr ? 'فاتورة توريد دوائي (جملة)' : 'Wholesale Pharmaceutical Supply Invoice'}
        subtitle={invoice.wholesalerName}
        metaRight={[
          { label: isAr ? 'رقم الفاتورة' : 'Invoice #', value: invoice.invoiceNumber },
          { label: isAr ? 'رقم الطلب' : 'Supply Order #', value: invoice.orderNumber },
          { label: isAr ? 'التاريخ' : 'Issued', value: String(invoice.issuedAt || '').slice(0, 10) },
        ]}
      />

      <InfoBox
        title={isAr ? 'بيانات الصيدلية المستلمة والتحصيل' : 'Recipient Pharmacy & Settlement'}
        rows={[
          { label: isAr ? 'الصيدلية' : 'Pharmacy', value: invoice.pharmacyName },
          {
            label: isAr ? 'طريقة التسوية' : 'Settlement Method',
            value:
              invoice.paymentMethod === 'credit_account'
                ? isAr
                  ? 'حساب آجل'
                  : 'Credit Account'
                : isAr
                  ? 'دفع عند الاستلام'
                  : 'Cash on Delivery',
          },
          { label: isAr ? 'حالة الفاتورة' : 'Status', value: invoice.status.toUpperCase() },
          { label: isAr ? 'المدفوع' : 'Paid', value: `${invoice.paidAmountIqd.toLocaleString()} ${currency}` },
          { label: isAr ? 'الرصيد المتبقي' : 'Balance Due', value: `${invoice.balanceDueIqd.toLocaleString()} ${currency}` },
        ]}
      />

      <div data-pdf-block="wholesaler-invoice-items">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'الصنف الدوائي' : 'Medicine'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'المطلوب / المعتمد' : 'Req / Approved'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'سعر الجملة' : 'Wholesale Price'}
              </th>
              <th style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الإجمالي' : 'Line Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.itemId || idx}>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontWeight: 700 }}>{item.medicineName}</div>
                  {item.batchAllocations?.length > 0 && (
                    <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                      {item.batchAllocations.map((b) => `${b.batchNumber} (${b.expiryDate}) × ${b.quantity}`).join(' · ')}
                    </div>
                  )}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.requestedQty} / {item.approvedQty}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {(item.proposedUnitPriceIqd ?? item.unitPriceIqd).toLocaleString()} {currency}
                </td>
                <td style={{ padding: '7px 10px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.lineTotalIqd.toLocaleString()} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-pdf-block="totals"
        style={{
          marginTop: '14px',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '12px 14px',
          backgroundColor: '#f8fafc',
          fontSize: '12.5px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px 16px',
        }}
      >
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'المجموع الفرعي' : 'Subtotal'}: </span>
          <strong>{invoice.subtotalIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'الخصم' : 'Discount'}: </span>
          <strong>{invoice.discountIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'التوصيل' : 'Delivery'}: </span>
          <strong>{invoice.deliveryFeeIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#0c3585', fontWeight: 700 }}>{isAr ? 'صافي الفاتورة' : 'Net Total'}: </span>
          <strong style={{ color: '#0c3585', fontSize: '14px' }}>{invoice.totalIqd.toLocaleString()} {currency}</strong>
        </div>
      </div>
    </SheetShell>
  );
}

/**
 * 12. MEDORA Unified 3-Party Linked Receipt Print/PDF Sheet (A4 & Thermal 80mm / 58mm ready)
 */
export function UnifiedReceiptPrintSheet({
  receipt,
  lang,
}: {
  receipt: MedoraReceiptRecord;
  lang: Language;
}) {
  const isAr = lang === 'ar';
  const currency = isAr ? 'د.ع' : 'IQD';

  const txTypeLabel =
    receipt.transactionType === 'wholesaler_to_pharmacy'
      ? isAr
        ? 'إيصال تجهيز دوائي (مذخر ← صيدلية)'
        : 'Supply Receipt (Wholesaler → Pharmacy)'
      : receipt.transactionType === 'pharmacy_to_doctor'
        ? isAr
          ? 'إيصال تجهيز طبي (صيدلية ← طبيب)'
          : 'Medical Supply Receipt (Pharmacy → Doctor)'
        : isAr
          ? 'إيصال صرف دوائي (صيدلية ← مراجع)'
          : 'Dispensing Receipt (Pharmacy → Patient)';

  const paymentLabel =
    receipt.paymentMethod === 'credit_account'
      ? isAr
        ? 'حساب آجل'
        : 'Credit Account'
      : receipt.paymentMethod === 'direct'
        ? isAr
          ? 'دفع مباشر'
          : 'Direct Payment'
        : receipt.paymentMethod === 'cash_on_delivery'
          ? isAr
            ? 'نقداً عند التوصيل'
            : 'Cash on Delivery'
          : isAr
            ? 'نقداً عند الاستلام'
            : 'Cash on Pickup';

  const fulfillmentLabel =
    receipt.fulfillmentType === 'seller_delivery'
      ? isAr
        ? 'توصيل البائع'
        : 'Seller Delivery'
      : isAr
        ? 'استلام المشتري'
        : 'Buyer Pickup';

  return (
    <SheetShell lang={lang}>
      <SheetHeader
        lang={lang}
        title={txTypeLabel}
        subtitle={`${receipt.sellerName} ← ${receipt.buyerName}`}
        metaRight={[
          { label: isAr ? 'رقم الإيصال الموحد' : 'Receipt #', value: receipt.receiptNumber },
          { label: isAr ? 'رقم الطلب' : 'Order #', value: receipt.orderNumber },
          {
            label: isAr ? 'تاريخ الاعتماد' : 'Issued',
            value: String(receipt.issuedAt || '').slice(0, 16).replace('T', ' '),
          },
          ...(receipt.reprintCount > 0
            ? [
                {
                  label: isAr ? 'نسخة مطبوعة' : 'Reprint',
                  value: `#${receipt.reprintCount}`,
                },
              ]
            : []),
        ]}
      />

      {receipt.status === 'voided' && (
        <div
          data-pdf-block="receipt-void-banner"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '2px solid #dc2626',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          {isAr
            ? `إيصال مُبطَل إدارياً — السبب: ${receipt.voidReason || 'غير محدد'}`
            : `VOIDED RECEIPT — Reason: ${receipt.voidReason || 'Unspecified'}`}
        </div>
      )}

      {receipt.status === 'amended' && (
        <div
          data-pdf-block="receipt-amend-banner"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px dashed #d97706',
            backgroundColor: '#fffbeb',
            color: '#92400e',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          {isAr
            ? `إيصال معدّل إدارياً — الملاحظة: ${receipt.amendmentNote || ''}`
            : `AMENDED RECEIPT — Note: ${receipt.amendmentNote || ''}`}
        </div>
      )}

      <InfoBox
        title={isAr ? 'الأطراف المرتبطة والتسوية' : '3-Party Linked Record & Settlement'}
        rows={[
          { label: isAr ? 'البائع (الطرف الأول)' : 'Seller', value: receipt.sellerName },
          { label: isAr ? 'المشتري (الطرف الثاني)' : 'Buyer', value: receipt.buyerName },
          {
            label: isAr ? 'الحفظ الترابطي' : 'Linked Parties',
            value: isAr ? 'الإدارة العامة + البائع + المشتري' : 'Super Admin + Seller + Buyer',
          },
          { label: isAr ? 'طريقة الدفع' : 'Payment Method', value: paymentLabel },
          { label: isAr ? 'حالة الدفع' : 'Payment Status', value: receipt.paymentStatus.toUpperCase() },
          { label: isAr ? 'الاستلام / التسليم' : 'Fulfillment', value: fulfillmentLabel },
        ]}
      />

      <div data-pdf-block="receipt-items" style={{ marginBottom: '14px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            border: '1px solid #cbd5e1',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#eff6ff', color: '#0c3585' }}>
              <th style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: isAr ? 'right' : 'left' }}>
                {isAr ? 'الصنف' : 'Item'}
              </th>
              <th style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'الكمية' : 'Qty'}
              </th>
              <th style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'السعر' : 'Price'}
              </th>
              <th style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                {isAr ? 'المجموع' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, idx) => (
              <tr key={`${item.productId}_${idx}`}>
                <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontWeight: 700 }}>{item.medicineName}</div>
                  {item.batchNumbers && item.batchNumbers.length > 0 && (
                    <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                      {item.batchNumbers
                        .map((bn, bIdx) => `${bn}${item.expiryDates?.[bIdx] ? ` (${item.expiryDates[bIdx]})` : ''}`)
                        .join(' · ')}
                    </div>
                  )}
                </td>
                <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.quantity}
                </td>
                <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                  {item.unitPriceIqd.toLocaleString()} {currency}
                </td>
                <td style={{ padding: '7px 8px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>
                  {item.lineTotalIqd.toLocaleString()} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        data-pdf-block="receipt-totals"
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '10px 14px',
          backgroundColor: '#f8fafc',
          fontSize: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px 14px',
        }}
      >
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'المجموع الفرعي' : 'Subtotal'}: </span>
          <strong>{receipt.subtotalAmountIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'الخصم' : 'Discount'}: </span>
          <strong>{receipt.discountAmountIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'أجور التوصيل' : 'Delivery Fee'}: </span>
          <strong>{receipt.deliveryFeeIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'المدفوع' : 'Paid'}: </span>
          <strong>{receipt.paidAmountIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>{isAr ? 'المتبقي (آجل)' : 'Balance Due'}: </span>
          <strong>{receipt.balanceDueIqd.toLocaleString()} {currency}</strong>
        </div>
        <div>
          <span style={{ color: '#0c3585', fontWeight: 700 }}>{isAr ? 'صافي الإيصال' : 'Net Total'}: </span>
          <strong style={{ color: '#0c3585', fontSize: '14px' }}>
            {receipt.totalAmountIqd.toLocaleString()} {currency}
          </strong>
        </div>
      </div>

      {receipt.notes && (
        <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#475569' }}>
          <strong>{isAr ? 'ملاحظات: ' : 'Notes: '}</strong>
          {receipt.notes}
        </div>
      )}
    </SheetShell>
  );
}



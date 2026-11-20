import { useMemo, useState } from 'react';
import { BarChart3, Download, FileDown, Printer } from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import type { DayOfWeekKey, DoctorWorkspaceData } from '../../types/doctor';
import type { Language } from '../../types/medora';
import { DoctorClinicReportPrintSheet } from '../shared/MedoraPrintableDocument';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';

interface DoctorReportsSectionProps {
  workspace: DoctorWorkspaceData;
  language: Language;
}

type PeriodKey = 'day' | 'week' | 'month';

function jsDayToKey(dayIdx: number): DayOfWeekKey {
  const keys: DayOfWeekKey[] = [
    'sun',
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
  ];
  return keys[dayIdx] || 'sat';
}

export function DoctorReportsSection({
  workspace,
  language,
}: DoctorReportsSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const rc = dc.reports;

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [exportingPdf, setExportingPdf] = useState(false);

  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAgoIso = useMemo(() => {
    const dt = new Date();
    dt.setDate(dt.getDate() - 6);
    return dt.toISOString().slice(0, 10);
  }, []);
  const monthPrefix = todayIso.slice(0, 7);

  const inRange = (dateStr?: string | null): boolean => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    if (period === 'day') return d === todayIso;
    if (period === 'week') return d >= weekAgoIso && d <= todayIso;
    return d.startsWith(monthPrefix);
  };

  const metrics = useMemo(() => {
    const appts = workspace.appointments.filter((a) => inRange(a.date));
    const visits = workspace.visits.filter((v) => inRange(v.visitDate));
    const newPatients = workspace.patients.filter((p) =>
      inRange(p.createdAt),
    );

    const completed = appts.filter((a) => a.status === 'completed').length;
    const cancelled = appts.filter(
      (a) => a.status === 'cancelled' || a.status === 'rejected',
    ).length;
    const noShow = appts.filter((a) => a.status === 'no_show').length;

    const revenueTotal = appts
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (Number(a.feeAmount) || 0), 0);

    const byDay: Record<DayOfWeekKey, number> = {
      sat: 0,
      sun: 0,
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
    };

    appts.forEach((a) => {
      const [y, m, d] = a.date.split('-').map(Number);
      if (y && m && d) {
        const dt = new Date(Date.UTC(y, m - 1, d));
        const key = jsDayToKey(dt.getUTCDay());
        byDay[key] += 1;
      }
    });

    let busiestDay: DayOfWeekKey | null = null;
    let maxCount = 0;
    (Object.keys(byDay) as DayOfWeekKey[]).forEach((k) => {
      if (byDay[k] > maxCount) {
        maxCount = byDay[k];
        busiestDay = k;
      }
    });

    return {
      appts,
      totalPatients: workspace.patients.length,
      newPatients: newPatients.length,
      totalVisits: visits.length,
      completed,
      cancelled,
      noShow,
      revenueTotal,
      byDay,
      maxDayCount: Math.max(1, maxCount),
      busiestDay,
    };
  }, [workspace, period, todayIso, weekAgoIso, monthPrefix]);

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Time',
      'Patient',
      'Phone',
      'Status',
      'VisitType',
      'FeeAmount',
    ].join(',');
    const rows = metrics.appts.map((a) =>
      [
        a.date,
        a.time,
        `"${(a.patientName || '').replace(/"/g, '""')}"`,
        a.patientPhone,
        a.status,
        a.visitType,
        a.feeAmount || 0,
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medora-doctor-report-${period}-${todayIso}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {rc.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rc.noDataBanner}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'day', label: rc.periodDay },
              { id: 'week', label: rc.periodWeek },
              { id: 'month', label: rc.periodMonth },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
                period === p.id
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => {
              const periodLabel =
                period === 'day'
                  ? rc.periodDay
                  : period === 'week'
                    ? rc.periodWeek
                    : rc.periodMonth;
              const statusCounts = (
                [
                  'pending',
                  'confirmed',
                  'checked_in',
                  'completed',
                  'cancelled',
                  'rejected',
                  'no_show',
                ] as const
              ).map((st) => ({
                label: dc.appointmentStatuses[st],
                count: metrics.appts.filter((a) => a.status === st).length,
              }));
              const dayCounts = (Object.keys(metrics.byDay) as DayOfWeekKey[]).map((k) => ({
                label: dc.days[k],
                count: metrics.byDay[k],
              }));
              void printMedoraDocument(
                <DoctorClinicReportPrintSheet
                  lang={language}
                  doctorProfile={workspace.doctorProfile}
                  periodLabel={periodLabel}
                  stats={{
                    totalPatients: metrics.totalPatients,
                    newPatients: metrics.newPatients,
                    totalVisits: metrics.totalVisits,
                    completedBookings: metrics.completed,
                    cancelledBookings: metrics.cancelled,
                    noShowBookings: metrics.noShow,
                    busiestDay: metrics.busiestDay ? dc.days[metrics.busiestDay] : '—',
                    totalRevenue: metrics.revenueTotal,
                    statusCounts,
                    dayCounts,
                  }}
                />,
                sanitizePdfFilename(`clinic-report-${period}-${todayIso}`),
              );
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-[#f4d378] cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{rc.printReportBtn}</span>
          </button>

          <button
            type="button"
            disabled={exportingPdf}
            onClick={async () => {
              setExportingPdf(true);
              try {
                const periodLabel =
                  period === 'day'
                    ? rc.periodDay
                    : period === 'week'
                      ? rc.periodWeek
                      : rc.periodMonth;
                const statusCounts = (
                  [
                    'pending',
                    'confirmed',
                    'checked_in',
                    'completed',
                    'cancelled',
                    'rejected',
                    'no_show',
                  ] as const
                ).map((st) => ({
                  label: dc.appointmentStatuses[st],
                  count: metrics.appts.filter((a) => a.status === st).length,
                }));
                const dayCounts = (Object.keys(metrics.byDay) as DayOfWeekKey[]).map((k) => ({
                  label: dc.days[k],
                  count: metrics.byDay[k],
                }));
                await downloadMedoraPdf({
                  filename: sanitizePdfFilename(`clinic-report-${period}-${todayIso}.pdf`),
                  element: (
                    <DoctorClinicReportPrintSheet
                      lang={language}
                      doctorProfile={workspace.doctorProfile}
                      periodLabel={periodLabel}
                      stats={{
                        totalPatients: metrics.totalPatients,
                        newPatients: metrics.newPatients,
                        totalVisits: metrics.totalVisits,
                        completedBookings: metrics.completed,
                        cancelledBookings: metrics.cancelled,
                        noShowBookings: metrics.noShow,
                        busiestDay: metrics.busiestDay ? dc.days[metrics.busiestDay] : '—',
                        totalRevenue: metrics.revenueTotal,
                        statusCounts,
                        dayCounts,
                      }}
                    />
                  ),
                  dir: language === 'ar' ? 'rtl' : 'ltr',
                });
              } finally {
                setExportingPdf(false);
              }
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{exportingPdf ? rc.exportingPdf : rc.downloadReportPdfBtn}</span>
          </button>

          <button
            type="button"
            disabled={metrics.appts.length === 0}
            onClick={handleExportCsv}
            className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{rc.exportCsvBtn}</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {rc.totalPatients}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {metrics.totalPatients}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {rc.newPatients}: {metrics.newPatients}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {rc.totalVisits}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {metrics.totalVisits}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {rc.completedBookings}
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {metrics.completed}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {rc.cancelledBookings}: {metrics.cancelled} · {rc.noShowBookings}: {metrics.noShow}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {rc.revenueSummary}
          </p>
          {metrics.revenueTotal > 0 ? (
            <p className="mt-2 font-latin text-2xl font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
              {metrics.revenueTotal.toLocaleString()} {dc.directory.feeUnit}
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {rc.noRevenueData}
            </p>
          )}
          {metrics.busiestDay && (
            <p className="mt-1 text-xs text-slate-500">
              {rc.busiestDay}: {dc.days[metrics.busiestDay]}
            </p>
          )}
        </div>
      </div>

      {/* Day of Week Distribution Chart */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <BarChart3 className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {rc.dayDistribution}
          </h3>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-3">
          {(Object.keys(metrics.byDay) as DayOfWeekKey[]).map((dayKey) => {
            const val = metrics.byDay[dayKey];
            const pct = Math.round((val / metrics.maxDayCount) * 100);
            return (
              <div key={dayKey} className="flex flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end justify-center rounded-xl bg-slate-100 p-1.5 dark:bg-slate-900">
                  <div
                    style={{ height: `${val === 0 ? 4 : Math.max(12, pct)}%` }}
                    className={`w-full max-w-[32px] rounded-lg ${
                      val === 0
                        ? 'bg-slate-300 dark:bg-slate-700'
                        : 'bg-gradient-to-t from-[#0c3585] to-[#d9a43b]'
                    }`}
                  />
                </div>
                <span className="font-latin text-xs font-bold text-slate-900 tabular-nums dark:text-white">
                  {val}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {dc.days[dayKey]}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

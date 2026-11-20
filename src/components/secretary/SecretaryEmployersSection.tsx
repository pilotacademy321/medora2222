import { Building2, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import type { Language } from '../../types/medora';
import type { SecretaryEmploymentRecord } from '../../types/secretary';

interface SecretaryEmployersSectionProps {
  employments: SecretaryEmploymentRecord[];
  selectedEmploymentId: string | null;
  language: Language;
  onSelectEmployment: (employmentId: string) => void;
}

export function SecretaryEmployersSection({
  employments,
  selectedEmploymentId,
  language,
  onSelectEmployment,
}: SecretaryEmployersSectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const em = st.portal.employers;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{em.title}</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{em.subtitle}</p>
      </div>

      {employments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {em.empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {employments.map((emp) => {
            const isSelected = emp.employmentId === selectedEmploymentId;
            const statusStyle =
              emp.status === 'Active'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                : emp.status === 'Suspended'
                  ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';

            return (
              <article
                key={emp.employmentId}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-6 dark:bg-[#07122a] ${
                  isSelected
                    ? 'border-[#d9a43b] ring-1 ring-[#d9a43b]/40'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                      <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                        {st.employerTypeLabels[emp.employerType]}
                      </span>
                    </div>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${statusStyle}`}>
                      {st.employmentStatuses[emp.status]}
                    </span>
                  </div>

                  <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                    {emp.employerName}
                  </h3>
                  {emp.employerSubtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {emp.employerSubtitle}
                    </p>
                  )}
                  <p className="mt-1 font-latin text-[11px] text-slate-400 tabular-nums" dir="ltr">
                    {em.acceptedAtLabel}: {new Date(emp.acceptedAt).toLocaleDateString()}
                  </p>

                  {emp.status === 'Suspended' && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{em.suspendedNotice}</span>
                    </div>
                  )}

                  {emp.status === 'Terminated' && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{em.terminatedNotice}</span>
                    </div>
                  )}

                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {em.permissionsTitle}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                      {emp.permissions.map((p) => (
                        <li key={p} className="flex items-center gap-2">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{st.permissions[p]?.label || p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {emp.status === 'Active' && (
                  <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {isSelected ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{em.activeWorkspaceTag}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectEmployment(emp.employmentId)}
                        className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                      >
                        {em.switchBtn}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { Edit3, User } from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';

interface SharedPersonalSummaryProps {
  onEditPersonal: () => void;
}

export function SharedPersonalSummary({
  onEditPersonal,
}: SharedPersonalSummaryProps) {
  const { t, userAccount } = useMedora();
  if (!userAccount) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-[#040a1a]/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <span className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
          {t.forms.sharedSummaryTitle}
        </span>
        <button
          type="button"
          onClick={onEditPersonal}
          className="inline-flex min-h-[34px] items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0c3585] dark:text-slate-300 dark:hover:text-[#f4d378] cursor-pointer"
        >
          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t.forms.editPersonalInfo}</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {userAccount.avatarUrl || userAccount.photoUrl ? (
          <img
            src={userAccount.avatarUrl || userAccount.photoUrl}
            alt={userAccount.fullName || userAccount.googleName}
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full border border-[#d9a43b]/40 object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800">
            <User className="h-5 w-5 text-slate-500" />
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
          <div>
            <span className="text-slate-500 dark:text-slate-400">
              {t.personal.fullName}:{' '}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {userAccount.fullName || userAccount.googleName}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">
              {t.personal.dateOfBirth}:{' '}
            </span>
            <span className="font-latin font-medium text-slate-900 tabular-nums dark:text-white" dir="ltr">
              {userAccount.dateOfBirth || '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">
              {t.personal.gender}:{' '}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">
              {userAccount.gender === 'female'
                ? t.common.female
                : userAccount.gender === 'male'
                  ? t.common.male
                  : '—'}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500 dark:text-slate-400">
              {t.personal.governorate} / {t.personal.district}:{' '}
            </span>
            <span className="font-medium text-slate-900 dark:text-white">
              {userAccount.governorate} — {userAccount.district} ({userAccount.address})
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">
              {t.personal.phone}:{' '}
            </span>
            <span className="font-latin font-medium text-slate-900 tabular-nums dark:text-white" dir="ltr">
              {userAccount.phone || '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

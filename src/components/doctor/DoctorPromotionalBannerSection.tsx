import { type User } from 'firebase/auth';
import { Lock } from 'lucide-react';
import type { DoctorWorkspaceData } from '../../types/doctor';
import type { Language } from '../../types/medora';

interface DoctorPromotionalBannerSectionProps {
  firebaseUser?: User;
  workspace?: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace?: () => Promise<void>;
  onOpenPublicDirectory?: () => void;
}

export function DoctorPromotionalBannerSection({
  language,
}: DoctorPromotionalBannerSectionProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="font-bold text-slate-900 dark:text-white">
          {language === 'ar'
            ? 'إدارة الإعلانات محصورة بالإدارة العليا (Super Admin)'
            : 'Promotional Ads Are Centrally Managed by Super Admin'}
        </h2>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {language === 'ar'
            ? 'لا يمكن إنشاء أو رفع الإعلانات الترويجية من بوابة الطبيب. جميع الإعلانات تُراجع وتُرفع وتُنشر حصراً من قبل الإدارة العليا.'
            : 'Doctors cannot create or upload promotional ads. All homepage ads are reviewed, uploaded, and published exclusively by MEDORA Super Admin.'}
        </p>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { AlertCircle, MessageSquareReply, Star } from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { replyToLabReview } from '../../services/labService';

interface LabReviewsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canReply: boolean;
  onRefresh: () => Promise<void>;
}

export const LabReviewsSection: React.FC<LabReviewsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canReply,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [filterType, setFilterType] = useState<'all' | 'review' | 'complaint'>('all');
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const stats = useMemo(() => {
    const approved = workspace.reviews.filter((r) => r.status === 'approved');
    const avg =
      approved.length > 0
        ? approved.reduce((sum, r) => sum + Number(r.rating || 0), 0) / approved.length
        : Number(workspace.labProfile.averageRating || 0);
    const complaints = workspace.reviews.filter((r) => r.reviewType === 'complaint').length;
    return {
      avg: avg.toFixed(1),
      total: workspace.reviews.length,
      complaints,
    };
  }, [workspace.reviews, workspace.labProfile.averageRating]);

  const filtered = useMemo(() => {
    if (filterType === 'all') return workspace.reviews;
    return workspace.reviews.filter((r) => r.reviewType === filterType);
  }, [workspace.reviews, filterType]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!canReply || !replyDraft.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await replyToLabReview(firebaseUser, reviewId, replyDraft.trim());
      await onRefresh();
      setReplyTargetId(null);
      setReplyDraft('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.reviews.title}</h2>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">{lt.reviews.avgRating}</div>
          <div className="mt-1.5 flex items-center gap-1.5 font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span>{stats.avg} / 5</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">{lt.reviews.totalReviews}</div>
          <div className="mt-1.5 font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
            {stats.total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">{lt.reviews.complaintsCount}</div>
          <div className="mt-1.5 font-latin tabular-nums text-xl font-bold text-rose-600 dark:text-rose-400">
            {stats.complaints}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: lt.common.all },
            { id: 'review', label: isAr ? 'التقييمات' : 'Reviews' },
            { id: 'complaint', label: isAr ? 'الشكاوى' : 'Complaints' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilterType(t.id)}
            className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
              filterType === t.id
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-8 text-center text-xs text-slate-500">
          {lt.common.noData}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rev) => (
            <div
              key={rev.reviewId}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-2.5 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{rev.patientName}</span>
                  {rev.reviewType === 'complaint' && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      <AlertCircle className="h-3 w-3" />
                      <span>{isAr ? 'شكوى' : 'Complaint'}</span>
                    </span>
                  )}
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {rev.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-latin tabular-nums font-bold text-amber-500">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-3.5 w-3.5 ${
                        idx < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  ))}
                  <span className="ms-2 text-[11px] font-normal text-slate-500">
                    {String(rev.createdAt || '').slice(0, 10)}
                  </span>
                </div>
              </div>

              <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {rev.comment}
              </p>

              {rev.labReply && (
                <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-500/30 p-3">
                  <div className="text-[11px] font-bold text-[#0c3585] dark:text-blue-300 mb-1">
                    {lt.reviews.writeReply} · {rev.repliedByName || ''}
                  </div>
                  <p className="text-slate-700 dark:text-slate-200">{rev.labReply}</p>
                </div>
              )}

              {canReply && (
                <div>
                  {replyTargetId === rev.reviewId ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={2}
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder={lt.reviews.writeReply}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] p-2.5 text-slate-900 dark:text-white"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTargetId(null);
                            setReplyDraft('');
                          }}
                          className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 font-semibold cursor-pointer"
                        >
                          {lt.common.cancel}
                        </button>
                        <button
                          type="button"
                          disabled={saving || !replyDraft.trim()}
                          onClick={() => void handleSubmitReply(rev.reviewId)}
                          className="medora-gold-button min-h-[36px] rounded-xl px-4 font-bold cursor-pointer disabled:opacity-60"
                        >
                          {saving ? lt.common.saving : lt.reviews.sendReply}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTargetId(rev.reviewId);
                        setReplyDraft(rev.labReply || '');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0c3585] dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <MessageSquareReply className="h-3.5 w-3.5" />
                      <span>{rev.labReply ? lt.common.edit : lt.reviews.writeReply}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

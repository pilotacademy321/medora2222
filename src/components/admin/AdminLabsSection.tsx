import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  EyeOff,
  Flag,
  FlaskConical,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import {
  fetchAdminLabsOverview,
  markAdminLabMessagesRead,
  moderateAdminLabReview,
  sendAdminLabMessage,
  type AdminLabSummaryRecord,
  type AdminLabsOverviewPayload,
} from '../../services/labService';
import type { LabReviewRecord } from '../../types/lab';
import type { Language } from '../../types/medora';

interface AdminLabsSectionProps {
  firebaseUser: User;
  language: Language;
}

type LabGovernanceTab = 'labs' | 'reviews' | 'messages';
type ReviewFilter = 'all' | 'complaint' | 'flagged' | 'approved' | 'hidden';

export function AdminLabsSection({ firebaseUser, language }: AdminLabsSectionProps) {
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<LabGovernanceTab>('labs');
  const [overview, setOverview] = useState<AdminLabsOverviewPayload>({
    labs: [],
    reviews: [],
    adminMessages: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Labs Directory state
  const [labSearch, setLabSearch] = useState('');

  // Reviews Moderation state
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  // Official Messaging state
  const [selectedLabUid, setSelectedLabUid] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAdminLabsOverview(firebaseUser);
      setOverview(payload);
      setSelectedLabUid((prev) => {
        if (prev && payload.labs.some((l) => l.uid === prev)) return prev;
        return payload.labs[0]?.uid || '';
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل بيانات حوكمة المختبرات.'
            : 'Failed to load MEDORA LAB governance overview.',
      );
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isAr]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const unreadByLabMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const msg of overview.adminMessages) {
      if (msg.senderRole === 'lab' && !msg.isReadByAdmin) {
        map[msg.labUid] = (map[msg.labUid] || 0) + 1;
      }
    }
    return map;
  }, [overview.adminMessages]);

  const totalUnreadMessages = useMemo(
    () => Object.values(unreadByLabMap).reduce((sum, n) => sum + n, 0),
    [unreadByLabMap],
  );

  // Automatically mark unread lab-originated messages as read when Admin inspects a lab's thread
  useEffect(() => {
    if (activeTab !== 'messages' || !selectedLabUid) return;
    const hasUnread = overview.adminMessages.some(
      (m) => m.labUid === selectedLabUid && m.senderRole === 'lab' && !m.isReadByAdmin,
    );
    if (!hasUnread) return;
    void markAdminLabMessagesRead(firebaseUser, selectedLabUid)
      .then(() => {
        setOverview((prev) => ({
          ...prev,
          adminMessages: prev.adminMessages.map((m) =>
            m.labUid === selectedLabUid && m.senderRole === 'lab'
              ? { ...m, isReadByAdmin: true }
              : m,
          ),
        }));
      })
      .catch(() => {
        // Non-blocking mark-read retry on next open
      });
  }, [activeTab, selectedLabUid, overview.adminMessages, firebaseUser]);

  const filteredLabs = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    if (!q) return overview.labs;
    return overview.labs.filter(
      (lab) =>
        (lab.labNameAr || '').toLowerCase().includes(q) ||
        (lab.labNameEn || '').toLowerCase().includes(q) ||
        (lab.governorate || '').toLowerCase().includes(q) ||
        (lab.district || '').toLowerCase().includes(q) ||
        (lab.licenseNumber || '').toLowerCase().includes(q) ||
        (lab.directorName || '').toLowerCase().includes(q),
    );
  }, [overview.labs, labSearch]);

  const filteredReviews = useMemo(() => {
    return overview.reviews.filter((rev) => {
      if (reviewFilter === 'all') return true;
      if (reviewFilter === 'complaint') return rev.reviewType === 'complaint';
      return rev.status === reviewFilter;
    });
  }, [overview.reviews, reviewFilter]);

  const selectedLabThread = useMemo(() => {
    if (!selectedLabUid) return [];
    return overview.adminMessages.filter((m) => m.labUid === selectedLabUid);
  }, [overview.adminMessages, selectedLabUid]);

  const selectedLabRecord: AdminLabSummaryRecord | undefined = useMemo(
    () => overview.labs.find((l) => l.uid === selectedLabUid),
    [overview.labs, selectedLabUid],
  );

  const handleModerateReview = async (
    review: LabReviewRecord,
    nextStatus: 'approved' | 'hidden' | 'flagged' | 'removed',
  ) => {
    setModeratingId(review.reviewId);
    setError(null);
    setNotice(null);
    try {
      const note = adminNotes[review.reviewId] ?? review.adminNote ?? '';
      const updated = await moderateAdminLabReview(firebaseUser, review.reviewId, {
        status: nextStatus,
        adminNote: note.trim() || undefined,
      });
      setOverview((prev) => ({
        ...prev,
        reviews: prev.reviews.map((r) => (r.reviewId === updated.reviewId ? updated : r)),
      }));
      setNotice(
        isAr
          ? 'تم تحديث حالة التقييم وإعادة احتساب تقييم المختبر بنجاح.'
          : 'Review moderation status updated and lab rating recalculated.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MODERATION_FAILED');
    } finally {
      setModeratingId(null);
    }
  };

  const handleSendAdminMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLabUid || !body.trim()) return;
    setSendingMessage(true);
    setError(null);
    setNotice(null);
    try {
      const created = await sendAdminLabMessage(firebaseUser, selectedLabUid, {
        subject: subject.trim() || (isAr ? 'رسالة إدارية رسمية' : 'Official Admin Notice'),
        body: body.trim(),
      });
      setOverview((prev) => ({
        ...prev,
        adminMessages: [created, ...prev.adminMessages],
      }));
      setSubject('');
      setBody('');
      setNotice(
        isAr
          ? 'تم إرسال الرسالة الإدارية وإشعار مدير المختبر.'
          : 'Official administrative message sent to the laboratory manager.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SEND_FAILED');
    } finally {
      setSendingMessage(false);
    }
  };

  const openThreadForLab = (labUid: string) => {
    setSelectedLabUid(labUid);
    setActiveTab('messages');
  };

  const activeLabsCount = overview.labs.filter((l) => l.institutionStatus === 'active').length;
  const complaintsCount = overview.reviews.filter((r) => r.reviewType === 'complaint').length;
  const totalOrdersCount = overview.labs.reduce((sum, l) => sum + (l.ordersCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي المختبرات المسجلة' : 'Registered Laboratories'}
            </span>
            <FlaskConical className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold text-slate-900 dark:text-white">
            {overview.labs.length}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            {isAr ? `${activeLabsCount} مختبر فعّال` : `${activeLabsCount} active`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي طلبات التحاليل' : 'Total Lab Orders'}
            </span>
            <Building2 className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold text-slate-900 dark:text-white">
            {totalOrdersCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'عبر كافة المختبرات المعتمدة' : 'Across all registered labs'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'تقييمات وشكاوى المختبرات' : 'Lab Reviews & Complaints'}
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold text-slate-900 dark:text-white">
            {overview.reviews.length}
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            {isAr ? `${complaintsCount} شكوى مسجلة` : `${complaintsCount} complaints`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'مراسلات المختبرات غير المقروءة' : 'Unread Lab Messages'}
            </span>
            <Mail className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold text-slate-900 dark:text-white">
            {totalUnreadMessages}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? `${overview.adminMessages.length} رسالة إجمالية`
              : `${overview.adminMessages.length} total messages`}
          </p>
        </div>
      </div>

      {/* Header Actions & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('labs')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'labs'
                ? 'bg-[#0c3585] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            <span>{isAr ? 'دليل المختبرات' : 'Laboratories'}</span>
            <span className="font-latin rounded-md bg-black/15 px-1.5 py-0.5 text-[11px]">
              {overview.labs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('reviews')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'reviews'
                ? 'bg-[#0c3585] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <Star className="h-4 w-4" />
            <span>{isAr ? 'رقابة التقييمات والشكاوى' : 'Reviews & Complaints'}</span>
            <span className="font-latin rounded-md bg-black/15 px-1.5 py-0.5 text-[11px]">
              {overview.reviews.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'messages'
                ? 'bg-[#0c3585] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>{isAr ? 'المراسلات الرسمية مع المختبرات' : 'Official Lab Threads'}</span>
            {totalUnreadMessages > 0 && (
              <span className="font-latin rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] text-white">
                {totalUnreadMessages}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'تحديث البيانات' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {isAr ? 'جاري تحميل بيانات المختبرات...' : 'Loading laboratory governance data...'}
        </div>
      ) : (
        <>
          {/* TAB 1: REGISTERED LABORATORIES DIRECTORY */}
          {activeTab === 'labs' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={labSearch}
                  onChange={(e) => setLabSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ابحث باسم المختبر، المحافظة، المدير، أو رقم الإجازة...'
                      : 'Search by lab name, governorate, director, or license...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-4 ps-10 text-sm text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:text-white"
                />
              </div>

              {filteredLabs.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
                  {isAr ? 'لا توجد مختبرات مطابقة للبحث حالياً.' : 'No laboratories match your search.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {filteredLabs.map((lab) => {
                    const unreadCount = unreadByLabMap[lab.uid] || 0;
                    const isActive = lab.institutionStatus === 'active';
                    return (
                      <div
                        key={lab.uid}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
                      >
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {isAr ? lab.labNameAr : lab.labNameEn || lab.labNameAr}
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {lab.governorate}
                                {lab.district ? ` — ${lab.district}` : ''}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                                isActive
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                              }`}
                            >
                              {isActive
                                ? isAr
                                  ? 'فعّال ومعتمد'
                                  : 'Active'
                                : lab.institutionStatus}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'مدير المختبر:' : 'Director:'}
                              </span>{' '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {lab.directorName || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'رقم الإجازة:' : 'License No:'}
                              </span>{' '}
                              <span className="font-latin font-semibold text-slate-800 dark:text-slate-200">
                                {lab.licenseNumber || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الكادر الفعّال:' : 'Staff:'}
                              </span>
                              <span className="font-latin font-bold text-slate-900 dark:text-white">
                                {lab.activeStaffCount}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الطلبات:' : 'Orders:'}
                              </span>{' '}
                              <span className="font-latin font-bold text-slate-900 dark:text-white">
                                {lab.ordersCount}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Star className="h-3.5 w-3.5 text-amber-500" />
                              <span className="font-latin font-bold text-slate-900 dark:text-white">
                                {(lab.averageRating || 0).toFixed(1)}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                ({lab.reviewCount || 0})
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'السحب المنزلي:' : 'Home Collection:'}
                              </span>{' '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {lab.homeCollectionEnabled
                                  ? isAr
                                    ? 'مفعل'
                                    : 'Enabled'
                                  : isAr
                                    ? 'معطل'
                                    : 'Disabled'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <span className="font-latin text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                            {lab.professionalPhone || lab.managerFullName}
                          </span>
                          <button
                            type="button"
                            onClick={() => openThreadForLab(lab.uid)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#092868] cursor-pointer"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>{isAr ? 'مراسلة المختبر' : 'Message Lab'}</span>
                            {unreadCount > 0 && (
                              <span className="font-latin rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px]">
                                {unreadCount}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LAB REVIEWS & COMPLAINTS MODERATION */}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all', label: isAr ? 'الكل' : 'All' },
                    { id: 'complaint', label: isAr ? 'الشكاوى' : 'Complaints' },
                    { id: 'flagged', label: isAr ? 'المبلغ عنها' : 'Flagged' },
                    { id: 'approved', label: isAr ? 'المعتمدة' : 'Approved' },
                    { id: 'hidden', label: isAr ? 'المخفية' : 'Hidden' },
                  ] as Array<{ id: ReviewFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setReviewFilter(f.id)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
                      reviewFilter === f.id
                        ? 'bg-[#0c3585] text-white'
                        : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
                  {isAr ? 'لا توجد تقييمات أو شكاوى ضمن هذا التصنيف.' : 'No reviews in this filter.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReviews.map((rev) => {
                    const isBusy = moderatingId === rev.reviewId;
                    return (
                      <div
                        key={rev.reviewId}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">
                                {rev.labNameAr || rev.labUid}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                  rev.reviewType === 'complaint'
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                }`}
                              >
                                {rev.reviewType === 'complaint'
                                  ? isAr
                                    ? 'شكوى'
                                    : 'Complaint'
                                  : isAr
                                    ? 'تقييم'
                                    : 'Review'}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-latin text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {rev.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {isAr ? 'المريض:' : 'Patient:'} {rev.patientName} •{' '}
                              <span className="font-latin font-semibold text-amber-600">
                                ★ {rev.rating}/5
                              </span>
                            </p>
                          </div>
                          {rev.createdAt && (
                            <span className="font-latin text-xs text-slate-400" dir="ltr">
                              {rev.createdAt.slice(0, 10)}
                            </span>
                          )}
                        </div>

                        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                          {rev.comment}
                        </p>

                        {rev.labReply && (
                          <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
                            <span className="font-bold">
                              {isAr ? 'رد المختبر:' : 'Lab Reply:'}
                            </span>{' '}
                            {rev.labReply}
                          </p>
                        )}

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            value={adminNotes[rev.reviewId] ?? rev.adminNote ?? ''}
                            onChange={(e) =>
                              setAdminNotes((prev) => ({
                                ...prev,
                                [rev.reviewId]: e.target.value,
                              }))
                            }
                            placeholder={
                              isAr ? 'ملاحظة إدارية اختيارية...' : 'Optional moderation note...'
                            }
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleModerateReview(rev, 'approved')}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>{isAr ? 'اعتماد' : 'Approve'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleModerateReview(rev, 'flagged')}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                            >
                              <Flag className="h-3.5 w-3.5" />
                              <span>{isAr ? 'تعليم' : 'Flag'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleModerateReview(rev, 'hidden')}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                              <span>{isAr ? 'إخفاء' : 'Hide'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleModerateReview(rev, 'removed')}
                              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{isAr ? 'إزالة' : 'Remove'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OFFICIAL SUPER ADMIN <-> LAB THREAD */}
          {activeTab === 'messages' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Lab Selector Column */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07122a]">
                <h3 className="mb-3 px-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {isAr ? 'اختر المختبر' : 'Select Laboratory'}
                </h3>
                <div className="max-h-[460px] space-y-1.5 overflow-y-auto">
                  {overview.labs.map((lab) => {
                    const active = selectedLabUid === lab.uid;
                    const unread = unreadByLabMap[lab.uid] || 0;
                    return (
                      <button
                        key={lab.uid}
                        type="button"
                        onClick={() => setSelectedLabUid(lab.uid)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-start text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0c3585] text-white'
                            : 'bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate">
                            {isAr ? lab.labNameAr : lab.labNameEn || lab.labNameAr}
                          </p>
                          <p
                            className={`truncate text-[11px] ${
                              active ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {lab.governorate}
                          </p>
                        </div>
                        {unread > 0 && (
                          <span className="font-latin rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {overview.labs.length === 0 && (
                    <p className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      {isAr ? 'لا توجد مختبرات مسجلة بعد.' : 'No labs registered yet.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Conversation & Send Form */}
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-2">
                <div>
                  <div className="mb-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {selectedLabRecord
                        ? isAr
                          ? `المراسلة الرسمية: ${selectedLabRecord.labNameAr}`
                          : `Official Thread: ${selectedLabRecord.labNameEn || selectedLabRecord.labNameAr}`
                        : isAr
                          ? 'اختر مختبراً لعرض المراسلات'
                          : 'Select a lab to view thread'}
                    </h3>
                  </div>

                  <div className="max-h-[340px] space-y-2.5 overflow-y-auto pe-1">
                    {selectedLabThread.length === 0 ? (
                      <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                        {isAr
                          ? 'لا توجد رسائل مسجلة مع هذا المختبر حتى الآن.'
                          : 'No official messages with this laboratory yet.'}
                      </p>
                    ) : (
                      selectedLabThread.map((msg) => {
                        const fromAdmin = msg.senderRole === 'super_admin';
                        return (
                          <div
                            key={msg.threadMessageId}
                            className={`rounded-xl border p-3 text-xs ${
                              fromAdmin
                                ? 'border-[#0c3585]/20 bg-[#0c3585]/5 dark:border-[#0c3585]/40 dark:bg-[#0c3585]/20'
                                : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {fromAdmin
                                  ? isAr
                                    ? 'الإدارة العليا MEDORA'
                                    : 'MEDORA Super Admin'
                                  : msg.senderName || msg.labNameAr}
                              </span>
                              <span className="font-latin text-[11px] text-slate-400" dir="ltr">
                                {msg.createdAt ? msg.createdAt.slice(0, 16).replace('T', ' ') : ''}
                              </span>
                            </div>
                            {msg.subject && (
                              <p className="mt-1 font-semibold text-slate-700 dark:text-slate-300">
                                {msg.subject}
                              </p>
                            )}
                            <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">
                              {msg.body}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {selectedLabUid && (
                  <form
                    onSubmit={handleSendAdminMessage}
                    className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800"
                  >
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={
                        isAr ? 'موضوع الرسالة الإدارية...' : 'Official message subject...'
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <textarea
                        rows={2}
                        required
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={
                          isAr
                            ? 'اكتب التوجيه أو الرسالة الرسمية لمدير المختبر...'
                            : 'Write official notice or guidance to laboratory manager...'
                        }
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        disabled={sendingMessage || !body.trim()}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0c3585] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#092868] disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>{isAr ? 'إرسال رسمي' : 'Send Notice'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

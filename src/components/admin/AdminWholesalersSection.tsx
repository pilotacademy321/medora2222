import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Building2,
  CheckCircle2,
  Package,
  PauseCircle,
  Receipt,
  RefreshCw,
  Search,
  Users,
  Warehouse,
  XCircle,
} from 'lucide-react';
import {
  fetchAdminWholesalersOverview,
  updateAdminWholesalerStatus,
  type AdminWholesalersOverview,
} from '../../services/medicineFinderService';
import type { Language } from '../../types/medora';
import type { WholesalerEntityStatus, WholesalerProfileDocument } from '../../types/wholesaler';

interface AdminWholesalersSectionProps {
  firebaseUser: User;
  language: Language;
}

type WholesalerAdminTab = 'wholesalers' | 'supply_orders' | 'invoices';

export function AdminWholesalersSection({
  firebaseUser,
  language,
}: AdminWholesalersSectionProps) {
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<WholesalerAdminTab>('wholesalers');
  const [overview, setOverview] = useState<AdminWholesalersOverview>({
    wholesalers: [],
    supplyOrders: [],
    invoices: [],
    staff: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminWholesalersOverview(firebaseUser);
      setOverview(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل بيانات حوكمة المذاخر الدوائية.'
            : 'Failed to load wholesaler governance overview.',
      );
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isAr]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleStatusChange = async (
    wholesaler: WholesalerProfileDocument,
    nextStatus: Extract<
      WholesalerEntityStatus,
      'Approved' | 'Suspended' | 'Deactivated' | 'Requires Changes' | 'Rejected'
    >,
  ) => {
    setUpdatingUid(wholesaler.uid);
    setError(null);
    setNotice(null);
    try {
      const reason = statusNotes[wholesaler.uid]?.trim() || undefined;
      const { wholesaler: updated } = await updateAdminWholesalerStatus(
        firebaseUser,
        wholesaler.uid,
        nextStatus,
        reason,
      );
      setOverview((prev) => ({
        ...prev,
        wholesalers: prev.wholesalers.map((w) => (w.uid === updated.uid ? updated : w)),
      }));
      setNotice(
        isAr
          ? `تم تحديث حالة المذخر إلى ${nextStatus}.`
          : `Wholesaler status updated to ${nextStatus}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WHOLESALER_STATUS_UPDATE_FAILED');
    } finally {
      setUpdatingUid(null);
    }
  };

  const filteredWholesalers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overview.wholesalers;
    return overview.wholesalers.filter(
      (w) =>
        (w.wholesalerNameAr || '').toLowerCase().includes(q) ||
        (w.wholesalerNameEn || '').toLowerCase().includes(q) ||
        (w.legalEntityName || '').toLowerCase().includes(q) ||
        (w.warehouseLicenseNumber || '').toLowerCase().includes(q) ||
        (w.governorate || '').toLowerCase().includes(q),
    );
  }, [overview.wholesalers, search]);

  const approvedCount = overview.wholesalers.filter((w) => w.status === 'Approved').length;
  const openOrdersCount = overview.supplyOrders.filter(
    (o) => !['Completed', 'Cancelled', 'Rejected'].includes(o.status),
  ).length;
  const totalB2BValue = overview.invoices.reduce((sum, inv) => sum + (inv.totalIqd || 0), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'المذاخر الدوائية المسجلة' : 'Registered Wholesalers'}
            </span>
            <Warehouse className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.wholesalers.length}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            {isAr ? `${approvedCount} مذخر معتمد` : `${approvedCount} approved`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'طلبات التوريد B2B' : 'B2B Supply Orders'}
            </span>
            <Package className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.supplyOrders.length}
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {isAr ? `${openOrdersCount} طلب توريد مفتوح` : `${openOrdersCount} active`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'الفواتير التجارية' : 'B2B Invoices'}
            </span>
            <Receipt className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.invoices.length}
          </p>
          <p className="mt-1 font-latin text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {totalB2BValue.toLocaleString()} IQD
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'كادر المذاخر' : 'Wholesaler Staff'}
            </span>
            <Users className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.staff.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'طاقم مستقل للصلاحيات' : 'Independent RBAC staff'}
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              {
                id: 'wholesalers',
                icon: Building2,
                label: isAr ? 'المذاخر الدوائية' : 'Wholesalers',
                count: overview.wholesalers.length,
              },
              {
                id: 'supply_orders',
                icon: Package,
                label: isAr ? 'طلبات التوريد' : 'Supply Orders',
                count: overview.supplyOrders.length,
              },
              {
                id: 'invoices',
                icon: Receipt,
                label: isAr ? 'الفواتير التجارية' : 'Invoices',
                count: overview.invoices.length,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#0c3585] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="font-latin rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] tabular-nums">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'تحديث' : 'Refresh'}</span>
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
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {isAr ? 'جاري تحميل بيانات المذاخر...' : 'Loading wholesaler governance...'}
        </div>
      ) : (
        <>
          {activeTab === 'wholesalers' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ابحث باسم المذخر، الكيان القانوني، المحافظة، أو رقم الإجازة...'
                      : 'Search wholesaler name, legal entity, governorate, or license...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-4 ps-10 text-sm text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:text-white"
                />
              </div>

              {filteredWholesalers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
                  {isAr ? 'لا توجد مذاخر مطابقة.' : 'No wholesalers found.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {filteredWholesalers.map((wholesaler) => {
                    const busy = updatingUid === wholesaler.uid;
                    const staffCount = overview.staff.filter(
                      (s) => s.wholesalerUid === wholesaler.uid && s.status === 'active',
                    ).length;
                    const ordersCount = overview.supplyOrders.filter(
                      (o) => o.wholesalerUid === wholesaler.uid,
                    ).length;

                    return (
                      <div
                        key={wholesaler.uid}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
                      >
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {isAr
                                  ? wholesaler.wholesalerNameAr
                                  : wholesaler.wholesalerNameEn || wholesaler.wholesalerNameAr}
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {wholesaler.governorate}
                                {wholesaler.district ? ` — ${wholesaler.district}` : ''}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 font-latin text-[11px] font-bold ${
                                wholesaler.status === 'Approved'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : wholesaler.status === 'Suspended' ||
                                      wholesaler.status === 'Deactivated' ||
                                      wholesaler.status === 'Rejected'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                              }`}
                            >
                              {wholesaler.status}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الكيان القانوني:' : 'Legal Entity:'}
                              </span>{' '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {wholesaler.legalEntityName || wholesaler.ownerFullName || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'إجازة المستودع:' : 'Warehouse Lic:'}
                              </span>{' '}
                              <span className="font-latin font-semibold text-slate-800 dark:text-slate-200">
                                {wholesaler.warehouseLicenseNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'إجازة الصحة:' : 'MOH License:'}
                              </span>{' '}
                              <span className="font-latin font-semibold text-slate-800 dark:text-slate-200">
                                {wholesaler.healthAuthorityLicenseNumber || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الكادر / التوريدات:' : 'Staff / Orders:'}
                              </span>{' '}
                              <span className="font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                                {staffCount} / {ordersCount}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <input
                            type="text"
                            value={statusNotes[wholesaler.uid] || ''}
                            onChange={(e) =>
                              setStatusNotes((prev) => ({
                                ...prev,
                                [wholesaler.uid]: e.target.value,
                              }))
                            }
                            placeholder={
                              isAr ? 'ملاحظة أو سبب القرار الإداري...' : 'Optional governance reason...'
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            {wholesaler.status !== 'Approved' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(wholesaler, 'Approved')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تفعيل / اعتماد' : 'Approve'}</span>
                              </button>
                            )}
                            {wholesaler.status !== 'Suspended' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(wholesaler, 'Suspended')}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                                <span>{isAr ? 'إيقاف مؤقت' : 'Suspend'}</span>
                              </button>
                            )}
                            {wholesaler.status !== 'Deactivated' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(wholesaler, 'Deactivated')}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تعطيل' : 'Deactivate'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'supply_orders' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
              {overview.supplyOrders.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {isAr ? 'لا توجد طلبات توريد B2B مسجلة.' : 'No B2B supply orders yet.'}
                </p>
              ) : (
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'رقم الطلب' : 'Order'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الصيدلية' : 'Pharmacy'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'المذخر' : 'Wholesaler'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'طريقة التسوية' : 'Payment'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الإجمالي' : 'Total IQD'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.supplyOrders.slice(0, 100).map((ord) => (
                      <tr key={ord.orderId}>
                        <td className="px-4 py-3 font-latin font-bold text-[#0c3585] dark:text-[#f4d378]">
                          {ord.orderNumber}
                        </td>
                        <td className="px-4 py-3">{ord.pharmacyName}</td>
                        <td className="px-4 py-3">{ord.wholesalerName}</td>
                        <td className="px-4 py-3 font-latin">{ord.paymentMethod}</td>
                        <td className="px-4 py-3 font-latin tabular-nums">
                          {(ord.totalIqd || 0).toLocaleString()} IQD
                        </td>
                        <td className="px-4 py-3 font-latin font-semibold">{ord.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
              {overview.invoices.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {isAr ? 'لا توجد فواتير تجارية مسجلة.' : 'No B2B invoices recorded yet.'}
                </p>
              ) : (
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الصيدلية' : 'Pharmacy'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الإجمالي' : 'Total IQD'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'المدفوع' : 'Paid IQD'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.invoices.slice(0, 100).map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td className="px-4 py-3 font-latin font-bold text-[#0c3585] dark:text-[#f4d378]">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3">{inv.pharmacyName}</td>
                        <td className="px-4 py-3 font-latin tabular-nums">
                          {(inv.totalIqd || 0).toLocaleString()} IQD
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums">
                          {(inv.paidAmountIqd || 0).toLocaleString()} IQD
                        </td>
                        <td className="px-4 py-3 font-latin font-semibold">{inv.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

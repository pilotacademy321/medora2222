import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FlaskConical,
  Home,
  PackageOpen,
  Receipt,
  Users,
} from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import type { Language } from '../../types/medora';
import type { LabSectionId, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { MedoraTargetedAdShowcase } from '../shared/MedoraTargetedAdShowcase';

interface LabOverviewSectionProps {
  workspace: LabWorkspaceData;
  lang: Language;
  onNavigate: (section: LabSectionId) => void;
}

export const LabOverviewSection: React.FC<LabOverviewSectionProps> = ({
  workspace,
  lang,
  onNavigate,
}) => {
  const { firebaseUser } = useMedora();
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const stats = useMemo(() => {
    const todayStr = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
    const in30DaysIso = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const todayOrders = workspace.orders.filter(
      (o) => String(o.createdAt || '').slice(0, 10) === todayStr,
    ).length;

    const pendingApprovals = workspace.results.filter(
      (r) => r.status === 'pending_approval' || r.status === 'draft',
    ).length;

    const pendingBookings = workspace.bookings.filter(
      (b) => b.status === 'pending' || b.status === 'confirmed',
    ).length;

    const homeCollectionsPending = workspace.homeCollections.filter(
      (h) => h.status === 'requested' || h.status === 'assigned' || h.status === 'en_route',
    ).length;

    const todayRevenue = workspace.payments
      .filter((p) => String(p.paidAt || p.createdAt || '').slice(0, 10) === todayStr)
      .reduce((sum, p) => sum + Number(p.amountIqd || 0), 0);

    const lowStockItems = workspace.inventory.filter(
      (it) => Number(it.quantity || 0) <= Number(it.minThreshold || 0),
    );
    const expiringItems = workspace.inventory.filter(
      (it) => it.expiryDate && it.expiryDate <= in30DaysIso,
    );

    return {
      todayOrders,
      pendingApprovals,
      pendingBookings,
      homeCollectionsPending,
      todayRevenue,
      activePatients: workspace.patients.length,
      lowStockItems,
      expiringItems,
    };
  }, [workspace]);

  const kpis = [
    {
      label: lt.overview.todayOrders,
      value: stats.todayOrders.toLocaleString(),
      icon: FlaskConical,
      accent: 'text-[#0c3585] dark:text-blue-400',
      target: 'orders_samples' as LabSectionId,
    },
    {
      label: lt.overview.pendingApprovals,
      value: stats.pendingApprovals.toLocaleString(),
      icon: ClipboardCheck,
      accent: stats.pendingApprovals > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
      target: 'results' as LabSectionId,
    },
    {
      label: lt.overview.todayRevenue,
      value: `${stats.todayRevenue.toLocaleString()} ${lt.common.iqd}`,
      icon: Receipt,
      accent: 'text-emerald-600 dark:text-emerald-400',
      target: 'billing' as LabSectionId,
    },
    {
      label: lt.overview.activePatients,
      value: stats.activePatients.toLocaleString(),
      icon: Users,
      accent: 'text-[#0c3585] dark:text-blue-400',
      target: 'patients' as LabSectionId,
    },
    {
      label: lt.overview.pendingBookings,
      value: stats.pendingBookings.toLocaleString(),
      icon: CalendarClock,
      accent: 'text-sky-600 dark:text-sky-400',
      target: 'orders_samples' as LabSectionId,
    },
    {
      label: lt.overview.homeCollectionsPending,
      value: stats.homeCollectionsPending.toLocaleString(),
      icon: Home,
      accent: 'text-indigo-600 dark:text-indigo-400',
      target: 'orders_samples' as LabSectionId,
    },
    {
      label: lt.overview.lowStockCount,
      value: stats.lowStockItems.length.toLocaleString(),
      icon: PackageOpen,
      accent: stats.lowStockItems.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400',
      target: 'inventory' as LabSectionId,
    },
    {
      label: lt.overview.expiringCount,
      value: stats.expiringItems.length.toLocaleString(),
      icon: AlertTriangle,
      accent: stats.expiringItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400',
      target: 'inventory' as LabSectionId,
    },
  ];

  const recentOrders = workspace.orders.slice(0, 6);
  const recentAudit = workspace.auditLogs.slice(0, 6);
  const unreadNotifs = workspace.notifications.filter((n) => !n.isRead).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.overview.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{lt.overview.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('orders_samples')}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FlaskConical className="h-4 w-4" />
            <span>{lt.ordersSamples.newOrder}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('results')}
            className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-4 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-[#0c3585] dark:hover:border-blue-500 inline-flex items-center gap-1.5 cursor-pointer transition"
          >
            <ClipboardCheck className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
            <span>{lt.nav.results}</span>
          </button>
        </div>
      </div>

      <MedoraTargetedAdShowcase
        portal="lab"
        language={lang}
        firebaseUser={firebaseUser}
        compact
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => onNavigate(kpi.target)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 text-start transition hover:border-[#0c3585]/40 dark:hover:border-blue-500/40 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${kpi.accent}`} />
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span className="font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
                  {kpi.value}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 opacity-0 transition group-hover:opacity-100" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Operational Alerts Band (if any) */}
      {(stats.lowStockItems.length > 0 || stats.expiringItems.length > 0 || unreadNotifs.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{lt.overview.alertsTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('communications')}
              className="text-xs font-semibold text-[#0c3585] dark:text-blue-400 hover:underline cursor-pointer"
            >
              {lt.nav.communications}
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 text-xs">
            {stats.lowStockItems.slice(0, 3).map((item) => (
              <div
                key={`low-${item.itemId}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#07122a] px-3 py-2 border border-amber-200/70 dark:border-slate-800"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {isAr ? 'نقص مخزون:' : 'Low stock:'} {item.name}
                </span>
                <span className="font-latin tabular-nums font-bold text-rose-600 dark:text-rose-400 shrink-0">
                  {item.quantity} / {item.minThreshold} {item.unit}
                </span>
              </div>
            ))}
            {stats.expiringItems.slice(0, 3).map((item) => (
              <div
                key={`exp-${item.itemId}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#07122a] px-3 py-2 border border-amber-200/70 dark:border-slate-800"
              >
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {isAr ? 'قرب انتهاء الصلاحية:' : 'Expiring soon:'} {item.name} ({item.lotNumber})
                </span>
                <span className="font-latin tabular-nums font-bold text-amber-700 dark:text-amber-300 shrink-0">
                  {item.expiryDate}
                </span>
              </div>
            ))}
            {unreadNotifs.map((n) => (
              <div
                key={n.notificationId}
                className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#07122a] px-3 py-2 border border-slate-200 dark:border-slate-800"
              >
                <span className="text-slate-800 dark:text-slate-200 truncate">{n.title}</span>
                <span className="font-latin tabular-nums text-[11px] text-slate-500 shrink-0">
                  {String(n.createdAt || '').slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-Column Operational Split: Recent Orders + Audit Trail */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Activity className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
              <span>{lt.overview.recentOrders}</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('orders_samples')}
              className="text-xs font-semibold text-[#0c3585] dark:text-blue-400 hover:underline cursor-pointer"
            >
              {lt.common.all}
            </button>
          </div>
          {recentOrders.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">{lt.common.noData}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentOrders.map((ord) => (
                <div key={ord.orderId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">{ord.patientName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-latin tabular-nums">
                      {ord.orderNumber} · {ord.tests.length} {isAr ? 'فحص' : 'tests'} · {String(ord.createdAt || '').slice(0, 10)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-latin tabular-nums font-bold text-slate-800 dark:text-slate-200">
                      {ord.netAmountIqd.toLocaleString()} {lt.common.iqd}
                    </span>
                    <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {lt.status[ord.status] || ord.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>{lt.overview.recentAudit}</span>
            </div>
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {recentAudit.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">{lt.common.noData}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentAudit.map((log) => (
                <div key={log.logId} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">{log.details}</span>
                    <span className="font-latin tabular-nums text-[11px] text-slate-500 shrink-0">
                      {String(log.createdAt || '').slice(11, 16)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {log.actorName} · {log.action}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

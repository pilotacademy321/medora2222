import React, { useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, Printer } from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { exportLabRowsToCsv } from '../../services/labService';
import { LabAnalyticsReportPrintSheet } from '../shared/MedoraPrintableDocument';
import { downloadMedoraPdf, printMedoraDocument } from '../../utils/printAndPdf';

interface LabReportsSectionProps {
  workspace: LabWorkspaceData;
  lang: Language;
}

export const LabReportsSection: React.FC<LabReportsSectionProps> = ({ workspace, lang }) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [fromDate, setFromDate] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const metrics = useMemo(() => {
    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      const d = String(iso).slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    const orders = workspace.orders.filter((o) => inRange(o.createdAt));
    const results = workspace.results.filter((r) => inRange(r.approvedAt || r.enteredAt || r.createdAt));
    const invoices = workspace.invoices.filter((i) => i.status !== 'void' && inRange(i.createdAt));
    const payments = workspace.payments.filter((p) => inRange(p.paidAt || p.createdAt));

    const approvedResults = results.filter(
      (r) => r.status === 'approved' || r.status === 'corrected',
    ).length;

    const totalBilledIqd = invoices.reduce((s, i) => s + Number(i.totalIqd || 0), 0);
    const totalCollectedIqd = payments.reduce((s, p) => s + Number(p.amountIqd || 0), 0);
    const outstandingIqd = invoices.reduce((s, i) => s + Number(i.balanceIqd || 0), 0);

    const statusCounts: Record<string, number> = {};
    for (const o of orders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    }

    const testAgg = new Map<string, { name: string; count: number; revenueIqd: number }>();
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      for (const t of o.tests) {
        const key = t.testId || t.code || t.nameAr;
        const cur = testAgg.get(key) || {
          name: isAr ? t.nameAr : t.nameEn || t.nameAr,
          count: 0,
          revenueIqd: 0,
        };
        cur.count += 1;
        cur.revenueIqd += Number(t.priceIqd || 0);
        testAgg.set(key, cur);
      }
    }
    const topTests = Array.from(testAgg.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const in30DaysIso = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const lowStockItems = workspace.inventory.filter(
      (i) => Number(i.quantity) <= Number(i.minThreshold),
    ).length;
    const expiringItems = workspace.inventory.filter(
      (i) => i.expiryDate && i.expiryDate <= in30DaysIso,
    ).length;

    return {
      orders,
      invoices,
      totalOrders: orders.length,
      approvedResults,
      totalBilledIqd,
      totalCollectedIqd,
      outstandingIqd,
      lowStockItems,
      expiringItems,
      statusCounts,
      topTests,
    };
  }, [workspace, fromDate, toDate, isAr]);

  const buildPrintElement = () => (
    <LabAnalyticsReportPrintSheet
      lang={lang}
      labName={workspace.labProfile.labNameAr || workspace.labProfile.labNameEn}
      fromDate={fromDate}
      toDate={toDate}
      metrics={metrics}
    />
  );

  const handlePrint = () => {
    void printMedoraDocument(buildPrintElement(), lt.reports.title);
  };

  const handlePdf = async () => {
    await downloadMedoraPdf({
      filename: `medora-lab-report-${fromDate}-to-${toDate}.pdf`,
      element: buildPrintElement(),
      dir: isAr ? 'rtl' : 'ltr',
    });
  };

  const handleExportOrdersCsv = () => {
    exportLabRowsToCsv(
      'medora_lab_orders',
      ['Order Number', 'Date', 'Patient Name', 'Phone', 'Priority', 'Status', 'Tests', 'Net Amount (IQD)'],
      metrics.orders.map((o) => [
        o.orderNumber,
        String(o.createdAt || '').slice(0, 16),
        o.patientName,
        o.patientPhone,
        o.priority,
        o.status,
        o.tests.map((t) => t.nameAr).join(' | '),
        o.netAmountIqd,
      ]),
    );
  };

  const handleExportInvoicesCsv = () => {
    exportLabRowsToCsv(
      'medora_lab_financials',
      ['Invoice Number', 'Order Number', 'Date', 'Patient', 'Total IQD', 'Paid IQD', 'Balance IQD', 'Status'],
      metrics.invoices.map((i) => [
        i.invoiceNumber,
        i.orderNumber || '',
        String(i.createdAt || '').slice(0, 16),
        i.patientName,
        i.totalIqd,
        i.paidIqd,
        i.balanceIqd,
        i.status,
      ]),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.reports.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportOrdersCsv}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{isAr ? 'تصدير الطلبات (Excel)' : 'Export Orders CSV'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportInvoicesCsv}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>{isAr ? 'تصدير الفواتير (Excel)' : 'Export Financials CSV'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3.5 text-xs font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{lt.common.print}</span>
          </button>
          <button
            type="button"
            onClick={() => void handlePdf()}
            className="medora-gold-button min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{lt.common.downloadPdf}</span>
          </button>
        </div>
      </div>

      {/* Date Range Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
            {lt.reports.fromDate}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
            {lt.reports.toDate}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* KPI Breakdown Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إجمالي الطلبات' : 'Total Orders'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
            {metrics.totalOrders}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            {isAr ? `نتائج معتمدة: ${metrics.approvedResults}` : `Approved: ${metrics.approvedResults}`}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إجمالي الفوترة' : 'Total Billed'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
            {metrics.totalBilledIqd.toLocaleString()} {lt.common.iqd}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'التحصيل الفعلي' : 'Collected Revenue'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.totalCollectedIqd.toLocaleString()} {lt.common.iqd}
          </div>
          <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 font-latin tabular-nums">
            {isAr ? 'المتبقي:' : 'Outstanding:'} {metrics.outstandingIqd.toLocaleString()} {lt.common.iqd}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{lt.reports.inventoryHealth}</div>
          <div className="mt-1 font-latin tabular-nums text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? `نواقص: ${metrics.lowStockItems} · قرب انتهاء: ${metrics.expiringItems}` : `Low: ${metrics.lowStockItems} · Expiring: ${metrics.expiringItems}`}
          </div>
        </div>
      </div>

      {/* Top Requested Tests & Status Breakdown */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-3">
            <BarChart3 className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
            <span>{lt.reports.topTests}</span>
          </div>
          {metrics.topTests.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">{lt.common.noData}</p>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2 text-start">{lt.results.testName}</th>
                  <th className="py-2 text-center">{isAr ? 'العدد' : 'Count'}</th>
                  <th className="py-2 text-end">{isAr ? 'الإيراد' : 'Revenue'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {metrics.topTests.map((t, idx) => (
                  <tr key={idx}>
                    <td className="py-2 font-semibold text-slate-900 dark:text-white">{t.name}</td>
                    <td className="py-2 text-center font-latin tabular-nums font-bold">{t.count}</td>
                    <td className="py-2 text-end font-latin tabular-nums">
                      {t.revenueIqd.toLocaleString()} {lt.common.iqd}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
            {lt.reports.ordersSummary}
          </h3>
          {Object.keys(metrics.statusCounts).length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">{lt.common.noData}</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {Object.entries(metrics.statusCounts).map(([st, count]) => (
                <div
                  key={st}
                  className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {lt.status[st as keyof typeof lt.status] || st}
                  </span>
                  <span className="font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Pencil, ShieldCheck, UserPlus, UserX, X } from 'lucide-react';
import type { Language } from '../../types/medora';
import {
  ALL_LAB_PERMISSIONS,
  type LabPermissionKey,
  type LabStaffMember,
  type LabWorkspaceData,
} from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { createLabStaff, revokeLabStaff, updateLabStaff } from '../../services/labService';

interface LabStaffSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  onRefresh: () => Promise<void>;
}

export const LabStaffSection: React.FC<LabStaffSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LabStaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [permissions, setPermissions] = useState<LabPermissionKey[]>(['reception', 'samples']);

  if (workspace.actorRole !== 'lab_manager') {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/20 p-6 text-sm text-amber-900 dark:text-amber-300">
        {lt.staff.managerOnlyNotice}
      </div>
    );
  }

  const openInvite = () => {
    setEditing(null);
    setErrorMsg('');
    setEmail('');
    setFullName('');
    setPhone('');
    setRoleTitle(isAr ? 'فني تحاليل طبية' : 'Lab Technologist');
    setPermissions(['reception', 'samples', 'enterResults']);
    setModalOpen(true);
  };

  const openEdit = (m: LabStaffMember) => {
    setEditing(m);
    setErrorMsg('');
    setEmail(m.email);
    setFullName(m.fullName);
    setPhone(m.phone);
    setRoleTitle(m.roleTitle);
    setPermissions(m.permissions || []);
    setModalOpen(true);
  };

  const togglePerm = (p: LabPermissionKey) => {
    setPermissions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg('');
    setSaving(true);
    try {
      if (editing) {
        await updateLabStaff(firebaseUser, editing.staffId, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          roleTitle: roleTitle.trim(),
          permissions,
        });
      } else {
        await createLabStaff(firebaseUser, {
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          phone: phone.trim(),
          roleTitle: roleTitle.trim(),
          permissions,
        });
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'STAFF_SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (m: LabStaffMember) => {
    try {
      await updateLabStaff(firebaseUser, m.staffId, {
        status: m.status === 'active' ? 'suspended' : 'active',
      });
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'STAFF_STATUS_FAILED');
    }
  };

  const handleRevoke = async (staffId: string) => {
    try {
      await revokeLabStaff(firebaseUser, staffId);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'REVOKE_FAILED');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.staff.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{lt.staff.managerOnlyNotice}</p>
        </div>
        <button
          type="button"
          onClick={openInvite}
          className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>{lt.staff.inviteStaff}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {workspace.staff.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-sm text-slate-500">
          {lt.common.noData}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workspace.staff.map((m) => (
            <div
              key={m.staffId}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{m.fullName}</h4>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {m.roleTitle} · <span className="font-latin">{m.email}</span>
                  </p>
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    m.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : m.status === 'suspended'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  }`}
                >
                  {lt.status[m.status] || m.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {m.permissions.map((p) => (
                  <span
                    key={p}
                    className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-300"
                  >
                    {lt.permissions[p] || p}
                  </span>
                ))}
              </div>

              {m.status !== 'revoked' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>{lt.common.edit}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStatusToggle(m)}
                    className="min-h-[36px] rounded-lg border border-amber-200 dark:border-amber-800 px-3 font-semibold text-amber-700 dark:text-amber-300 cursor-pointer"
                  >
                    {m.status === 'active' ? lt.staff.suspend : lt.staff.reactivate}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(m.staffId)}
                    className="min-h-[36px] rounded-lg border border-rose-200 dark:border-rose-800 px-3 font-semibold text-rose-600 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <UserX className="h-3 w-3" />
                    <span>{lt.staff.revoke}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl max-h-[90vh] overflow-y-auto space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editing ? lt.common.edit : lt.staff.inviteStaff}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!editing && (
              <div>
                <label className="block font-semibold mb-1">{lt.staff.email} *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  placeholder="staff@gmail.com"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold mb-1">{lt.patients.fullName} *</label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.staff.roleTitle} *</label>
                <input
                  required
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">{lt.patients.phone}</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1.5">{lt.staff.permissions}</label>
              <div className="grid gap-1.5 sm:grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                {ALL_LAB_PERMISSIONS.map((perm) => (
                  <label key={perm} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.includes(perm)}
                      onChange={() => togglePerm(perm)}
                      className="h-4 w-4 accent-[#0c3585]"
                    />
                    <span>{lt.permissions[perm]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer"
              >
                {saving ? lt.common.saving : lt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

import { useState, type ChangeEvent } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { uploadMedoraFile } from '../../services/medoraFirestore';
import type { UploadedDocMeta } from '../../types/medora';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';

interface DocumentUploadFieldProps {
  label: string;
  folder: 'doctor_docs' | 'lab_docs' | 'pharmacy_docs' | 'wholesaler_docs';
  documents: UploadedDocMeta[];
  onChange: (docs: UploadedDocMeta[]) => void;
}

export function DocumentUploadField({
  label,
  folder,
  documents,
  onChange,
}: DocumentUploadFieldProps) {
  const { language, t, firebaseUser } = useMedora();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !firebaseUser) return;
    setUploadError(null);
    setUploading(true);

    try {
      const uploadedList: UploadedDocMeta[] = [];
      for (const file of files.slice(0, Math.max(1, 10 - documents.length))) {
        const meta = await uploadMedoraFile(firebaseUser, folder, file);
        uploadedList.push(meta);
      }
      onChange([...documents, ...uploadedList].slice(0, 10));
    } catch (err) {
      setUploadError(mapUploadErrorMessage(err, language));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            {label}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t.forms.fileValidationHint}
          </span>
        </div>

        <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{uploading ? t.common.uploading : t.common.uploadFile}</span>
          <input
            type="file"
            multiple
            accept="image/*,.heic,.heif,application/pdf"
            disabled={uploading || documents.length >= 10}
            onChange={(e) => void handleFileChange(e)}
            className="sr-only"
          />
        </label>
      </div>

      {uploadError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {uploadError}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((docItem, idx) => (
            <li
              key={`${docItem.name}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-[#040a1a]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText className="h-4 w-4 shrink-0 text-[#d9a43b]" aria-hidden="true" />
                <ProtectedMediaButton
                  firebaseUser={firebaseUser}
                  url={docItem.url}
                  fileName={docItem.name}
                  label={docItem.name}
                  className="truncate font-medium text-slate-800 hover:underline dark:text-slate-200 cursor-pointer"
                />
                <span className="font-latin text-[11px] text-slate-500 tabular-nums" dir="ltr">
                  ({Math.round(docItem.size / 1024)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(documents.filter((_, i) => i !== idx))
                }
                aria-label={t.common.remove}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

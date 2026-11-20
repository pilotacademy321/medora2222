import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import {
  fetchProtectedMediaObjectUrl,
  isPrivateMediaUrl,
  openProtectedMediaFile,
} from '../../utils/imagePreparation';

interface ProtectedMediaButtonProps {
  firebaseUser: User | null;
  url: string;
  fileName?: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ProtectedMediaButton: React.FC<ProtectedMediaButtonProps> = ({
  firebaseUser,
  url,
  fileName,
  label,
  className,
  children,
}) => {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    if (!url || opening) return;
    setOpening(true);
    try {
      await openProtectedMediaFile(firebaseUser, url, fileName);
    } catch (err) {
      console.error('[MEDORA][ProtectedMediaOpen] error:', err);
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleOpen();
      }}
      disabled={opening || !url}
      className={
        className ||
        'inline-flex items-center gap-1.5 rounded-lg border border-slate-300/30 px-2.5 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-500/10'
      }
    >
      {children || (
        <>
          {opening ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate max-w-[180px]">{label || fileName || 'عرض الملف'}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
        </>
      )}
    </button>
  );
};

interface ProtectedMediaImageProps {
  firebaseUser: User | null;
  url: string;
  alt: string;
  className?: string;
}

export const ProtectedMediaImage: React.FC<ProtectedMediaImageProps> = ({
  firebaseUser,
  url,
  alt,
  className,
}) => {
  const [src, setSrc] = useState<string>(() => (isPrivateMediaUrl(url) ? '' : url));

  useEffect(() => {
    let active = true;
    let revokeUrl: string | null = null;

    if (!url) {
      setSrc('');
      return;
    }

    if (!isPrivateMediaUrl(url)) {
      setSrc(url);
      return;
    }

    fetchProtectedMediaObjectUrl(firebaseUser, url)
      .then((res) => {
        if (!active) {
          if (res.revoke) URL.revokeObjectURL(res.objectUrl);
          return;
        }
        if (res.revoke) revokeUrl = res.objectUrl;
        setSrc(res.objectUrl);
      })
      .catch(() => {
        if (active) setSrc('');
      });

    return () => {
      active = false;
      if (revokeUrl) {
        try {
          URL.revokeObjectURL(revokeUrl);
        } catch {
          // Ignore revoke failure
        }
      }
    };
  }, [firebaseUser, url]);

  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
};

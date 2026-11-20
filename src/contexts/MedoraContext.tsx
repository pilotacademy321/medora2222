import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  auth,
  ensureAuthPersistence,
  googleProvider,
  isEmbeddedIframe,
} from '../lib/firebase';
import {
  fetchServerSessionState,
  fetchUserRequests,
  syncUserOnGoogleSignIn,
  verifySuperAdminWithServer,
} from '../services/medoraFirestore';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  isImagingPortalIdentifier,
} from '../config/featureFlags';
import { TRANSLATIONS, type MedoraCopy } from '../i18n/translations';
import type {
  Language,
  PortalIntent,
  RegistrationRequest,
  SuperAdminVerifyResult,
  ThemeMode,
  UserAccount,
} from '../types/medora';

interface MedoraContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  t: MedoraCopy;
  firebaseUser: User | null;
  userAccount: UserAccount | null;
  setUserAccount: (account: UserAccount | null) => void;
  requests: RegistrationRequest[];
  refreshRequests: (uid?: string) => Promise<void>;
  authLoading: boolean;
  authActionPending: boolean;
  authError: string | null;
  authErrorCode: string | null;
  clearAuthError: () => void;
  isSuperAdmin: boolean;
  adminCheckDone: boolean;
  adminVerificationMeta: SuperAdminVerifyResult | null;
  imagingPortalEnabled: boolean;
  imagingAccessBlocked: boolean;
  hasOtherAllowedPortal: boolean;
  imagingBlockedRouteNotice: boolean;
  clearImagingBlockedRouteNotice: () => void;
  portalIntent: PortalIntent | null;
  setPortalIntent: (intent: PortalIntent | null) => void;
  pendingRedirectRoute: boolean;
  consumePendingRedirectRoute: () => void;
  reverifySuperAdmin: () => Promise<boolean>;
  signInWithGoogle: () => Promise<{
    user: UserAccount;
    requests: RegistrationRequest[];
    isSuperAdmin: boolean;
    imagingAccessBlocked: boolean;
    hasOtherAllowedPortal: boolean;
  } | null>;
  signInWithGoogleRedirect: () => Promise<void>;
  switchGoogleAccount: () => Promise<{
    user: UserAccount;
    requests: RegistrationRequest[];
    isSuperAdmin: boolean;
    imagingAccessBlocked: boolean;
    hasOtherAllowedPortal: boolean;
  } | null>;
  logout: () => Promise<void>;
}

interface HydratedSession {
  user: UserAccount;
  requests: RegistrationRequest[];
  isSuperAdmin: boolean;
  adminVerificationMeta: SuperAdminVerifyResult;
  imagingPortalEnabled: boolean;
  imagingAccessBlocked: boolean;
  hasOtherAllowedPortal: boolean;
}

const MedoraContext = createContext<MedoraContextValue | null>(null);

const REDIRECT_PENDING_KEY = 'medora_google_redirect_pending';
const ACTIVE_STEP_KEY = 'medora_active_step';

function setRedirectPendingFlag(active: boolean): void {
  try {
    if (active) {
      window.sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      window.localStorage.setItem(REDIRECT_PENDING_KEY, '1');
    } else {
      window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      window.localStorage.removeItem(REDIRECT_PENDING_KEY);
    }
  } catch {
    // Ignore restricted storage errors gracefully
  }
}

function hasRedirectPendingFlag(): boolean {
  try {
    return (
      window.sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1' ||
      window.localStorage.getItem(REDIRECT_PENDING_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function extractAuthErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
      const rawCode = (error as { code: string }).code;
      if (rawCode === 'unavailable') {
        return 'auth/network-request-failed';
      }
      if (rawCode !== 'unknown') {
        return rawCode;
      }
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      const msg = (error as { message: string }).message;
      try {
        const parsed = JSON.parse(msg) as { errorCode?: unknown; error?: unknown };
        if (typeof parsed.errorCode === 'string' && parsed.errorCode) {
          if (parsed.errorCode === 'unavailable' || parsed.errorCode === 'unknown') {
            return 'auth/network-request-failed';
          }
          return parsed.errorCode;
        }
        if (typeof parsed.error === 'string') {
          const lower = parsed.error.toLowerCase();
          if (lower.includes('permission-denied') || parsed.error.includes('PERMISSION_DENIED')) {
            return 'permission-denied';
          }
          if (
            lower.includes('offline') ||
            lower.includes('network') ||
            lower.includes('unavailable') ||
            lower.includes('fetching auth token failed') ||
            lower.includes('3c6b')
          ) {
            return 'auth/network-request-failed';
          }
        }
      } catch {
        const match = msg.match(/auth\/[a-z0-9-]+/i);
        if (match) return match[0];
        const lowerMsg = msg.toLowerCase();
        if (
          lowerMsg.includes('client is offline') ||
          lowerMsg.includes('fetching auth token failed') ||
          lowerMsg.includes('network-request-failed') ||
          lowerMsg.includes('internal assertion failed') ||
          lowerMsg.includes('3c6b')
        ) {
          return 'auth/network-request-failed';
        }
      }
    }
  }
  return '';
}

function mapFirebaseAuthError(error: unknown, copy: MedoraCopy): string {
  const code = extractAuthErrorCode(error);

  if (code === 'auth/popup-closed-by-user') return copy.auth.errors.popupClosed;
  if (code === 'auth/popup-blocked') return copy.auth.errors.popupBlocked;
  if (code === 'auth/network-request-failed' || code === 'unavailable') {
    return copy.auth.errors.network;
  }
  if (
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/redirect-cancelled-by-user' ||
    code === 'auth/redirect-operation-pending' ||
    code === 'auth/user-cancelled'
  ) {
    return copy.auth.errors.cancelled;
  }
  if (code === 'auth/unauthorized-domain') {
    const host =
      typeof window !== 'undefined' ? window.location.hostname : '';
    return host
      ? `${copy.auth.errors.unauthorizedDomain} ${host} — ${copy.auth.errors.unauthorizedDomainHint}`
      : copy.auth.errors.unauthorizedDomain;
  }
  if (code === 'auth/operation-not-allowed') {
    return copy.auth.errors.operationNotAllowed;
  }
  if (
    code === 'auth/web-storage-unsupported' ||
    code === 'auth/operation-not-supported-in-this-environment'
  ) {
    return isEmbeddedIframe()
      ? copy.auth.errors.iframeRedirectBlocked
      : copy.auth.errors.webStorageUnsupported;
  }
  if (code === 'auth/user-disabled') return copy.auth.errors.userDisabled;
  if (code === 'auth/too-many-requests') return copy.auth.errors.tooManyRequests;
  if (code === 'auth/account-exists-with-different-credential') {
    return copy.auth.errors.accountExistsWithDifferentCredential;
  }
  if (code === 'auth/invalid-credential' || code === 'auth/user-token-expired') {
    return copy.auth.errors.invalidCredential;
  }
  if (code === 'auth/email-not-verified') {
    return copy.auth.errors.emailNotVerified;
  }
  if (code === 'permission-denied') {
    return copy.auth.errors.permissionDenied;
  }
  if (code === 'auth/internal-error') {
    return copy.auth.errors.internalError;
  }
  return copy.auth.errors.generic;
}

// Memoized once per page load so React StrictMode double-effects never call getRedirectResult twice
let pageRedirectResultPromise: ReturnType<typeof getRedirectResult> | null = null;
function readPageRedirectResultOnce() {
  if (!pageRedirectResultPromise) {
    pageRedirectResultPromise = ensureAuthPersistence().then(() =>
      getRedirectResult(auth),
    );
  }
  return pageRedirectResultPromise;
}

export function MedoraProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = window.localStorage.getItem('medora_lang');
    return saved === 'en' ? 'en' : 'ar';
  });

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = window.localStorage.getItem('medora_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authActionPending, setAuthActionPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);
  const [adminVerificationMeta, setAdminVerificationMeta] =
    useState<SuperAdminVerifyResult | null>(null);
  const [imagingPortalEnabled, setImagingPortalEnabled] = useState<boolean>(
    CLIENT_IMAGING_PORTAL_ENABLED,
  );
  const [imagingAccessBlocked, setImagingAccessBlocked] = useState<boolean>(false);
  const [hasOtherAllowedPortal, setHasOtherAllowedPortal] = useState<boolean>(false);
  const [imagingBlockedRouteNotice, setImagingBlockedRouteNotice] = useState<boolean>(() => {
    try {
      const raw =
        window.sessionStorage.getItem('medora_portal_intent') ||
        window.localStorage.getItem('medora_portal_intent');
      if (!CLIENT_IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(raw)) {
        window.sessionStorage.removeItem('medora_portal_intent');
        window.localStorage.removeItem('medora_portal_intent');
        return true;
      }
    } catch {
      // Ignore storage errors
    }
    return false;
  });
  const [pendingRedirectRoute, setPendingRedirectRoute] = useState<boolean>(() =>
    hasRedirectPendingFlag(),
  );
  const [portalIntent, setPortalIntentState] = useState<PortalIntent | null>(() => {
    try {
      const raw =
        window.sessionStorage.getItem('medora_portal_intent') ||
        window.localStorage.getItem('medora_portal_intent');
      if (
        raw === 'patient' ||
        raw === 'doctor' ||
        raw === 'lab' ||
        raw === 'secretary' ||
        raw === 'pharmacy' ||
        raw === 'wholesaler' ||
        raw === 'super_admin'
      ) {
        return raw;
      }
    } catch {
      // Ignore storage access errors
    }
    return null;
  });

  const clearImagingBlockedRouteNotice = useCallback(() => {
    setImagingBlockedRouteNotice(false);
  }, []);

  const setPortalIntent = useCallback(
    (intent: PortalIntent | null) => {
      if (
        !imagingPortalEnabled &&
        intent &&
        isImagingPortalIdentifier(intent as string)
      ) {
        setPortalIntentState(null);
        setImagingBlockedRouteNotice(true);
        try {
          window.sessionStorage.removeItem('medora_portal_intent');
          window.localStorage.removeItem('medora_portal_intent');
        } catch {
          // Ignore storage access errors
        }
        return;
      }
      setPortalIntentState(intent);
      try {
        if (intent) {
          window.sessionStorage.setItem('medora_portal_intent', intent);
          window.localStorage.setItem('medora_portal_intent', intent);
        } else {
          window.sessionStorage.removeItem('medora_portal_intent');
          window.localStorage.removeItem('medora_portal_intent');
        }
      } catch {
        // Ignore storage access errors
      }
    },
    [imagingPortalEnabled],
  );

  const consumePendingRedirectRoute = useCallback(() => {
    setRedirectPendingFlag(false);
    setPendingRedirectRoute(false);
  }, []);

  const activeUidRef = useRef<string | null>(null);
  const languageRef = useRef<Language>(language);
  languageRef.current = language;
  const authActionLockRef = useRef(false);
  const authEpochRef = useRef(0);
  const inFlightHydrationRef = useRef<Map<string, Promise<HydratedSession>>>(
    new Map(),
  );

  const t = TRANSLATIONS[language];

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    window.localStorage.setItem('medora_lang', lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  }, [language, setLanguage]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    window.localStorage.setItem('medora_theme', nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Sync HTML dir/lang and .dark class cleanly
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const refreshRequests = useCallback(
    async (explicitUid?: string) => {
      const uid = explicitUid || firebaseUser?.uid;
      if (!uid) {
        setRequests([]);
        return;
      }
      const list = await fetchUserRequests(uid);
      setRequests(list);
    },
    [firebaseUser?.uid],
  );

  const hydrateUserSession = useCallback(
    async (user: User): Promise<HydratedSession> => {
      const existing = inFlightHydrationRef.current.get(user.uid);
      if (existing) {
        return existing;
      }

      const promise = (async (): Promise<HydratedSession> => {
        const [accountRes, reqRes, adminRes, serverMetaRes] = await Promise.allSettled([
          syncUserOnGoogleSignIn(user),
          fetchUserRequests(user.uid),
          verifySuperAdminWithServer(user),
          fetchServerSessionState(user),
        ]);

        const adminResult: SuperAdminVerifyResult =
          adminRes.status === 'fulfilled'
            ? adminRes.value
            : { authorized: false, reason: 'NETWORK_ERROR' };

        const serverMeta =
          serverMetaRes.status === 'fulfilled' ? serverMetaRes.value : null;

        if (accountRes.status === 'rejected') {
          if (!adminResult.authorized && !serverMeta?.user) {
            throw accountRes.reason;
          }
          console.warn(
            'Non-blocking user doc sync warning during session hydration:',
            accountRes.reason,
          );
        }

        const resolvedUser: UserAccount =
          accountRes.status === 'fulfilled'
            ? accountRes.value
            : serverMeta?.user || {
                uid: user.uid,
                email: user.email || '',
                googleName: user.displayName || user.email || 'MEDORA User',
                photoUrl: user.photoURL || '',
                avatarUrl: user.photoURL || '',
                accountStatus: 'active',
                selectedPortal: 'none',
                registrationCompleted: true,
                personalProfileCompleted: true,
                createdAt: null,
                lastLoginAt: null,
                updatedAt: null,
              };

        const resolvedRequests =
          reqRes.status === 'fulfilled' && reqRes.value.length > 0
            ? reqRes.value
            : serverMeta?.requests || (reqRes.status === 'fulfilled' ? reqRes.value : []);

        const resolvedFlagEnabled = serverMeta
          ? serverMeta.imagingPortalEnabled
          : CLIENT_IMAGING_PORTAL_ENABLED;

        const isImagingFromAccount =
          isImagingPortalIdentifier(resolvedUser.selectedPortal) ||
          resolvedRequests.some((r) => isImagingPortalIdentifier(r.portalType));

        const resolvedImagingBlocked =
          !resolvedFlagEnabled &&
          Boolean(serverMeta?.imagingAccessBlocked || isImagingFromAccount);

        const allowedNonImaging = new Set([
          'patient',
          'doctor',
          'lab',
          'secretary',
          'pharmacy',
          'wholesaler',
        ]);
        const resolvedHasOtherAllowedPortal =
          Boolean(serverMeta?.hasOtherAllowedPortal) ||
          adminResult.authorized ||
          resolvedRequests.some(
            (r) =>
              allowedNonImaging.has(String(r.portalType)) &&
              r.status === 'Approved',
          ) ||
          (allowedNonImaging.has(String(resolvedUser.selectedPortal)) &&
            resolvedUser.accountStatus === 'active');

        return {
          user: resolvedUser,
          requests: resolvedRequests,
          isSuperAdmin: adminResult.authorized,
          adminVerificationMeta: adminResult,
          imagingPortalEnabled: resolvedFlagEnabled,
          imagingAccessBlocked: resolvedImagingBlocked,
          hasOtherAllowedPortal: resolvedHasOtherAllowedPortal,
        };
      })().finally(() => {
        inFlightHydrationRef.current.delete(user.uid);
      });

      inFlightHydrationRef.current.set(user.uid, promise);
      return promise;
    },
    [],
  );

  const reverifySuperAdmin = useCallback(async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) {
      setIsSuperAdmin(false);
      setAdminCheckDone(true);
      return false;
    }
    const adminResult = await verifySuperAdminWithServer(current);
    setIsSuperAdmin(adminResult.authorized);
    setAdminVerificationMeta(adminResult);
    setAdminCheckDone(true);
    return adminResult.authorized;
  }, []);

  // Process Google Redirect result (when returning from mobile/redirect OAuth) + listen to auth state
  useEffect(() => {
    let cancelled = false;
    let redirectDone = false;
    let authStateInitialized = false;
    let redirectSawUser = false;

    void ensureAuthPersistence();

    readPageRedirectResultOnce()
      .then(async (redirectCredential) => {
        if (cancelled) return;
        if (redirectCredential?.user) {
          redirectSawUser = true;
          const signedInUser = redirectCredential.user;
          if (signedInUser.emailVerified === false) {
            setRedirectPendingFlag(false);
            setPendingRedirectRoute(false);
            await signOut(auth).catch(() => undefined);
            setAuthErrorCode('auth/email-not-verified');
            setAuthError(TRANSLATIONS[languageRef.current].auth.errors.emailNotVerified);
            setAdminCheckDone(true);
            return;
          }
          setPendingRedirectRoute(true);
          activeUidRef.current = signedInUser.uid;
          setFirebaseUser(signedInUser);
          try {
            const session = await hydrateUserSession(signedInUser);
            if (cancelled || activeUidRef.current !== signedInUser.uid) return;
            setUserAccount(session.user);
            setRequests(session.requests);
            setIsSuperAdmin(session.isSuperAdmin);
            setAdminVerificationMeta(session.adminVerificationMeta);
            setImagingPortalEnabled(session.imagingPortalEnabled);
            setImagingAccessBlocked(session.imagingAccessBlocked);
            setHasOtherAllowedPortal(session.hasOtherAllowedPortal);
            setAuthError(null);
            setAuthErrorCode(null);
            setAdminCheckDone(true);
          } catch (hydrateErr) {
            if (!cancelled) {
              setAuthErrorCode(extractAuthErrorCode(hydrateErr) || null);
              setAuthError(
                mapFirebaseAuthError(
                  hydrateErr,
                  TRANSLATIONS[languageRef.current],
                ),
              );
              setAdminCheckDone(true);
            }
          }
        }
      })
      .catch((redirectErr) => {
        if (cancelled) return;
        console.error('Google redirect sign-in error:', redirectErr);
        const code = extractAuthErrorCode(redirectErr);
        setAuthErrorCode(code || null);
        setAuthError(
          mapFirebaseAuthError(redirectErr, TRANSLATIONS[languageRef.current]),
        );
        if (hasRedirectPendingFlag()) {
          setPendingRedirectRoute(true);
        }
      })
      .finally(() => {
        redirectDone = true;
        if (cancelled) return;
        if (
          !redirectSawUser &&
          hasRedirectPendingFlag() &&
          authStateInitialized &&
          !auth.currentUser
        ) {
          setRedirectPendingFlag(false);
          setPendingRedirectRoute(false);
          setAuthErrorCode((prev) => prev || 'auth/redirect-missing-result');
          setAuthError(
            (prev) =>
              prev ||
              TRANSLATIONS[languageRef.current].auth.errors.redirectMissingResult,
          );
        }
        if (authStateInitialized) {
          setAuthLoading(false);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const eventEpoch = authEpochRef.current;
      authStateInitialized = true;

      // While an explicit popup/redirect action is in progress, let that action manage state transitions
      if (authActionLockRef.current) {
        return;
      }

      if (!nextUser) {
        activeUidRef.current = null;
        setFirebaseUser(null);
        setUserAccount(null);
        setRequests([]);
        setIsSuperAdmin(false);
        setAdminVerificationMeta(null);
        setImagingAccessBlocked(false);
        setHasOtherAllowedPortal(false);
        if (redirectDone) {
          if (hasRedirectPendingFlag() && !redirectSawUser) {
            setRedirectPendingFlag(false);
            setPendingRedirectRoute(false);
            setAuthErrorCode((prev) => prev || 'auth/redirect-missing-result');
            setAuthError(
              (prev) =>
                prev ||
                TRANSLATIONS[languageRef.current].auth.errors.redirectMissingResult,
            );
          }
          setAuthLoading(false);
        }
        setAdminCheckDone(true);
        return;
      }

      if (nextUser.emailVerified === false) {
        activeUidRef.current = null;
        await signOut(auth).catch(() => undefined);
        setFirebaseUser(null);
        setUserAccount(null);
        setRequests([]);
        setIsSuperAdmin(false);
        setAdminVerificationMeta(null);
        setAuthErrorCode('auth/email-not-verified');
        setAuthError(TRANSLATIONS[languageRef.current].auth.errors.emailNotVerified);
        setAuthLoading(false);
        setAdminCheckDone(true);
        return;
      }

      const isDifferentUser = activeUidRef.current !== nextUser.uid;
      activeUidRef.current = nextUser.uid;

      if (isDifferentUser) {
        // Strictly clear previous account state first to prevent cross-account mixing
        setUserAccount(null);
        setRequests([]);
        setIsSuperAdmin(false);
        setAdminVerificationMeta(null);
        setAdminCheckDone(false);
      }

      setFirebaseUser(nextUser);
      try {
        const session = await hydrateUserSession(nextUser);
        if (
          cancelled ||
          authActionLockRef.current ||
          authEpochRef.current !== eventEpoch ||
          activeUidRef.current !== nextUser.uid
        ) {
          return;
        }
        setUserAccount(session.user);
        setRequests(session.requests);
        setIsSuperAdmin(session.isSuperAdmin);
        setAdminVerificationMeta(session.adminVerificationMeta);
        setImagingPortalEnabled(session.imagingPortalEnabled);
        setImagingAccessBlocked(session.imagingAccessBlocked);
        setHasOtherAllowedPortal(session.hasOtherAllowedPortal);
        setAuthError(null);
        setAuthErrorCode(null);
      } catch (err) {
        if (
          !cancelled &&
          !authActionLockRef.current &&
          authEpochRef.current === eventEpoch
        ) {
          console.error('Auth hydration error:', err);
          setAuthErrorCode(extractAuthErrorCode(err) || null);
          setAuthError(
            mapFirebaseAuthError(err, TRANSLATIONS[languageRef.current]),
          );
        }
      } finally {
        if (
          !cancelled &&
          !authActionLockRef.current &&
          authEpochRef.current === eventEpoch &&
          activeUidRef.current === nextUser.uid
        ) {
          if (redirectDone || !hasRedirectPendingFlag()) {
            setAuthLoading(false);
          }
          setAdminCheckDone(true);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hydrateUserSession]);

  const performGoogleRedirectSignIn = useCallback(async () => {
    if (authActionLockRef.current) return;
    if (isEmbeddedIframe()) {
      setAuthErrorCode('auth/operation-not-supported-in-this-environment');
      setAuthError(
        TRANSLATIONS[languageRef.current].auth.errors.iframeRedirectBlocked,
      );
      return;
    }
    authActionLockRef.current = true;
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthActionPending(true);
    try {
      await ensureAuthPersistence();
      setRedirectPendingFlag(true);
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      setRedirectPendingFlag(false);
      console.error('Google redirect initiation error:', err);
      setAuthErrorCode(extractAuthErrorCode(err) || null);
      setAuthError(mapFirebaseAuthError(err, TRANSLATIONS[languageRef.current]));
      setAuthActionPending(false);
      authActionLockRef.current = false;
    }
  }, []);

  const performGoogleSignIn = useCallback(async () => {
    if (authActionLockRef.current) return null;
    authActionLockRef.current = true;
    const callEpoch = ++authEpochRef.current;
    let redirecting = false;

    setAuthError(null);
    setAuthErrorCode(null);
    setAuthActionPending(true);

    try {
      // Call signInWithPopup synchronously from the user gesture so mobile Safari/Chrome & desktop don't block the popup
      const credential = await signInWithPopup(auth, googleProvider);
      const signedInUser = credential.user;

      if (authEpochRef.current !== callEpoch) {
        return null;
      }

      if (signedInUser.emailVerified === false) {
        await signOut(auth).catch(() => undefined);
        activeUidRef.current = null;
        setFirebaseUser(null);
        setUserAccount(null);
        setRequests([]);
        setIsSuperAdmin(false);
        setAdminVerificationMeta(null);
        setAuthErrorCode('auth/email-not-verified');
        setAuthError(
          TRANSLATIONS[languageRef.current].auth.errors.emailNotVerified,
        );
        return null;
      }

      if (activeUidRef.current !== signedInUser.uid) {
        activeUidRef.current = signedInUser.uid;
        setUserAccount(null);
        setRequests([]);
        setIsSuperAdmin(false);
        setAdminVerificationMeta(null);
        setAdminCheckDone(false);
      }

      const session = await hydrateUserSession(signedInUser);
      if (authEpochRef.current !== callEpoch) {
        return null;
      }

      setRedirectPendingFlag(false);
      setPendingRedirectRoute(false);
      setFirebaseUser(signedInUser);
      setUserAccount(session.user);
      setRequests(session.requests);
      setIsSuperAdmin(session.isSuperAdmin);
      setAdminVerificationMeta(session.adminVerificationMeta);
      setImagingPortalEnabled(session.imagingPortalEnabled);
      setImagingAccessBlocked(session.imagingAccessBlocked);
      setHasOtherAllowedPortal(session.hasOtherAllowedPortal);
      setAdminCheckDone(true);
      setAuthLoading(false);

      return {
        user: session.user,
        requests: session.requests,
        isSuperAdmin: session.isSuperAdmin,
        imagingAccessBlocked: session.imagingAccessBlocked,
        hasOtherAllowedPortal: session.hasOtherAllowedPortal,
      };
    } catch (err) {
      const code = extractAuthErrorCode(err);
      const shouldFallbackToRedirect =
        !isEmbeddedIframe() &&
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment');

      if (shouldFallbackToRedirect) {
        try {
          await ensureAuthPersistence();
          setRedirectPendingFlag(true);
          redirecting = true;
          await signInWithRedirect(auth, googleProvider);
          return null;
        } catch (redirectErr) {
          redirecting = false;
          setRedirectPendingFlag(false);
          console.error('Google redirect fallback error:', redirectErr);
          setAuthErrorCode(extractAuthErrorCode(redirectErr) || null);
          setAuthError(
            mapFirebaseAuthError(redirectErr, TRANSLATIONS[languageRef.current]),
          );
          return null;
        }
      }

      console.error('Google sign-in error:', err);
      setAuthErrorCode(code || null);
      setAuthError(mapFirebaseAuthError(err, TRANSLATIONS[languageRef.current]));
      return null;
    } finally {
      if (!redirecting) {
        setAuthActionPending(false);
        authActionLockRef.current = false;
      }
    }
  }, [hydrateUserSession]);

  const switchGoogleAccount = useCallback(async () => {
    // Keep signInWithPopup synchronous to the click gesture (prompt: 'select_account' opens the picker without pre-signOut breaking mobile popups)
    return performGoogleSignIn();
  }, [performGoogleSignIn]);

  const logout = useCallback(async () => {
    authEpochRef.current += 1;
    setAuthActionPending(true);
    setRedirectPendingFlag(false);
    setPendingRedirectRoute(false);
    try {
      window.sessionStorage.removeItem(ACTIVE_STEP_KEY);
    } catch {
      // Ignore storage errors
    }
    try {
      activeUidRef.current = null;
      await signOut(auth);
      setFirebaseUser(null);
      setUserAccount(null);
      setRequests([]);
      setIsSuperAdmin(false);
      setAdminVerificationMeta(null);
      setImagingAccessBlocked(false);
      setHasOtherAllowedPortal(false);
      setImagingBlockedRouteNotice(false);
      setPortalIntent(null);
      setAuthError(null);
      setAuthErrorCode(null);
    } finally {
      setAuthActionPending(false);
    }
  }, [setPortalIntent]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
    setAuthErrorCode(null);
  }, []);

  const value = useMemo<MedoraContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      theme,
      setTheme,
      toggleTheme,
      t,
      firebaseUser,
      userAccount,
      setUserAccount,
      requests,
      refreshRequests,
      authLoading,
      authActionPending,
      authError,
      authErrorCode,
      clearAuthError,
      isSuperAdmin,
      adminCheckDone,
      adminVerificationMeta,
      imagingPortalEnabled,
      imagingAccessBlocked,
      hasOtherAllowedPortal,
      imagingBlockedRouteNotice,
      clearImagingBlockedRouteNotice,
      portalIntent,
      setPortalIntent,
      pendingRedirectRoute,
      consumePendingRedirectRoute,
      reverifySuperAdmin,
      signInWithGoogle: performGoogleSignIn,
      signInWithGoogleRedirect: performGoogleRedirectSignIn,
      switchGoogleAccount,
      logout,
    }),
    [
      language,
      setLanguage,
      toggleLanguage,
      theme,
      setTheme,
      toggleTheme,
      t,
      firebaseUser,
      userAccount,
      requests,
      refreshRequests,
      authLoading,
      authActionPending,
      authError,
      authErrorCode,
      clearAuthError,
      isSuperAdmin,
      adminCheckDone,
      adminVerificationMeta,
      imagingPortalEnabled,
      imagingAccessBlocked,
      hasOtherAllowedPortal,
      imagingBlockedRouteNotice,
      clearImagingBlockedRouteNotice,
      portalIntent,
      setPortalIntent,
      pendingRedirectRoute,
      consumePendingRedirectRoute,
      reverifySuperAdmin,
      performGoogleSignIn,
      performGoogleRedirectSignIn,
      switchGoogleAccount,
      logout,
    ],
  );

  return (
    <MedoraContext.Provider value={value}>{children}</MedoraContext.Provider>
  );
}

export function useMedora() {
  const ctx = useContext(MedoraContext);
  if (!ctx) {
    throw new Error('useMedora must be used inside MedoraProvider');
  }
  return ctx;
}

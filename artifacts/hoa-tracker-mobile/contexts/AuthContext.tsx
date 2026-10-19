import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { AppState, Platform } from 'react-native';
import {
  AuthUser,
  clearGateBellQuickUnlock,
  refreshMobileToken,
  logoutMobile,
  getCurrentUser,
  unregisterGateBellDevice,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthNavigationDecision } from '@/lib/coldStartNavigation';
import {
  deleteMobileToken,
  getMobileToken,
  MOBILE_TOKEN_KEYS,
  quickAccessKey,
  setMobileToken,
} from '@/lib/mobileTokens';

type QuickAccessMode = 'pin' | 'biometric';
type QuickAccessStep = 'setup' | 'locked' | null;

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  loginState: 'unauthenticated' | 'pending_mfa' | 'pending_enrollment' | 'authenticated';
  mfaChallengeId: string | null;
  mfaMethods: string[];
  mfaMaskedEmail: string | null;
  quickAccessMode: QuickAccessMode | null;
  quickAccessStep: QuickAccessStep;
  setPendingMfa: (challengeId: string, methods: string[], maskedEmail: string) => void;
  setPendingEnrollment: (challengeId: string) => void;
  completeLogin: (user: AuthUser, accessToken: string, refreshToken: string, accExp: string, refExp: string, promptQuickAccess?: boolean) => Promise<void>;
  completeQuickAccessSetup: (mode: QuickAccessMode) => Promise<void>;
  skipQuickAccessSetup: () => Promise<void>;
  completeQuickAccessUnlock: () => void;
  returnToGateBellAfterUnlock: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginState, setLoginState] = useState<'unauthenticated' | 'pending_mfa' | 'pending_enrollment' | 'authenticated'>('unauthenticated');
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaMethods, setMfaMethods] = useState<string[]>([]);
  const [mfaMaskedEmail, setMfaMaskedEmail] = useState<string | null>(null);
  const [quickAccessMode, setQuickAccessMode] = useState<QuickAccessMode | null>(null);
  const [quickAccessStep, setQuickAccessStep] = useState<QuickAccessStep>(null);
  const [pendingGateBellDestination, setPendingGateBellDestination] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const queryClient = useQueryClient();

  const isRefreshing = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const booting = useRef(true);
  const backgrounded = useRef(false);
  const coldStartRouteResolved = useRef(false);

  const scheduleRefresh = (expiresAtStr: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const expiresAt = new Date(expiresAtStr).getTime();
    const now = Date.now();
    const msUntilExpiry = expiresAt - now;
    const msUntilRefresh = Math.max(0, msUntilExpiry - 5 * 60 * 1000);
    refreshTimer.current = setTimeout(refreshSession, msUntilRefresh);
  };

  const clearStorage = useCallback(async () => {
    await Promise.all([
      deleteMobileToken(MOBILE_TOKEN_KEYS.accessToken),
      deleteMobileToken(MOBILE_TOKEN_KEYS.refreshToken),
      deleteMobileToken(MOBILE_TOKEN_KEYS.accessTokenExpiresAt),
      deleteMobileToken(MOBILE_TOKEN_KEYS.refreshTokenExpiresAt),
    ]);
  }, []);

  const currentUserId = user?.id;
  const clearLocalSession = useCallback(async (clearQuickAccess = false) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (clearQuickAccess) setPendingGateBellDestination(false);
    if (clearQuickAccess && currentUserId && Platform.OS === 'android') {
      await deleteMobileToken(quickAccessKey(currentUserId));
    }
    await clearStorage();
    setUser(null);
    setLoginState('unauthenticated');
    setQuickAccessMode(null);
    setQuickAccessStep(null);
    setMfaChallengeId(null);
    setMfaMethods([]);
    setMfaMaskedEmail(null);
    queryClient.clear();
  }, [clearStorage, queryClient, currentUserId]);

  const logout = useCallback(async () => {
    if (Platform.OS === 'android') {
      try { await clearGateBellQuickUnlock(); } catch { /* Keep local logout available offline. */ }
      try { await unregisterGateBellDevice(); } catch { /* Keep local logout available offline. */ }
    }
    try { await logoutMobile(); } catch { /* Local logout remains available offline. */ }
    await clearLocalSession(true);
  }, [clearLocalSession]);

  const completeLogin = async (
    usr: AuthUser,
    accToken: string,
    refToken: string,
    accExp: string,
    refExp: string,
    promptQuickAccess = true,
  ) => {
    await setMobileToken(MOBILE_TOKEN_KEYS.accessToken, accToken);
    await setMobileToken(MOBILE_TOKEN_KEYS.refreshToken, refToken);
    await setMobileToken(MOBILE_TOKEN_KEYS.accessTokenExpiresAt, accExp);
    await setMobileToken(MOBILE_TOKEN_KEYS.refreshTokenExpiresAt, refExp);
    setUser(usr);
    setLoginState('authenticated');
    if (Platform.OS === 'android' && promptQuickAccess) {
      const savedMode = await getMobileToken(quickAccessKey(usr.id));
      const mode = savedMode === 'pin' || savedMode === 'biometric' ? savedMode : null;
      setQuickAccessMode(mode);
      setQuickAccessStep(mode ? 'locked' : 'setup');
    }
    scheduleRefresh(accExp);
  };

  const completeQuickAccessSetup = useCallback(async (mode: QuickAccessMode) => {
    if (!user) throw new Error('Sign in before setting up quick access.');
    await setMobileToken(quickAccessKey(user.id), mode);
    setQuickAccessMode(mode);
    setQuickAccessStep(null);
  }, [user]);

  const skipQuickAccessSetup = useCallback(async () => {
    if (user) await setMobileToken(quickAccessKey(user.id), 'skipped');
    setQuickAccessStep(null);
  }, [user]);

  const completeQuickAccessUnlock = useCallback(() => setQuickAccessStep(null), []);
  const returnToGateBellAfterUnlock = useCallback(() => {
    setPendingGateBellDestination(true);
  }, []);

  const refreshSession = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      const refreshToken = await getMobileToken(MOBILE_TOKEN_KEYS.refreshToken);
      if (!refreshToken) throw new Error('No refresh token');
      
      const res = await refreshMobileToken({ refreshToken }, { noAuth: true } as RequestInit & { noAuth: boolean });
      await completeLogin(res.user, res.accessToken, res.refreshToken, res.accessTokenExpiresAt, res.refreshTokenExpiresAt, false);
      if (booting.current && Platform.OS === 'android') {
        const savedMode = await getMobileToken(quickAccessKey(res.user.id));
        const mode = savedMode === 'pin' || savedMode === 'biometric' ? savedMode : null;
        setQuickAccessMode(mode);
        setQuickAccessStep(mode ? 'locked' : null);
      }
    } catch (e) {
      await clearLocalSession();
    } finally {
      isRefreshing.current = false;
    }
  }, [clearLocalSession]);

  const setPendingMfa = (challengeId: string, methods: string[], maskedEmail: string) => {
    setMfaChallengeId(challengeId);
    setMfaMethods(methods);
    setMfaMaskedEmail(maskedEmail);
    setLoginState('pending_mfa');
  };

  const setPendingEnrollment = (challengeId: string) => {
    setMfaChallengeId(challengeId);
    setMfaMethods([]);
    setMfaMaskedEmail(null);
    setLoginState('pending_enrollment');
  };

  useEffect(() => {
    const init = async () => {
      try {
        const accToken = await getMobileToken(MOBILE_TOKEN_KEYS.accessToken);
        const refToken = await getMobileToken(MOBILE_TOKEN_KEYS.refreshToken);
        const accExp = await getMobileToken(MOBILE_TOKEN_KEYS.accessTokenExpiresAt);
        
        if (accToken && accExp) {
          const expiresAt = new Date(accExp).getTime();
          const now = Date.now();
          if (expiresAt - now < 5 * 60 * 1000) {
            await refreshSession();
          } else {
            const usr = await getCurrentUser();
            setUser(usr);
            setLoginState('authenticated');
            if (Platform.OS === 'android') {
              const savedMode = await getMobileToken(quickAccessKey(usr.id));
              const mode = savedMode === 'pin' || savedMode === 'biometric' ? savedMode : null;
              setQuickAccessMode(mode);
              setQuickAccessStep(mode ? 'locked' : null);
            }
            scheduleRefresh(accExp);
          }
        } else if (refToken) {
          await refreshSession();
        } else {
          setLoginState('unauthenticated');
        }
      } catch (e) {
        await clearLocalSession();
      } finally {
        booting.current = false;
        setIsLoading(false);
      }
    };

    init();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refreshSession, clearLocalSession]);

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    const isMfaRoute = segments.some((segment) => String(segment) === 'mfa');
    const isQuickAccessRoute = segments[0] === '(auth)' && segments[1] === 'quick-access';
    const isHomeRoute = segments[0] === '(tabs)' && segments.length === 1;
    const isGateBellRoute = segments[0] === 'gatebell';
    const decision = getAuthNavigationDecision({
      isLoading,
      loginState,
      inAuthGroup,
      isMfaRoute,
      isQuickAccessRoute,
      isHomeRoute,
      isGateBellRoute,
      quickAccessStep,
      coldStartResolved: coldStartRouteResolved.current,
      pendingGateBellDestination,
    });

    if (!decision) return;
    if (decision.resolveColdStart) coldStartRouteResolved.current = true;
    if (decision.consumePendingGateBell) setPendingGateBellDestination(false);
    if (decision.destination) router.replace(decision.destination);
  }, [loginState, quickAccessStep, segments, isLoading, pendingGateBellDestination, router]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (state === 'background') backgrounded.current = true;
        return;
      }
      if (backgrounded.current) {
        backgrounded.current = false;
        if (user && quickAccessMode) setQuickAccessStep('locked');
      }
    });
    return () => subscription.remove();
  }, [user, quickAccessMode]);

  return (
    <AuthContext.Provider value={{
      user, isLoading, loginState, mfaChallengeId, mfaMethods, mfaMaskedEmail,
      quickAccessMode, quickAccessStep,
      setPendingMfa, setPendingEnrollment, completeLogin, completeQuickAccessSetup,
      skipQuickAccessSetup, completeQuickAccessUnlock, returnToGateBellAfterUnlock,
      logout, refreshSession
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

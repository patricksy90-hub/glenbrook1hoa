export type MobileLoginState =
  | 'unauthenticated'
  | 'pending_mfa'
  | 'pending_enrollment'
  | 'authenticated';

export type MobileRootRoute =
  | '/(auth)/login'
  | '/(auth)/mfa'
  | '/(auth)/quick-access'
  | '/(tabs)'
  | '/gatebell';

export interface AuthNavigationDecision {
  destination: MobileRootRoute | null;
  resolveColdStart?: boolean;
  consumePendingGateBell?: boolean;
}

export interface AuthNavigationInput {
  isLoading: boolean;
  loginState: MobileLoginState;
  inAuthGroup: boolean;
  isMfaRoute: boolean;
  isQuickAccessRoute: boolean;
  isHomeRoute: boolean;
  isGateBellRoute: boolean;
  quickAccessStep: 'setup' | 'locked' | null;
  coldStartResolved: boolean;
  pendingGateBellDestination: boolean;
}

export function getAuthNavigationDecision(input: AuthNavigationInput): AuthNavigationDecision | null;
export function acceptNotificationResponse(
  identifier: string,
  receivedIds: Set<string>,
  clearLastResponse: () => void,
): boolean;

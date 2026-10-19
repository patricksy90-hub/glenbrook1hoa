const ROUTES = {
  login: '/(auth)/login',
  mfa: '/(auth)/mfa',
  quickAccess: '/(auth)/quick-access',
  home: '/(tabs)',
  gateBell: '/gatebell',
};

function getAuthNavigationDecision({
  isLoading,
  loginState,
  inAuthGroup,
  isMfaRoute,
  isQuickAccessRoute,
  isHomeRoute,
  isGateBellRoute,
  quickAccessStep,
  coldStartResolved,
  pendingGateBellDestination,
}) {
  if (isLoading) return null;

  if (loginState === 'unauthenticated') {
    return inAuthGroup ? null : { destination: ROUTES.login };
  }

  if (loginState === 'pending_mfa' || loginState === 'pending_enrollment') {
    return isMfaRoute ? null : { destination: ROUTES.mfa };
  }

  if (loginState !== 'authenticated') return null;

  if (quickAccessStep) {
    return isQuickAccessRoute ? null : { destination: ROUTES.quickAccess };
  }

  if (pendingGateBellDestination) {
    if (isGateBellRoute) {
      return {
        destination: null,
        resolveColdStart: true,
        consumePendingGateBell: true,
      };
    }
    return {
      destination: ROUTES.gateBell,
      resolveColdStart: true,
      consumePendingGateBell: false,
    };
  }

  if (!coldStartResolved) {
    return {
      destination: isHomeRoute ? null : ROUTES.home,
      resolveColdStart: true,
      consumePendingGateBell: false,
    };
  }

  if (inAuthGroup && !isHomeRoute) {
    return { destination: ROUTES.home };
  }

  return null;
}

function acceptNotificationResponse(identifier, receivedIds, clearLastResponse) {
  try {
    clearLastResponse();
  } catch {
    // Routing the notification must still work if the native clear call is unavailable.
  }

  if (typeof identifier !== 'string' || identifier.length === 0 || receivedIds.has(identifier)) {
    return false;
  }

  receivedIds.add(identifier);
  return true;
}

module.exports = { getAuthNavigationDecision, acceptNotificationResponse };

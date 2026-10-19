const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAuthNavigationDecision,
  acceptNotificationResponse,
} = require('../lib/coldStartNavigation.js');

function input(overrides = {}) {
  return {
    isLoading: false,
    loginState: 'authenticated',
    inAuthGroup: false,
    isMfaRoute: false,
    isQuickAccessRoute: false,
    isHomeRoute: false,
    isGateBellRoute: false,
    quickAccessStep: null,
    coldStartResolved: false,
    pendingGateBellDestination: false,
    ...overrides,
  };
}

test('a cold launcher start resets a restored GateBell route to Home', () => {
  assert.deepEqual(getAuthNavigationDecision(input()), {
    destination: '/(tabs)',
    resolveColdStart: true,
    consumePendingGateBell: false,
  });
});

test('a cold launcher start already at Home resolves without replacing the route', () => {
  assert.deepEqual(getAuthNavigationDecision(input({ isHomeRoute: true })), {
    destination: null,
    resolveColdStart: true,
    consumePendingGateBell: false,
  });
});

test('a fresh GateBell notification routes to GateBell once after authentication', () => {
  assert.deepEqual(getAuthNavigationDecision(input({ pendingGateBellDestination: true })), {
    destination: '/gatebell',
    resolveColdStart: true,
    consumePendingGateBell: false,
  });
  assert.deepEqual(getAuthNavigationDecision(input({
    coldStartResolved: true,
    pendingGateBellDestination: true,
    isGateBellRoute: true,
  })), {
    destination: null,
    resolveColdStart: true,
    consumePendingGateBell: true,
  });
});

test('a notification cold start shows quick access first and preserves its destination', () => {
  assert.equal(getAuthNavigationDecision(input({
    pendingGateBellDestination: true,
    quickAccessStep: 'locked',
  })).destination, '/(auth)/quick-access');

  assert.equal(getAuthNavigationDecision(input({
    coldStartResolved: true,
    pendingGateBellDestination: true,
    inAuthGroup: true,
    isQuickAccessRoute: true,
    quickAccessStep: null,
  })).destination, '/gatebell');
});

test('normal in-app navigation is not reset after cold start resolution', () => {
  assert.equal(getAuthNavigationDecision(input({
    coldStartResolved: true,
    isGateBellRoute: true,
  })), null);
});

test('login and MFA guards still take precedence over protected routes', () => {
  assert.equal(getAuthNavigationDecision(input({
    loginState: 'unauthenticated',
    inAuthGroup: false,
    isGateBellRoute: true,
  })).destination, '/(auth)/login');
  assert.equal(getAuthNavigationDecision(input({
    loginState: 'pending_mfa',
    isMfaRoute: false,
    isGateBellRoute: true,
  })).destination, '/(auth)/mfa');
  assert.equal(getAuthNavigationDecision(input({
    isLoading: true,
    isGateBellRoute: true,
  })), null);
});

test('notification responses are cleared and duplicate identifiers are consumed only once', () => {
  const receivedIds = new Set();
  let clearCount = 0;
  const clear = () => { clearCount += 1; };

  assert.equal(acceptNotificationResponse('alert-1', receivedIds, clear), true);
  assert.equal(acceptNotificationResponse('alert-1', receivedIds, clear), false);
  assert.equal(clearCount, 2);
  assert.deepEqual([...receivedIds], ['alert-1']);
});

test('a native clear failure does not prevent the current notification from being handled', () => {
  assert.equal(acceptNotificationResponse('alert-2', new Set(), () => {
    throw new Error('native response unavailable');
  }), true);
});

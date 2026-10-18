const test = require('node:test');
const assert = require('node:assert/strict');
const { PACKAGE, validateAndroidConfig, validateDomain, buildEnvironment } = require('./android-build-config.cjs');

function fixture() {
  return {
    project_info: { project_id: 'fixture-project', project_number: '123456' },
    client: [{
      client_info: {
        android_client_info: { package_name: PACKAGE },
        mobilesdk_app_id: '1:123456:android:fixture',
      },
    }],
  };
}

test('accepts a client configuration for the unchanged package', () => {
  assert.deepEqual(validateAndroidConfig(JSON.stringify(fixture())), fixture());
});

test('rejects malformed JSON, missing project fields and a different package without echoing input', () => {
  for (const config of ['not-json', 'null', '{}', '{"client":{}}']) {
    assert.throws(() => validateAndroidConfig(config));
  }
  const config = fixture();
  config.client[0].client_info.android_client_info.package_name = 'other.package';
  assert.throws(() => validateAndroidConfig(JSON.stringify(config)), /must contain a project/);
  config.client[0].client_info.android_client_info.package_name = PACKAGE;
  delete config.project_info.project_number;
  assert.throws(() => validateAndroidConfig(JSON.stringify(config)), /must contain a project/);
});

test('requires an explicit hostname, never falls back to a development or inferred production domain', () => {
  assert.equal(validateDomain('api.example.org'), 'api.example.org');
  for (const value of [undefined, '', 'https://api.example.org', 'localhost', 'api.example.org/path', 'api.example.org:80']) {
    assert.throws(() => validateDomain(value), /hostname only/);
  }
});

test('child processes get no Firebase JSON, server credentials, or arbitrary public variables', () => {
  const child = buildEnvironment({
    PATH: '/bin', JAVA_HOME: '/java', ANDROID_HOME: '/android',
    EXPO_PUBLIC_DOMAIN: 'api.example.org',
    FCM_SERVICE_ACCOUNT_JSON: 'must-not-escape',
    FIREBASE_ANDROID_CONFIG_JSON: 'client-config-not-needed-in-child-env',
    SESSION_SECRET: 'must-not-escape',
    EXPO_PUBLIC_UNEXPECTED_SECRET: 'must-not-escape',
  });
  assert.equal(child.JAVA_HOME, '/java');
  assert.equal(child.EXPO_PUBLIC_DOMAIN, 'api.example.org');
  for (const name of ['FCM_SERVICE_ACCOUNT_JSON', 'FIREBASE_ANDROID_CONFIG_JSON', 'SESSION_SECRET', 'EXPO_PUBLIC_UNEXPECTED_SECRET']) {
    assert.equal(child[name], undefined);
  }
});

test('accepts HTTPS portal links and rejects credentials or insecure links', () => {
  assert.equal(buildEnvironment({
    EXPO_PUBLIC_DOMAIN: 'api.example.org',
    EXPO_PUBLIC_WEB_PORTAL_URL: 'https://portal.example.org/',
  }).EXPO_PUBLIC_WEB_PORTAL_URL, 'https://portal.example.org/');
  for (const url of ['http://portal.example.org', 'https://user:password@portal.example.org', 'invalid']) {
    assert.throws(() => buildEnvironment({
      EXPO_PUBLIC_DOMAIN: 'api.example.org', EXPO_PUBLIC_WEB_PORTAL_URL: url,
    }), /HTTPS URL/);
  }
});

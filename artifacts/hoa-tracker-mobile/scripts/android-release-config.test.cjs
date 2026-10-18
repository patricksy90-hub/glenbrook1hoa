const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseConfig, configureReleaseGradle, fingerprint } = require('./android-release-config.cjs');

test('missing credentials never fall back to debug signing', () => {
  assert.throws(() => releaseConfig({}), /Missing release signing/);
  assert.throws(() => fingerprint(''), /fingerprint/);
});

test('release key material requires a pinned certificate and strong passwords', () => {
  const env = {
    ANDROID_RELEASE_KEYSTORE_BASE64: Buffer.from('fixture').toString('base64'),
    ANDROID_RELEASE_STORE_PASSWORD: 'not-a-real-password',
    ANDROID_RELEASE_KEY_PASSWORD: 'not-a-real-password',
    ANDROID_RELEASE_KEY_ALIAS: 'hoa-release',
    ANDROID_RELEASE_CERT_SHA256: 'ab'.repeat(32),
  };
  assert.equal(releaseConfig(env).certificateSha256, 'ab'.repeat(32));
  assert.throws(() => releaseConfig({ ...env, ANDROID_RELEASE_CERT_SHA256: 'bad' }), /fingerprint/);
  assert.throws(() => releaseConfig({ ...env, ANDROID_RELEASE_KEY_ALIAS: 'invalid"alias' }), /alias/);
  assert.throws(() => releaseConfig({ ...env, ANDROID_RELEASE_KEY_PASSWORD: 'short' }), /16 characters/);
});

test('only release variant uses the production keystore; unknown templates fail closed', () => {
  const gradle = `android { signingConfigs { debug { storeFile file('debug.keystore') } }
    buildTypes { debug { signingConfig signingConfigs.debug }
    release { signingConfig signingConfigs.debug } } }`;
  const updated = configureReleaseGradle(gradle);
  assert.match(updated, /debug \{ signingConfig signingConfigs.debug/);
  assert.match(updated, /release \{ signingConfig signingConfigs.production/);
  assert.match(updated, /System.getenv\("HOA_RELEASE_KEYSTORE"\)/);
  assert.throws(() => configureReleaseGradle('android {}'), /changed/);
});

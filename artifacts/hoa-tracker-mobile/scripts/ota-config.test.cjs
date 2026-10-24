const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { X509Certificate } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const configure = require('../app.config.js');
const { checkNativeCompatibility } = require('./ota-native-config.cjs');
const config = require('../app.json').expo;

test('OTA bootstrap retains Android identity, advances version and locks native compatibility', () => {
  assert.equal(config.android.package, 'com.glenbrook1.hoatracker');
  assert.ok(config.android.versionCode >= 3);
  assert.equal(checkNativeCompatibility(root).runtimeVersion, config.runtimeVersion);
  const certificate = new X509Certificate(fs.readFileSync(path.join(__dirname, '../assets/updates/certificate.pem')));
  assert.ok(certificate.keyUsage.includes('1.3.6.1.5.5.7.3.3'), 'Android requires the code-signing EKU');
});
test('production starts from embedded/cache and never forces a mid-session reload', () => {
  assert.equal(config.updates.checkAutomatically, 'ON_LOAD');
  assert.equal(config.updates.fallbackToCacheTimeout, 0);
  assert.equal(config.updates.useEmbeddedUpdate, true);
  assert.equal(config.updates.disableAntiBrickingMeasures, undefined);
  assert.equal(config.updates.codeSigningMetadata.alg, 'rsa-v1_5-sha256');
});
test('test channel has a distinct native runtime and debug APKs disable OTA', () => {
  const previous = { channel: process.env.HOA_OTA_CHANNEL, disabled: process.env.HOA_OTA_DISABLED };
  try {
    process.env.HOA_OTA_CHANNEL = 'test';
    assert.equal(configure({ config }).runtimeVersion, `${config.runtimeVersion}-test`);
    assert.match(configure({ config }).updates.url, /\/test\/manifest$/);
    process.env.HOA_OTA_DISABLED = '1';
    assert.equal(configure({ config }).updates.enabled, false);
  } finally {
    if (previous.channel === undefined) delete process.env.HOA_OTA_CHANNEL; else process.env.HOA_OTA_CHANNEL = previous.channel;
    if (previous.disabled === undefined) delete process.env.HOA_OTA_DISABLED; else process.env.HOA_OTA_DISABLED = previous.disabled;
  }
});

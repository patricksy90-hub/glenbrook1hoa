const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Conservative native boundary: dependency/lock/config changes require a new
// runtime and APK. JS screens and application assets may update independently.
const inputs = [
  'pnpm-lock.yaml', '.github/android-release-target.json',
  ...['app.json', 'app.config.js', 'package.json', 'babel.config.js', 'metro.config.js',
    'assets/updates/certificate.pem', 'scripts/build-android-apk.cjs',
    'scripts/android-build-config.cjs', 'scripts/android-release-config.cjs',
  ].map(file => `artifacts/hoa-tracker-mobile/${file}`),
];
function nativeFingerprint(root) {
  const hash = createHash('sha256');
  for (const file of inputs) hash.update(`${file}\0`).update(fs.readFileSync(path.join(root, file))).update('\0');
  return hash.digest('hex');
}
function checkNativeCompatibility(root) {
  const stamp = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/hoa-tracker-mobile/release/ota-native-lock.json')));
  const app = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/hoa-tracker-mobile/app.json'))).expo;
  if (stamp.runtimeVersion !== app.runtimeVersion || stamp.sha256 !== nativeFingerprint(root)) {
    throw new Error('Native OTA inputs changed. Increase runtime/versionCode, create a new native lock and build an APK; do not publish an OTA update.');
  }
  return stamp;
}
module.exports = { nativeFingerprint, checkNativeCompatibility };

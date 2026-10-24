const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { PACKAGE } = require('./android-build-config.cjs');

function fingerprint(value) {
  const normalized = String(value || '').replace(/:/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error('A release certificate SHA-256 fingerprint is required.');
  return normalized;
}

function assertVersionCodeAdvances(candidateVersionCode, currentVersionCode) {
  if (!Number.isSafeInteger(candidateVersionCode) || candidateVersionCode < 1) {
    throw new Error('Candidate Android versionCode must be a positive integer.');
  }
  if (currentVersionCode == null) return candidateVersionCode;
  if (!Number.isSafeInteger(currentVersionCode) || currentVersionCode < 1) {
    throw new Error('Active private Android release versionCode is invalid.');
  }
  if (candidateVersionCode <= currentVersionCode) {
    throw new Error('Candidate Android versionCode must exceed the active private release.');
  }
  return candidateVersionCode;
}

function releaseConfig(env) {
  for (const name of ['ANDROID_RELEASE_KEYSTORE_BASE64', 'ANDROID_RELEASE_STORE_PASSWORD', 'ANDROID_RELEASE_KEY_PASSWORD', 'ANDROID_RELEASE_KEY_ALIAS']) {
    if (!env[name]) throw new Error(`Missing release signing setting: ${name}. Debug signing is not allowed.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(env.ANDROID_RELEASE_KEY_ALIAS)) throw new Error('Invalid release key alias.');
  if (env.ANDROID_RELEASE_STORE_PASSWORD.length < 16 || env.ANDROID_RELEASE_KEY_PASSWORD.length < 16) {
    throw new Error('Release signing passwords must have at least 16 characters.');
  }
  return {
    keystore: Buffer.from(env.ANDROID_RELEASE_KEYSTORE_BASE64, 'base64'),
    storePassword: env.ANDROID_RELEASE_STORE_PASSWORD,
    keyPassword: env.ANDROID_RELEASE_KEY_PASSWORD,
    alias: env.ANDROID_RELEASE_KEY_ALIAS,
    certificateSha256: fingerprint(env.ANDROID_RELEASE_CERT_SHA256),
  };
}

function configureReleaseGradle(gradle) {
  if (!/signingConfigs\s*\{/.test(gradle) || !/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(gradle)) {
    throw new Error('Generated signing configuration changed; inspect before releasing.');
  }
  const updated = gradle.replace(/signingConfigs\s*\{/, `signingConfigs {
        production {
            storeFile file(System.getenv("HOA_RELEASE_KEYSTORE"))
            storePassword System.getenv("HOA_RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("HOA_RELEASE_KEY_ALIAS")
            keyPassword System.getenv("HOA_RELEASE_KEY_PASSWORD")
        }`).replace(/(release\s*\{[\s\S]*?signingConfig\s+)signingConfigs\.debug/, '$1signingConfigs.production');
  if (/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(updated)) throw new Error('Release still uses debug signing.');
  return updated;
}

function tool(sdk, name) {
  const directory = path.join(sdk, 'build-tools', '36.0.0');
  const filename = path.join(directory, name);
  if (!fs.existsSync(filename)) throw new Error(`Android build-tools 36.0.0 ${name} is required.`);
  return filename;
}

function command(filename, args, env) {
  const result = spawnSync(filename, args, { encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Android verification failed: ${path.basename(filename)}.`);
  return result.stdout;
}

function inspectRelease(apk, sdk, env, expectedCertificate, expectedVersionCode) {
  const signature = command(tool(sdk, 'apksigner'), ['verify', '--verbose', '--print-certs', apk], env);
  const digests = [...signature.matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*(\S+)/gm)];
  if (digests.length !== 1 || fingerprint(digests[0][1]) !== fingerprint(expectedCertificate)) {
    throw new Error('APK signer does not match the retained release certificate.');
  }
  if (/CN=Android Debug/i.test(signature)) throw new Error('Debug certificates cannot be released.');
  if (!/Verified using v2 scheme.*true/i.test(signature)) throw new Error('APK signature scheme v2 verification is required.');
  const badging = command(tool(sdk, 'aapt'), ['dump', 'badging', apk], env);
  const pkg = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  const minSdk = Number(badging.match(/^sdkVersion:'(\d+)'/m)?.[1]);
  const targetSdk = Number(badging.match(/^targetSdkVersion:'(\d+)'/m)?.[1]);
  const architectures = [...(badging.match(/^native-code:\s*(.*)$/m)?.[1] || '').matchAll(/'([^']+)'/g)].map(value => value[1]);
  if (!pkg || pkg[1] !== PACKAGE || Number(pkg[2]) !== expectedVersionCode || !minSdk || targetSdk < 35 || !architectures.includes('arm64-v8a')) {
    throw new Error('APK package, version, SDK or arm64 architecture failed release checks.');
  }
  // Ensure a standalone JS bundle is inside the signed archive.
  const zip = command('unzip', ['-Z1', apk], env);
  if (!zip.split('\n').includes('assets/index.android.bundle')) throw new Error('Standalone JavaScript bundle is missing.');
  const bytes = fs.readFileSync(apk);
  return {
    package: PACKAGE, version: pkg[3], versionCode: Number(pkg[2]),
    minSdk, targetSdk, architectures,
    sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    certificateSha256: fingerprint(expectedCertificate), signing: 'release',
  };
}

module.exports = {
  releaseConfig, configureReleaseGradle, fingerprint, inspectRelease, assertVersionCodeAdvances,
};

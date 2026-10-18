// Native build core. Default entrypoint remains an internal debug-signed test.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PACKAGE, validateAndroidConfig, buildEnvironment } = require('./android-build-config.cjs');
const { configureReleaseGradle, inspectRelease } = require('./android-release-config.cjs');

const root = path.resolve(__dirname, '../../..');
const mobileRelative = 'artifacts/hoa-tracker-mobile';

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed. See the build output above.`);
  }
}

function build(prepareOnly, release) {
  const env = buildEnvironment(process.env);
  const output = path.join(root, `generated-artifacts/android/${release ? 'glenbrook1-android' : 'gatebell-test'}.apk`);
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!prepareOnly && (!sdk || !fs.existsSync(path.join(sdk, 'platforms')) || !fs.existsSync(path.join(sdk, 'build-tools')))) {
    throw new Error('An Android SDK with platforms and build-tools is required. Use the Android test APK CI workflow or an Android SDK build computer.');
  }
  const firebase = validateAndroidConfig(process.env.FIREBASE_ANDROID_CONFIG_JSON);
  if (JSON.parse(fs.readFileSync(path.join(root, mobileRelative, 'app.json'), 'utf8')).expo.android.package !== PACKAGE) {
    throw new Error('The mobile package has changed; verify its Firebase registration before building.');
  }
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'gatebell-android-'));
  fs.chmodSync(staging, 0o700);
  try {
    // Explicit source allowlist: no API code, .env files, server keys, git history,
    // cached bundles, or developer node_modules are copied into the build.
    for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json']) {
      fs.copyFileSync(path.join(root, file), path.join(staging, file));
    }
    const app = path.join(staging, mobileRelative);
    fs.mkdirSync(app, { recursive: true });
    for (const entry of [
      'app', 'assets', 'components', 'constants', 'contexts', 'hooks', 'lib',
      'app.json', 'package.json', 'metro.config.js', 'babel.config.js', 'tsconfig.json', 'expo-env.d.ts',
    ]) {
      fs.cpSync(path.join(root, mobileRelative, entry), path.join(app, entry), {
        recursive: true,
        filter: (source) => path.basename(source) !== 'node_modules' && !path.basename(source).startsWith('.env'),
      });
    }
    fs.cpSync(path.join(root, 'lib/api-client-react'), path.join(staging, 'lib/api-client-react'), {
      recursive: true,
      filter: (source) => !['node_modules', 'dist'].includes(path.basename(source)) && !path.basename(source).startsWith('.env'),
    });
    fs.cpSync(path.join(root, 'lib/designation'), path.join(staging, 'lib/designation'), {
      recursive: true,
      filter: (source) => !['node_modules', 'dist'].includes(path.basename(source)) && !path.basename(source).startsWith('.env'),
    });
    const appJsonPath = path.join(app, 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    if (release && (!Number.isSafeInteger(appJson.expo.android.versionCode) || appJson.expo.android.versionCode < 1)) {
      throw new Error('Set an explicit positive Android versionCode before releasing.');
    }
    appJson.expo.android.googleServicesFile = './google-services.json';
    fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
    fs.writeFileSync(path.join(app, 'google-services.json'), JSON.stringify(firebase), { mode: 0o600 });

    run('pnpm', ['install', '--frozen-lockfile', '--filter', '@workspace/hoa-tracker-mobile...'], staging, env);
    run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'android', '--no-install'], app, env);
    const android = path.join(app, 'android');
    // Expo's generated release variant uses its test/debug signing key.
    // Refuse to silently produce a differently signed or unsigned build.
    const gradle = fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8');
    if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/.test(gradle)) {
      throw new Error('Generated Android release signing changed. Inspect it before making a test APK.');
    }
    if (prepareOnly) {
      run('pnpm', ['exec', 'expo', 'export', '--platform', 'android', '--output-dir', '.android-bundle-check'], app, env);
      console.log('Native Android prebuild and JavaScript bundle verified. No APK was compiled or produced.');
      return;
    }
    let gradleEnv = env;
    if (release) {
      const keystore = path.join(staging, 'release.keystore');
      fs.writeFileSync(keystore, release.keystore, { mode: 0o600 });
      fs.writeFileSync(path.join(android, 'app/build.gradle'), configureReleaseGradle(gradle));
      // Only the native signing subprocess receives signing secrets. They are
      // not available during dependency installation, prebuild or Metro setup.
      gradleEnv = {
        ...env,
        HOA_RELEASE_KEYSTORE: keystore,
        HOA_RELEASE_STORE_PASSWORD: release.storePassword,
        HOA_RELEASE_KEY_PASSWORD: release.keyPassword,
        HOA_RELEASE_KEY_ALIAS: release.alias,
      };
    }
    run('./gradlew', [':app:assembleRelease', '--no-daemon', '--console=plain'], android, gradleEnv);
    const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
    if (!fs.existsSync(apk)) throw new Error('Gradle completed without the expected release APK.');
    const inspected = release
      ? inspectRelease(apk, sdk, env, release.certificateSha256, appJson.expo.android.versionCode)
      : undefined;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(apk, output);
    fs.writeFileSync(`${output}.json`, JSON.stringify({
      purpose: release ? 'Private resident Android release.' : 'Internal testing only; debug-key signed, not for store submission.',
      package: PACKAGE,
      apiHostname: env.EXPO_PUBLIC_DOMAIN,
      portalUrl: env.EXPO_PUBLIC_WEB_PORTAL_URL,
      builtAt: new Date().toISOString(),
      ...inspected,
    }, null, 2));
    console.log(`${release ? 'Release' : 'Test'} APK created: ${path.relative(root, output)}`);
  } finally {
    // Removes generated Firebase files and native outputs even when a build fails.
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--prepare-only')) {
    throw new Error('Usage: build-android-apk.cjs [--prepare-only]');
  }
  build(args[0] === '--prepare-only');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

module.exports = { build };

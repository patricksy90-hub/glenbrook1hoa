const { releaseConfig } = require('./android-release-config.cjs');
const { build } = require('./build-android-apk.cjs');

try {
  if (process.argv.length !== 2) throw new Error('Usage: build-android-release.cjs');
  if (!process.env.EXPO_PUBLIC_WEB_PORTAL_URL) throw new Error('An explicit published HTTPS portal URL is required.');
  for (const host of [process.env.EXPO_PUBLIC_DOMAIN, new URL(process.env.EXPO_PUBLIC_WEB_PORTAL_URL).hostname]) {
    if (!host || /(?:^|\.)(localhost|local|test|invalid)$|\.replit\.dev$|\.repl\.co$/i.test(host)) {
      throw new Error('Release builds cannot target a local, test or Replit development hostname.');
    }
  }
  build(false, releaseConfig(process.env));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

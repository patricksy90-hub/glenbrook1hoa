const PACKAGE = 'com.glenbrook1.hoatracker';

function validateAndroidConfig(raw) {
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_ANDROID_CONFIG_JSON must contain the complete google-services.json JSON.');
  }
  const client = config?.client?.find?.(
    (entry) => entry?.client_info?.android_client_info?.package_name === PACKAGE,
  );
  if (
    typeof config?.project_info?.project_id !== 'string' ||
    !config.project_info.project_id.trim() ||
    typeof config.project_info.project_number !== 'string' ||
    !config.project_info.project_number.trim() ||
    typeof client?.client_info?.mobilesdk_app_id !== 'string' ||
    !client.client_info.mobilesdk_app_id.trim()
  ) {
    throw new Error(`The Android Firebase file must contain a project and an Android app for ${PACKAGE}.`);
  }
  return config;
}

function validateDomain(value) {
  // The app adds "https://" itself; accept a hostname, not a URL/path.
  if (!value || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) || !value.includes('.')) {
    throw new Error('EXPO_PUBLIC_DOMAIN must be an HTTPS API hostname only, without a scheme, port or path.');
  }
  return value;
}

function buildEnvironment(env) {
  // Do not forward the server service-account key or other workspace secrets
  // to dependency lifecycle scripts, Metro, Expo prebuild or Gradle.
  const allowed = [
    'PATH', 'HOME', 'USER', 'SHELL', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT',
    'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT',
    'GRADLE_USER_HOME',
  ];
  const child = Object.fromEntries(
    allowed.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]),
  );
  child.CI = '1';
  child.EXPO_NO_TELEMETRY = '1';
  child.EXPO_PUBLIC_DOMAIN = validateDomain(env.EXPO_PUBLIC_DOMAIN);
  if (env.EXPO_PUBLIC_WEB_PORTAL_URL) {
    let url;
    try { url = new URL(env.EXPO_PUBLIC_WEB_PORTAL_URL); } catch {}
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('EXPO_PUBLIC_WEB_PORTAL_URL must be an HTTPS URL without credentials.');
    }
    child.EXPO_PUBLIC_WEB_PORTAL_URL = url.toString();
  }
  return child;
}

module.exports = { PACKAGE, validateAndroidConfig, validateDomain, buildEnvironment };

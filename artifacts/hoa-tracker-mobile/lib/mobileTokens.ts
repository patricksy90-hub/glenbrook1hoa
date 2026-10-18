import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const MOBILE_TOKEN_KEYS = {
  accessToken: 'mobile_access_token',
  refreshToken: 'mobile_refresh_token',
  accessTokenExpiresAt: 'mobile_access_token_expires_at',
  refreshTokenExpiresAt: 'mobile_refresh_token_expires_at',
  gateBellDeviceId: 'gatebell_device_id',
} as const;

export const quickAccessKey = (userId: number) => `mobile_quick_access_${userId}` as const;
type MobileTokenKey =
  | (typeof MOBILE_TOKEN_KEYS)[keyof typeof MOBILE_TOKEN_KEYS]
  | `mobile_quick_access_${number}`;

function getWebStorage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export async function getMobileToken(key: MobileTokenKey) {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setMobileToken(key: MobileTokenKey, value: string) {
  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteMobileToken(key: MobileTokenKey) {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function getAccessToken() {
  return getMobileToken(MOBILE_TOKEN_KEYS.accessToken);
}
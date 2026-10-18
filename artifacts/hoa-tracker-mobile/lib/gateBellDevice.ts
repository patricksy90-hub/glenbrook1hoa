import * as Crypto from 'expo-crypto';
import { getMobileToken, MOBILE_TOKEN_KEYS, setMobileToken } from '@/lib/mobileTokens';

let deviceIdPromise: Promise<string> | null = null;

export function getGateBellDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const savedId = await getMobileToken(MOBILE_TOKEN_KEYS.gateBellDeviceId);
      if (savedId && /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(savedId)) return savedId;
      const id = Crypto.randomUUID();
      await setMobileToken(MOBILE_TOKEN_KEYS.gateBellDeviceId, id);
      return id;
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}

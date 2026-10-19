import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts as useDMFonts,
} from '@expo-google-fonts/dm-sans';
import {
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  useFonts as useOutfitFonts,
} from '@expo-google-fonts/outfit';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { setBaseUrl, setAuthTokenGetter, setDefaultHeadersGetter } from '@workspace/api-client-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppState, Platform } from 'react-native';
import { getAccessToken } from '@/lib/mobileTokens';
import { getGateBellDeviceId } from '@/lib/gateBellDevice';
import { acceptNotificationResponse } from '@/lib/coldStartNavigation';

SplashScreen.preventAutoHideAsync();
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient();

if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

setAuthTokenGetter(getAccessToken);
setDefaultHeadersGetter(async () => ({ 'X-GateBell-Device-Id': await getGateBellDeviceId() }));

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

function RootLayoutNav() {
  const { isLoading, user, returnToGateBellAfterUnlock } = useAuth();
  const receivedNotificationIds = useRef(new Set<string>());
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('gatebell-alerts', {
        name: 'GateBell alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      }).catch(() => undefined);
    }

  }, []);

  const receiveNotificationResponse = useCallback((identifier: string) => {
    const accepted = acceptNotificationResponse(
      identifier,
      receivedNotificationIds.current,
      () => Notifications.clearLastNotificationResponse(),
    );
    if (accepted) setPendingNotificationId(identifier);
  }, []);

  useEffect(() => {
    let active = true;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      receiveNotificationResponse(response.notification.request.identifier);
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) receiveNotificationResponse(response.notification.request.identifier);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription.remove();
    };
  }, [receiveNotificationResponse]);

  useEffect(() => {
    if (!user || !pendingNotificationId) return;
    returnToGateBellAfterUnlock();
    setPendingNotificationId(null);
  }, [pendingNotificationId, returnToGateBellAfterUnlock, user]);

  if (isLoading) return null;

  return (
    <Stack
      initialRouteName="(auth)/login"
      screenOptions={{ headerShown: false, headerBackTitle: 'Back' }}
    >
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(auth)/mfa" />
      <Stack.Screen name="(auth)/quick-access" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Feedback', presentation: 'modal' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', presentation: 'modal' }} />
      <Stack.Screen name="security" options={{ headerShown: true, title: 'Security', presentation: 'modal' }} />
      <Stack.Screen name="household" options={{ headerShown: true, title: 'My Household' }} />
      <Stack.Screen name="applications" options={{ headerShown: true, title: 'Applications' }} />
      <Stack.Screen name="portal-handoff" options={{ headerShown: true, title: 'Web Portal', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [dmLoaded, dmError] = useDMFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  
  const [outfitLoaded, outfitError] = useOutfitFonts({
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  const fontsLoaded = dmLoaded && outfitLoaded;
  const fontError = dmError || outfitError;
  const appReady = Platform.OS === 'web' || fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync();
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

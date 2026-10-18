import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { verifyGateBellQuickUnlock, registerGateBellQuickUnlock } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { Surface } from '@/components/Surface';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function QuickAccessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    user,
    quickAccessMode,
    quickAccessStep,
    completeQuickAccessSetup,
    skipQuickAccessSetup,
    completeQuickAccessUnlock,
    logout,
  } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [fingerprintAvailable, setFingerprintAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isSetup = quickAccessStep === 'setup';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [hasHardware, enrolled, types] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        if (active) {
          setFingerprintAvailable(
            hasHardware &&
            enrolled &&
            types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT),
          );
        }
      } catch {
        if (active) setFingerprintAvailable(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const enableFingerprint = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: isSetup ? 'Confirm fingerprint quick unlock' : 'Unlock Glenbrook 1 HOA',
        cancelLabel: 'Cancel',
      });
      if (!result.success) {
        if (result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') {
          setError('Fingerprint verification did not complete. Try again or use your six-digit PIN.');
        }
        return;
      }
      if (isSetup) await completeQuickAccessSetup('biometric');
      else completeQuickAccessUnlock();
    } catch {
      setError('Fingerprint unlock is unavailable. Use your PIN or full sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const savePin = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter all six digits.');
      return;
    }
    if (isSetup && pin !== confirmPin) {
      setError('Those PINs do not match.');
      return;
    }
    if (!user) {
      setError('Your signed-in account could not be found. Use full sign-in.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (isSetup) {
        await registerGateBellQuickUnlock({ pin });
        await completeQuickAccessSetup('pin');
      } else {
        const response = await verifyGateBellQuickUnlock(
          { userId: user.id, pin },
          { noAuth: true } as RequestInit & { noAuth: true },
        );
        if (response.valid) completeQuickAccessUnlock();
      }
      setPin('');
      setConfirmPin('');
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      setError(status === 429
        ? 'Quick unlock is temporarily locked. Use full sign-in and try again later.'
        : isSetup
          ? 'The PIN could not be saved. Check your connection and try again.'
          : 'That PIN did not work. Try again or use full sign-in.');
    } finally {
      setBusy(false);
    }
  };

  const useFullSignIn = async () => {
    setBusy(true);
    await logout();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]} accessibilityElementsHidden>
          <Text style={[styles.brandLetter, { color: colors.primaryForeground }]}>G</Text>
        </View>
        <Text style={[styles.brandName, { color: colors.foreground }]}>Glenbrook 1 HOA</Text>
      </View>

      <Surface style={styles.card} elevated>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          {isSetup ? 'OPTIONAL QUICK ACCESS' : 'SECURE QUICK ACCESS'}
        </Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {isSetup ? 'Make your next sign-in faster' : 'Welcome back'}
        </Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          {isSetup
            ? 'After your normal password and verification, choose a six-digit PIN or fingerprint for this phone. It only unlocks your saved session; it cannot sign in by itself.'
            : 'Unlock this phone with the quick-access method you set after signing in.'}
        </Text>

        {isSetup || quickAccessMode === 'pin' ? (
          <View style={styles.pinFields}>
            <TextInput
              accessibilityLabel="Six-digit quick-access PIN"
              autoComplete="off"
              autoCorrect={false}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setPin}
              placeholder="6-digit PIN"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
              value={pin}
            />
            {isSetup && (
              <TextInput
                accessibilityLabel="Confirm six-digit PIN"
                autoComplete="off"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setConfirmPin}
                placeholder="Confirm PIN"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                value={confirmPin}
              />
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void savePin()}
              style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: colors.radius }, busy && styles.disabled]}
            >
              {busy ? <ActivityIndicator color={colors.primaryForeground} /> : (
                <Text style={[styles.primaryLabel, { color: colors.primaryForeground }]}>
                  {isSetup ? 'Save PIN' : 'Unlock with PIN'}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {fingerprintAvailable && (isSetup || quickAccessMode === 'biometric') && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void enableFingerprint()}
            style={[styles.biometricButton, { borderColor: colors.border, borderRadius: colors.radius }, busy && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={colors.primary} /> : (
              <Text style={[styles.biometricLabel, { color: colors.foreground }]}>
                {isSetup ? 'Enable fingerprint unlock' : 'Unlock with fingerprint'}
              </Text>
            )}
          </Pressable>
        )}

        {isSetup && !fingerprintAvailable && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Fingerprint is not set up on this phone. You can use a PIN or skip for now.
          </Text>
        )}
        {!isSetup && quickAccessMode === 'biometric' && !fingerprintAvailable && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Fingerprint is unavailable. Use full sign-in to continue.
          </Text>
        )}
        {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      </Surface>

      {isSetup ? (
        <Pressable accessibilityRole="button" onPress={() => void skipQuickAccessSetup()} style={styles.footerButton}>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Not now</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void useFullSignIn()} style={styles.footerButton}>
          <Text style={[styles.footerLabel, { color: colors.mutedForeground }]}>Use full sign-in instead</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  brand: { alignItems: 'center', marginBottom: 24 },
  brandMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brandLetter: { fontFamily: 'Outfit_700Bold', fontSize: 23 },
  brandName: { fontFamily: 'Outfit_600SemiBold', fontSize: 15 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: 24 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 11, letterSpacing: 1.3, marginBottom: 8 },
  heading: { fontFamily: 'Outfit_600SemiBold', fontSize: 27, lineHeight: 33, marginBottom: 10 },
  copy: { fontFamily: 'DMSans_400Regular', fontSize: 15, lineHeight: 22, marginBottom: 22 },
  pinFields: { gap: 12 },
  input: { minHeight: 50, borderWidth: 1, paddingHorizontal: 14, fontFamily: 'DMSans_500Medium', fontSize: 17, letterSpacing: 3 },
  primaryButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  primaryLabel: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  biometricButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, marginTop: 12 },
  biometricLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 15 },
  hint: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 13 },
  error: { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 19, marginTop: 12 },
  disabled: { opacity: 0.6 },
  footerButton: { alignSelf: 'center', padding: 16, marginTop: 12 },
  footerLabel: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
});

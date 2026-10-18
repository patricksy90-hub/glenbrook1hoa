import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  useConfirmMobileTotpEnrollment,
  useSendMobileMfaEmailOtp,
  useStartMobileTotpEnrollment,
  useVerifyMobileMfa,
  MobileMfaVerifyInputMethod,
  MobileTotpEnrollmentResult,
} from '@workspace/api-client-react';
import { Image } from 'expo-image';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function MfaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loginState, mfaChallengeId, mfaMethods, mfaMaskedEmail, completeLogin, logout } = useAuth();
  
  const [method, setMethod] = useState<MobileMfaVerifyInputMethod>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [enrollmentSetup, setEnrollmentSetup] = useState<{ qrDataUrl: string; manualKey: string } | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<MobileTotpEnrollmentResult | null>(null);
  
  const sendOtpMut = useSendMobileMfaEmailOtp({ request: { noAuth: true } });
  const verifyMut = useVerifyMobileMfa({ request: { noAuth: true } });
  const startEnrollMut = useStartMobileTotpEnrollment({ request: { noAuth: true } });
  const confirmEnrollMut = useConfirmMobileTotpEnrollment({ request: { noAuth: true } });
  const isEnrollment = loginState === 'pending_enrollment';

  const handleSendEmail = async () => {
    if (!mfaChallengeId) return;
    setError('');
    try {
      await sendOtpMut.mutateAsync({ data: { challengeId: mfaChallengeId } });
      setMethod('email_otp');
    } catch (e: unknown) {
      const err = e as { error?: string };
      setError(err?.error || 'Failed to send email OTP');
    }
  };

  const handleVerify = async () => {
    if (!mfaChallengeId || !code) return;
    setError('');
    
    try {
      const res = await verifyMut.mutateAsync({
        data: { challengeId: mfaChallengeId, method, code }
      });
      await completeLogin(res.user, res.accessToken, res.refreshToken, res.accessTokenExpiresAt, res.refreshTokenExpiresAt);
    } catch (e: unknown) {
      const err = e as { error?: string };
      setError(err?.error || 'Invalid code');
    }
  };

  const handleBackToLogin = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  React.useEffect(() => {
    if (mfaMethods.length > 0 && !mfaMethods.includes('totp') && method === 'totp') {
      setMethod(mfaMethods[0] as MobileMfaVerifyInputMethod);
    }
  }, [mfaMethods]);

  React.useEffect(() => {
    if (!isEnrollment || !mfaChallengeId || enrollmentSetup || startEnrollMut.isPending) return;
    startEnrollMut.mutateAsync({ data: { challengeId: mfaChallengeId } })
      .then((setup) => setEnrollmentSetup(setup))
      .catch((e: unknown) => setError((e as { error?: string })?.error || 'Could not start two-factor setup'));
  }, [isEnrollment, mfaChallengeId, enrollmentSetup, startEnrollMut]);

  const handleConfirmEnrollment = async () => {
    if (!mfaChallengeId || code.length !== 6) return;
    setError('');
    try {
      const result = await confirmEnrollMut.mutateAsync({ data: { challengeId: mfaChallengeId, code } });
      setEnrollmentResult(result);
    } catch (e: unknown) {
      setError((e as { error?: string })?.error || 'Invalid code');
      setCode('');
    }
  };

  const handleFinishEnrollment = async () => {
    if (!enrollmentResult) return;
    await completeLogin(
      enrollmentResult.user,
      enrollmentResult.accessToken,
      enrollmentResult.refreshToken,
      enrollmentResult.accessTokenExpiresAt,
      enrollmentResult.refreshTokenExpiresAt,
    );
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 20,
        paddingHorizontal: 24,
      }}
      bottomOffset={40}
    >
      <Pressable onPress={handleBackToLogin} style={styles.backBtn} hitSlop={10}>
        <Feather name="arrow-left" size={24} color={colors.foreground} />
      </Pressable>

      <Text style={[styles.title, { color: colors.foreground }]}>
        {isEnrollment ? (enrollmentResult ? 'Save Backup Codes' : 'Set Up Two-Factor Auth') : 'Two-Factor Auth'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {isEnrollment
          ? (enrollmentResult ? 'Keep these one-time codes somewhere safe.' : 'Scan the QR code with your authenticator app to continue.')
          : 'Please verify your identity to continue.'}
      </Text>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      {isEnrollment ? (
        <View style={styles.form}>
          {enrollmentResult ? (
            <>
              <View style={[styles.codesBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {enrollmentResult.backupCodes.map((backupCode) => (
                  <Text key={backupCode} selectable style={[styles.codeText, { color: colors.foreground }]}>{backupCode}</Text>
                ))}
              </View>
              <Pressable style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]} onPress={handleFinishEnrollment}>
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>I Saved My Codes — Continue</Text>
              </Pressable>
            </>
          ) : enrollmentSetup ? (
            <>
              <Image source={{ uri: enrollmentSetup.qrDataUrl }} style={styles.qrCode} contentFit="contain" />
              <Text style={[styles.manualLabel, { color: colors.mutedForeground }]}>Manual setup key</Text>
              <Text selectable style={[styles.manualKey, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}>
                {enrollmentSetup.manualKey}
              </Text>
              <Text style={[styles.label, { color: colors.foreground }]}>Authenticator Code</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                placeholder="Enter 6-digit code"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                testID="enrollment-code"
              />
              <Pressable
                style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }, confirmEnrollMut.isPending && { opacity: 0.7 }]}
                onPress={handleConfirmEnrollment}
                disabled={confirmEnrollMut.isPending || code.length !== 6}
                testID="enrollment-confirm-button"
              >
                {confirmEnrollMut.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : (
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enable Two-Factor Auth</Text>
                )}
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : (
      <View style={styles.form}>
        <View style={styles.methodsRow}>
          {mfaMethods.includes('totp') && (
            <Pressable 
              style={[styles.methodBtn, { borderColor: method === 'totp' ? colors.primary : colors.border, borderRadius: colors.radius }]} 
              onPress={() => setMethod('totp')}
            >
              <Text style={[styles.methodText, { color: method === 'totp' ? colors.primary : colors.mutedForeground }]}>App</Text>
            </Pressable>
          )}
          {mfaMethods.includes('email_otp') && (
            <Pressable 
              style={[styles.methodBtn, { borderColor: method === 'email_otp' ? colors.primary : colors.border, borderRadius: colors.radius }]} 
              onPress={() => setMethod('email_otp')}
            >
              <Text style={[styles.methodText, { color: method === 'email_otp' ? colors.primary : colors.mutedForeground }]}>Email</Text>
            </Pressable>
          )}
          {mfaMethods.includes('backup_code') && (
            <Pressable 
              style={[styles.methodBtn, { borderColor: method === 'backup_code' ? colors.primary : colors.border, borderRadius: colors.radius }]} 
              onPress={() => setMethod('backup_code')}
            >
              <Text style={[styles.methodText, { color: method === 'backup_code' ? colors.primary : colors.mutedForeground }]}>Backup</Text>
            </Pressable>
          )}
        </View>

        {method === 'email_otp' && !sendOtpMut.isSuccess && (
          <Pressable 
            style={[styles.secondaryBtn, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
            onPress={handleSendEmail}
            disabled={sendOtpMut.isPending}
          >
            {sendOtpMut.isPending ? <ActivityIndicator color={colors.secondaryForeground} /> : <Text style={[styles.secondaryBtnText, { color: colors.secondaryForeground }]}>Send Code to {mfaMaskedEmail}</Text>}
          </Pressable>
        )}

        <Text style={[styles.label, { color: colors.foreground }]}>Verification Code</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
          placeholder="Enter 6-digit code"
          placeholderTextColor={colors.mutedForeground}
          keyboardType={method === 'backup_code' ? 'default' : 'number-pad'}
          autoCapitalize="none"
          value={code}
          onChangeText={setCode}
          testID="mfa-code"
        />

        <Pressable
          style={[
            styles.button, 
            { backgroundColor: colors.primary, borderRadius: colors.radius },
            verifyMut.isPending && { opacity: 0.7 }
          ]}
          onPress={handleVerify}
          disabled={verifyMut.isPending}
          testID="mfa-verify-button"
        >
          {verifyMut.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verify</Text>
          )}
        </Pressable>
      </View>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, marginBottom: 8 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, marginBottom: 32 },
  errorBox: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 24 },
  errorText: { fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center' },
  form: { gap: 16 },
  methodsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  methodBtn: { flex: 1, height: 40, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  methodText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  secondaryBtn: { height: 44, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: -8 },
  input: { height: 50, borderWidth: 1, paddingHorizontal: 16, fontFamily: 'DMSans_400Regular', fontSize: 16, letterSpacing: 2 },
  button: { height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  qrCode: { width: 220, height: 220, alignSelf: 'center' },
  manualLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, textAlign: 'center' },
  manualKey: { fontFamily: 'DMSans_500Medium', fontSize: 13, textAlign: 'center', padding: 12, borderWidth: 1, borderRadius: 8 },
  codesBox: { borderWidth: 1, borderRadius: 8, padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  codeText: { width: '46%', fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center' },
});

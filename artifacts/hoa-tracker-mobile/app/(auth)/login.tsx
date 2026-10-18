import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useMobileLogin } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { Feather } from '@expo/vector-icons';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { completeLogin, setPendingMfa, setPendingEnrollment } = useAuth();
  
  const loginMut = useMobileLogin({
    request: { noAuth: true }
  });

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setError('');
    
    try {
      const res = await loginMut.mutateAsync({
        data: { email, password }
      });
      
      if ('mfaRequired' in res && res.mfaRequired) {
        setPendingMfa(res.challengeId, res.methods, res.maskedEmail);
      } else if ('enrollmentRequired' in res && res.enrollmentRequired && 'challengeId' in res) {
        setPendingEnrollment(res.challengeId);
      } else if ('accessToken' in res) {
        await completeLogin(res.user, res.accessToken, res.refreshToken, res.accessTokenExpiresAt, res.refreshTokenExpiresAt);
      }
    } catch (e: unknown) {
      const err = e as { error?: string };
      setError(err?.error || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + 20,
        paddingHorizontal: 24,
      }}
      bottomOffset={40}
    >
      <View style={styles.header}>
        <Image 
          source={require('@/assets/images/icon.png')} 
          style={styles.logo} 
          contentFit="contain"
        />
        <Text style={[styles.title, { color: colors.foreground }]}>Glenbrook 1</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Homeowners' Association</Text>
      </View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.form}>
        <Text style={[styles.label, { color: colors.foreground }]}>Email Address</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
          placeholder="resident@example.com"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          testID="login-email"
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
        <View style={[styles.passwordContainer, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <TextInput
            style={[styles.passwordInput, { color: colors.foreground }]}
            placeholder="Enter password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            testID="login-password"
          />
          <Pressable 
            style={styles.eyeIcon} 
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={10}
          >
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.button, 
            { backgroundColor: colors.primary, borderRadius: colors.radius },
            loginMut.isPending && { opacity: 0.7 }
          ]}
          onPress={handleLogin}
          disabled={loginMut.isPending}
          testID="login-button"
        >
          {loginMut.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { width: 100, height: 100, marginBottom: 16 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, textAlign: 'center' },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center' },
  errorBox: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 24 },
  errorText: { fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center' },
  form: { gap: 16 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: -8 },
  input: { height: 50, borderWidth: 1, paddingHorizontal: 16, fontFamily: 'DMSans_400Regular', fontSize: 16 },
  passwordContainer: { height: 50, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 16, fontFamily: 'DMSans_400Regular', fontSize: 16 },
  eyeIcon: { padding: 10 },
  button: { height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  buttonText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});

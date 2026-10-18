import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import * as Linking from 'expo-linking';

export default function PortalHandoffScreen() {
  const colors = useColors();
  const { feature = 'This feature' } = useLocalSearchParams<{ feature: string }>();

  let portalUrl = '';
  if (process.env.EXPO_PUBLIC_WEB_PORTAL_URL && process.env.EXPO_PUBLIC_WEB_PORTAL_URL.startsWith('https://')) {
    portalUrl = process.env.EXPO_PUBLIC_WEB_PORTAL_URL;
  } else if (process.env.EXPO_PUBLIC_DOMAIN) {
    portalUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}/hoa-tracker/`;
  }

  const handleOpenPortal = () => {
    if (portalUrl) {
      Linking.openURL(portalUrl);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Feather name="monitor" size={64} color={colors.primary} style={{ marginBottom: 24 }} />
      <Text style={[styles.title, { color: colors.foreground }]}>Web Portal Required</Text>
      <Text style={[styles.desc, { color: colors.mutedForeground }]}>
        {feature} is best managed on a larger screen and requires the full web portal to complete correctly.
      </Text>
      
      {portalUrl ? (
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Please log in to the portal from your computer, or continue below.
        </Text>
      ) : (
        <Text style={[styles.sub, { color: colors.destructive }]}>
          Portal URL is currently unavailable.
        </Text>
      )}
      
      <View style={styles.btnContainer}>
        <Pressable
          style={[
            styles.btn, 
            { backgroundColor: portalUrl ? colors.primary : colors.muted, borderRadius: colors.radius, marginBottom: 12 }
          ]}
          onPress={handleOpenPortal}
          disabled={!portalUrl}
          testID="open-portal-btn"
        >
          <Text style={[styles.btnText, { color: portalUrl ? colors.primaryForeground : colors.mutedForeground }]}>
            {portalUrl ? 'Open Web Portal' : 'Portal Unavailable'}
          </Text>
        </Pressable>
        
        <Pressable
          style={[styles.btnSecondary, { borderColor: colors.border, borderRadius: colors.radius }]}
          onPress={() => router.back()}
          testID="go-back-btn"
        >
          <Text style={[styles.btnSecondaryText, { color: colors.foreground }]}>Go Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 24, marginBottom: 16, textAlign: 'center' },
  desc: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  sub: { fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 48 },
  btnContainer: { width: '100%', maxWidth: 300 },
  btn: { paddingHorizontal: 32, height: 50, justifyContent: 'center', alignItems: 'center' },
  btnText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  btnSecondary: { paddingHorizontal: 32, height: 50, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  btnSecondaryText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});

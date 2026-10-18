import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useGetMfaStatus } from '@workspace/api-client-react';
import { Surface } from '@/components/Surface';
import { LoadingState, ErrorState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { formatDate } from '@/lib/format';

export default function SecurityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  const { data, isLoading, error, refetch } = useGetMfaStatus();

  if (isLoading) return <LoadingState />;
  if (error && !data) return <ErrorState onRetry={refetch} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
      <Surface style={styles.card} elevated>
        <View style={styles.header}>
          <Feather name="shield" size={24} color={data?.totpEnabled ? colors.primary : colors.destructive} />
          <Text style={[styles.title, { color: colors.foreground }]}>Two-Factor Authentication</Text>
        </View>
        <Text style={[styles.desc, { color: colors.mutedForeground }]}>
          {data?.totpEnabled 
            ? `Active since ${formatDate(data.totpEnrolledAt)}` 
            : 'Not active. We highly recommend setting up MFA in the web portal to secure your account.'}
        </Text>
      </Surface>

      <Surface style={styles.card} elevated>
        <View style={styles.header}>
          <Feather name="key" size={24} color={colors.foreground} />
          <Text style={[styles.title, { color: colors.foreground }]}>Backup Codes</Text>
        </View>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{data?.backupCodesRemaining || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Remaining</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{data?.backupCodesTotal || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total</Text>
          </View>
        </View>
      </Surface>

      <View style={styles.noteBox}>
        <Feather name="info" size={20} color={colors.mutedForeground} />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          For security reasons, modifying MFA settings (like enabling an authenticator app or regenerating backup codes) is only available on the full web portal.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontFamily: 'Outfit_600SemiBold', fontSize: 18 },
  desc: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  stat: { alignItems: 'center' },
  statNum: { fontFamily: 'Outfit_700Bold', fontSize: 24 },
  statLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
  noteBox: { flexDirection: 'row', gap: 12, padding: 16 },
  note: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
});

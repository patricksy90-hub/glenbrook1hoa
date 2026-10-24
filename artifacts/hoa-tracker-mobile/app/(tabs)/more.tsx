import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Surface } from '@/components/Surface';
import { SecurityContactsCard } from '@/components/SecurityContactsCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useListMyRfid, useListFeedback, useListNotifications, useGetMfaStatus } from '@workspace/api-client-react';

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  
  const { data: rfidData, isLoading: rfidLoading } = useListMyRfid();
  const { data: feedbackData, isLoading: feedbackLoading } = useListFeedback();
  const { data: notifData, isLoading: notifLoading } = useListNotifications();
  const { data: mfaData, isLoading: mfaLoading } = useGetMfaStatus();

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm('Are you sure you want to sign out?')) {
        void logout();
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout }
    ]);
  };

  const isStaff = user?.role === 'admin' || user?.role === 'admin_support';
  const rfidNote = rfidLoading ? 'Loading...' : `${rfidData?.length || 0} tags`;
  const feedbackNote = feedbackLoading ? 'Loading...' : `${feedbackData?.filter(f => f.status !== 'closed' && f.status !== 'resolved').length || 0} open`;
  const notifNote = notifLoading ? 'Loading...' : `${notifData?.filter(n => !n.isRead).length || 0} unread`;
  const mfaNote = mfaLoading ? 'Loading...' : mfaData?.totpEnabled ? 'Enabled' : 'Not configured';

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
    >
      {(user?.role === 'owner' || user?.role === 'renter') && <SecurityContactsCard />}
      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>SETTINGS</Text>
        <Surface style={styles.card} elevated>
          <MenuRow testID="menu-household" icon="user" label="Household" note="Manage household members" onPress={() => router.push('/household' as Href)} />
          <MenuRow testID="menu-security" icon="shield" label="Security & MFA" note={mfaNote} onPress={() => router.push('/security')} />
          <MenuRow testID="menu-notifications" icon="bell" label="Notifications" note={notifNote} onPress={() => router.push('/notifications')} />
          <MenuRow testID="menu-visitors" icon="users" label="Visitors" note="View logged visitors" onPress={() => router.push('/(tabs)/community')} />
        </Surface>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>SERVICES</Text>
        <Surface style={styles.card} elevated>
          <MenuRow testID="menu-applications" icon="file-text" label="Applications" note="Submit and track requests" onPress={() => router.push('/applications' as Href)} />
          <MenuRow testID="menu-rfid" icon="key" label="Vehicle Stickers" note={rfidNote} onPress={() => router.push('/applications?kind=sticker' as Href)} />
          <MenuRow testID="menu-feedback" icon="message-square" label="Feedback" note={feedbackNote} onPress={() => router.push('/feedback')} />
        </Surface>
      </View>

      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>SYSTEM</Text>
        <Surface style={styles.card} elevated>
          {isStaff && (
            <MenuRow testID="menu-admin" icon="briefcase" label="Admin Portal" note="Full web access" isLink onPress={() => router.push('/portal-handoff?feature=Admin%20tools')} />
          )}
          <MenuRow testID="menu-portal" icon="globe" label="Full Web Portal" isLink onPress={() => router.push('/portal-handoff?feature=Full%20web%20portal')} />
        </Surface>
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout} testID="logout-btn">
        <Text style={[styles.logoutText, { color: colors.destructive }]}>Sign Out</Text>
      </Pressable>
      
      <Text style={[styles.version, { color: colors.mutedForeground }]}>v1.0.0</Text>
    </ScrollView>
  );
}

function MenuRow({ icon, label, note, isLink, onPress, testID }: { icon: React.ComponentProps<typeof Feather>['name'], label: string, note?: string, isLink?: boolean, onPress?: () => void, testID?: string }) {
  const colors = useColors();
  return (
    <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} testID={testID}>
      <Feather name={icon} size={20} color={colors.foreground} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {note && <Text style={[styles.rowNote, { color: colors.mutedForeground }]}>{note}</Text>}
      </View>
      <Feather name={isLink ? "external-link" : "chevron-right"} size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 24 },
  groupTitle: { fontFamily: 'DMSans_700Bold', fontSize: 12, letterSpacing: 1, marginBottom: 8, paddingHorizontal: 4 },
  card: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  rowContent: { flex: 1, marginLeft: 16 },
  rowLabel: { fontFamily: 'DMSans_500Medium', fontSize: 16 },
  rowNote: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  logoutBtn: { padding: 16, alignItems: 'center', marginTop: 16 },
  logoutText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  version: { fontFamily: 'DMSans_400Regular', fontSize: 12, textAlign: 'center', marginTop: 16 },
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import { residentIdAccess } from '@workspace/designation';
import { classicTabBarHeight } from '@/lib/tabBarLayout';
import { useColors } from '@/hooks/useColors';
import { useListMyDues, useListAnnouncements } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { Surface } from '@/components/Surface';
import { formatCurrency, formatDate, parseCurrencyAmount } from '@/lib/format';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingState, ErrorState } from '@/components/ScreenState';

export default function HomeScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const { data: dues, isLoading: duesLoading, error: duesError, refetch: refetchDues } = useListMyDues();
  const { data: announcements, isLoading: annLoading, error: annError, refetch: refetchAnn } = useListAnnouncements();
  
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchDues(), refetchAnn()]);
    setRefreshing(false);
  };

  const isLoading = duesLoading || annLoading;
  
  if (isLoading && !refreshing) return <LoadingState />;

  const unpaidDues = dues?.filter(d => d.status === 'pending' || d.status === 'overdue' || d.status === 'partial') || [];
  const amounts = unpaidDues.map((due) => parseCurrencyAmount(due.remainingAmount ?? due.amount));
  const balance = amounts.some((amount) => amount === null)
    ? null
    : amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  const latestAnnouncement = announcements?.[0];
  const isStaff = user?.role === 'admin' || user?.role === 'admin_support';

  return (
    <ScrollView 
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: classicTabBarHeight(Platform.OS, insets.bottom) + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={[styles.hero, { borderRadius: colors.radius + 8 }]} testID="home-hero">
        <Image source={require('@/assets/images/neighborhood-hero.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Tree-lined street in Glenbrook 1" />
        <View style={styles.scrim} />
        <Text style={styles.heroKicker}>Glenbrook 1</Text>
        <Text style={styles.greeting} testID="home-greeting">Hello, {user?.firstName}</Text>
      </View>

      {isStaff && (
        <Surface style={styles.staffBanner}>
          <Feather name="info" size={20} color={colors.primary} />
          <Text style={[styles.staffText, { color: colors.foreground }]}>Management tools are available in the web portal.</Text>
        </Surface>
      )}

      <Surface style={styles.balanceCard} elevated>
        <Text style={[styles.cardTitle, { color: colors.mutedForeground }]}>Current Balance</Text>
        <Text testID="home-balance" style={[styles.balanceAmount, { color: balance !== null && balance > 0 ? colors.destructive : colors.primary }]}>
          {duesError || balance === null ? '—' : formatCurrency(balance)}
        </Text>
        <Text style={[styles.balanceSubtitle, { color: duesError ? colors.destructive : colors.mutedForeground }]}>
          {duesError
            ? 'We could not load your dues.'
            : balance === null
              ? 'Some invoice amounts are unavailable. Pull to refresh.'
              : `${unpaidDues.length} unpaid invoice${unpaidDues.length === 1 ? '' : 's'}`}
        </Text>
        {duesError ? (
          <Pressable testID="home-dues-retry" onPress={() => refetchDues()} style={styles.readMore}>
            <Text style={[styles.readMoreText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        ) : null}
        <Pressable 
          testID="home-view-dues"
          style={[styles.btn, { backgroundColor: colors.primary, borderRadius: colors.radius, marginTop: 16 }]}
          onPress={() => router.push('/(tabs)/dues')}
        >
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>View Dues</Text>
        </Pressable>
      </Surface>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Latest Announcement</Text>
      {latestAnnouncement ? (
        <Surface style={styles.announcementCard} elevated>
          <Text style={[styles.annTitle, { color: colors.foreground }]} numberOfLines={1}>{latestAnnouncement.title}</Text>
          <Text style={[styles.annDate, { color: colors.mutedForeground }]}>{formatDate(latestAnnouncement.createdAt)}</Text>
          <Text style={[styles.annContent, { color: colors.foreground }]} numberOfLines={3}>{latestAnnouncement.content}</Text>
          <Pressable onPress={() => router.push('/(tabs)/community')} style={styles.readMore}>
            <Text style={[styles.readMoreText, { color: colors.primary }]}>Read more</Text>
          </Pressable>
        </Surface>
      ) : (
        <Surface style={styles.emptyCard}>
          <Text testID="home-announcement-empty" style={[styles.emptyText, { color: annError ? colors.destructive : colors.mutedForeground }]}>{annError ? 'Announcements could not be loaded.' : 'No announcements right now.'}</Text>
          {annError ? <Pressable testID="home-ann-retry" onPress={() => refetchAnn()} style={styles.readMore}><Text style={[styles.readMoreText, { color: colors.primary }]}>Try again</Text></Pressable> : null}
        </Surface>
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <ActionBtn testID="quick-action-gatebell" icon="shield" label="GateBell" onPress={() => router.push('/gatebell')} />
        <ActionBtn testID="quick-action-visitors" icon="users" label="Visitors" onPress={() => router.push('/(tabs)/community')} />
        <ActionBtn testID="quick-action-alerts" icon="bell" label="Alerts" onPress={() => router.push('/notifications')} />
        <ActionBtn testID="quick-action-feedback" icon="message-square" label="Feedback" onPress={() => router.push('/feedback')} />
        {residentIdAccess(user?.role) !== 'none' && (
          <ActionBtn testID="quick-action-id" icon="credit-card" label="ID Card" onPress={() => router.push('/(tabs)/id')} />
        )}
      </View>
    </ScrollView>
  );
}

function ActionBtn({ icon, label, onPress, testID }: { icon: React.ComponentProps<typeof Feather>['name'], label: string, onPress: () => void, testID?: string }) {
  const colors = useColors();
  return (
    <Pressable style={styles.actionBtn} onPress={onPress} testID={testID}>
      <Surface style={[styles.actionIcon, { borderRadius: colors.radius }]} elevated>
        <Feather name={icon} size={24} color={colors.primary} />
      </Surface>
      <Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 190, overflow: 'hidden', justifyContent: 'flex-end', padding: 18, marginBottom: 20 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,25,12,0.38)' },
  heroKicker: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: '#f2eee7' },
  greeting: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: '#ffffff' },
  staffBanner: { padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  staffText: { fontFamily: 'DMSans_400Regular', fontSize: 14, flex: 1 },
  balanceCard: { padding: 20, alignItems: 'center', marginBottom: 32 },
  cardTitle: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  balanceAmount: { fontFamily: 'Outfit_700Bold', fontSize: 36, marginVertical: 8 },
  balanceSubtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
  btn: { width: '100%', height: 44, justifyContent: 'center', alignItems: 'center' },
  btnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 16 },
  sectionTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 18, marginBottom: 12 },
  announcementCard: { padding: 16, marginBottom: 32 },
  annTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, marginBottom: 4 },
  annDate: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 12 },
  annContent: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  readMore: { marginTop: 12, alignSelf: 'flex-start' },
  readMoreText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  emptyCard: { padding: 24, alignItems: 'center', marginBottom: 32 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionBtn: { width: '20%', minWidth: 64, alignItems: 'center', gap: 8 },
  actionIcon: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, textAlign: 'center' }
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useListAnnouncements, useListVisitors, Announcement, Visitor } from '@workspace/api-client-react';
import { Surface } from '@/components/Surface';
import { formatDate } from '@/lib/format';
import { LoadingState, ErrorState, EmptyState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'announcements' | 'visitors'>('announcements');

  const { data: annData, isLoading: annLoading, refetch: annRefetch } = useListAnnouncements();
  const { data: visData, isLoading: visLoading, refetch: visRefetch } = useListVisitors();
  
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'announcements') await annRefetch();
    else await visRefetch();
    setRefreshing(false);
  };

  const isLoading = tab === 'announcements' ? annLoading : visLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.segmentContainer, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Pressable 
          style={[styles.segmentBtn, tab === 'announcements' && { backgroundColor: colors.secondary, borderRadius: colors.radius - 2 }]}
          onPress={() => setTab('announcements')}
        >
          <Text style={[styles.segmentText, { color: tab === 'announcements' ? colors.foreground : colors.mutedForeground }]}>Announcements</Text>
        </Pressable>
        <Pressable 
          style={[styles.segmentBtn, tab === 'visitors' && { backgroundColor: colors.secondary, borderRadius: colors.radius - 2 }]}
          onPress={() => setTab('visitors')}
        >
          <Text style={[styles.segmentText, { color: tab === 'visitors' ? colors.foreground : colors.mutedForeground }]}>Visitors</Text>
        </Pressable>
      </View>

      {isLoading && !refreshing ? <LoadingState /> : (
        <FlatList
          data={tab === 'announcements' ? (annData || []) : (visData || [])}
          keyExtractor={(item: Announcement | Visitor) => item.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState message={`No ${tab} found.`} />}
          renderItem={({ item }: { item: Announcement | Visitor }) => (
            'title' in item ? (
              <Surface style={styles.card} elevated>
                <View style={styles.annHeader}>
                  <Text style={[styles.annTitle, { color: colors.foreground, flex: 1 }]}>{item.title}</Text>
                  {item.priority === 'urgent' && <Feather name="alert-circle" size={16} color={colors.destructive} />}
                </View>
                <Text style={[styles.annDate, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
                <Text style={[styles.annContent, { color: colors.foreground }]}>{item.content}</Text>
              </Surface>
            ) : (
              <Surface style={styles.card} elevated>
                <View style={styles.visHeader}>
                  <Text style={[styles.visName, { color: colors.foreground }]}>{item.visitorName}</Text>
                  <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.badgeText, { color: colors.secondaryForeground }]}>{item.visitorType}</Text>
                  </View>
                </View>
                <Text style={[styles.visDetails, { color: colors.mutedForeground }]}>
                  In: {formatDate(item.checkIn)} {item.checkOut ? `• Out: ${formatDate(item.checkOut)}` : ''}
                </Text>
              </Surface>
            )
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentContainer: { flexDirection: 'row', margin: 16, padding: 4, borderWidth: 1 },
  segmentBtn: { flex: 1, height: 36, justifyContent: 'center', alignItems: 'center' },
  segmentText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  card: { padding: 16, marginBottom: 12 },
  annHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  annTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  annDate: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 12 },
  annContent: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  visHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  visName: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 0.5 },
  visDetails: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
});

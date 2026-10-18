import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, Notification } from '@workspace/api-client-react';
import { Surface } from '@/components/Surface';
import { formatDate } from '@/lib/format';
import { LoadingState, EmptyState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useListNotifications();
  const markReadMut = useMarkNotificationRead();
  const markAllMut = useMarkAllNotificationsRead();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markReadMut.mutateAsync({ id });
      await refetch();
    } catch (e) {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllMut.mutateAsync();
      await refetch();
    } catch (e) {}
  };

  const unreadCount = data?.filter((n: Notification) => !n.isRead).length || 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerText, { color: colors.foreground }]}>{unreadCount} Unread</Text>
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllRead}>
            <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>Mark All Read</Text>
          </Pressable>
        )}
      </View>
      {isLoading && !refreshing ? <LoadingState /> : (
        <FlatList
          data={data || []}
          keyExtractor={(i: Notification) => i.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState message="All caught up!" icon="check" />}
          renderItem={({ item }: { item: Notification }) => (
            <Surface style={[styles.card, !item.isRead && { borderColor: colors.primary, borderWidth: 1 }]} elevated={!item.isRead}>
              <View style={styles.cardHeader}>
                <Text style={[styles.title, { color: colors.foreground, flex: 1 }]}>{item.title}</Text>
                {!item.isRead && (
                  <Pressable onPress={() => handleMarkRead(item.id)} hitSlop={10}>
                    <Feather name="check-circle" size={20} color={colors.primary} />
                  </Pressable>
                )}
              </View>
              <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
              <Text style={[styles.msg, { color: colors.foreground }]}>{item.message}</Text>
            </Surface>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerText: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  card: { padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  date: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 8 },
  msg: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
});

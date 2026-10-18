import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useListFeedback, useCreateFeedback, FeedbackCategory, Feedback } from '@workspace/api-client-react';
import { Surface } from '@/components/Surface';
import { formatDate } from '@/lib/format';
import { LoadingState, EmptyState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useQueryClient } from '@tanstack/react-query';

export default function FeedbackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useListFeedback();
  const createMut = useCreateFeedback();

  const [category, setCategory] = useState<FeedbackCategory>('general_inquiry');
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleSubmit = async () => {
    if (!subject || !desc) return;
    try {
      await createMut.mutateAsync({
        data: {
          category,
          subject,
          description: desc,
          incidentDate: new Date().toISOString().split('T')[0],
        }
      });
      await refetch();
      setMode('list');
      setSubject('');
      setDesc('');
      setCategory('general_inquiry');
    } catch (e) {
      console.error(e);
    }
  };

  if (mode === 'create') {
    return (
      <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
        <Pressable onPress={() => setMode('list')} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.primary, fontFamily: 'DMSans_500Medium' }}>← Back to List</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>New Feedback</Text>
        
        <Text style={[styles.label, { color: colors.foreground }]}>Subject</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
          value={subject}
          onChangeText={setSubject}
          placeholder="What's this about?"
          placeholderTextColor={colors.mutedForeground}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
        <View style={styles.catRow}>
          {(['complaint', 'suggestion', 'compliment', 'general_inquiry'] as FeedbackCategory[]).map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catBtn, { backgroundColor: category === c ? colors.primary : colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <Text style={{ color: category === c ? colors.primaryForeground : colors.foreground, fontSize: 12 }}>{c.replace('_', ' ').toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
        <TextInput
          style={[styles.input, { height: 120, textAlignVertical: 'top', backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
          value={desc}
          onChangeText={setDesc}
          multiline
          placeholder="Details..."
          placeholderTextColor={colors.mutedForeground}
        />

        <Pressable
          style={[styles.btn, { backgroundColor: colors.primary, borderRadius: colors.radius }, createMut.isPending && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={createMut.isPending}
        >
          {createMut.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Submit Feedback</Text>}
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isLoading && !refreshing ? <LoadingState /> : (
        <FlatList
          data={data || []}
          keyExtractor={(i: Feedback) => i.id.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState message="No feedback submitted." />}
          renderItem={({ item }: { item: Feedback }) => (
            <Surface style={styles.card} elevated>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardSubject, { color: colors.foreground, flex: 1 }]}>{item.subject}</Text>
                <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.badgeText, { color: colors.secondaryForeground }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={[styles.date, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
              <Text style={[styles.desc, { color: colors.foreground }]}>{item.description}</Text>
            </Surface>
          )}
        />
      )}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.foreground }]}
        onPress={() => setMode('create')}
      >
        <Feather name="plus" size={24} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Outfit_700Bold', fontSize: 24, marginBottom: 24 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, padding: 12, fontFamily: 'DMSans_400Regular', fontSize: 16 },
  btn: { height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 32 },
  btnText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  card: { padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardSubject: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  date: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginBottom: 8 },
  desc: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
  fab: { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
});

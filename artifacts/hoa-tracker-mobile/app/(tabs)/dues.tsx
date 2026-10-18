import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable, AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useListMyDues, useListMyUpcomingDues, useGetPublicPaymentSettings, getListMyDuesQueryKey, getListMyUpcomingDuesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Surface } from '@/components/Surface';
import { formatDate } from '@/lib/format';
import { LoadingState, ErrorState, EmptyState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { DuesPaymentSheet, openCheckout, type PendingCheckout } from '@/components/DuesPaymentSheet';
import { centsToString, isEligible, isAdvanceEligible, remainingCents, toCents } from '@/lib/duesPayment';
import { classicTabBarHeight } from '@/lib/tabBarLayout';

type Filter = 'all' | 'pending' | 'paid' | 'overdue';

export default function DuesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  const { data, isLoading, error, refetch } = useListMyDues();
  const upcoming = useListMyUpcomingDues({ query: { queryKey: [...getListMyUpcomingDuesQueryKey(), userId], enabled: !!userId } });
  const settings = useGetPublicPaymentSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number[]>([]);
  const [selectedAdvance, setSelectedAdvance] = useState<string[]>([]);
  const [advanceExpanded, setAdvanceExpanded] = useState(false);
  const [cashPending, setCashPending] = useState<number[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const upcomingRef = useRef(upcoming.refetch);
  upcomingRef.current = upcoming.refetch;

  const payEnabled =
    settings.isSuccess &&
    settings.data?.paymongo_enabled === true &&
    Number.isFinite(settings.data.paymongo_convenience_fee) &&
    settings.data.paymongo_convenience_fee >= 0;
  const fee = payEnabled ? settings.data!.paymongo_convenience_fee : 0;

  // Clear account-specific state on account change.
  useEffect(() => {
    setSelected([]);
    setSelectedAdvance([]);
    setCashPending([]);
    setReviewing(false);
    setPending(null);
    setNotice(null);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      refetchRef.current();
      upcomingRef.current();
      return () => {
        setFocused(false);
        setReviewing(false);
      };
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { refetchRef.current(); upcomingRef.current(); }
    });
    return () => sub.remove();
  }, []);

  // Poll while checkout awaits confirmation.
  useEffect(() => {
    if (!pending || !focused) return;
    const t = setInterval(() => refetchRef.current(), 8000);
    return () => clearInterval(t);
  }, [pending, focused]);

  // Drop selections that stopped being eligible; detect server-side change for pending checkout.
  useEffect(() => {
    if (!data) return;
    const byId = new Map(data.map((d) => [d.id, d]));
    setSelected((s) => {
      const next = s.filter((id) => { const d = byId.get(id); return d && isEligible(d); });
      return next.length === s.length ? s : next;
    });
    if (pending) {
      const changed = pending.ids.some((id) => {
        const d = byId.get(id);
        return !d || !isEligible(d) || remainingCents(d) !== pending.baseline[id];
      });
      if (changed) {
        setPending(null);
        setNotice('Your dues were updated by the server. Check the statuses below.');
      }
    }
  }, [data, pending]);
  useEffect(() => {
    if (upcoming.data) setSelectedAdvance(old => {
      const next = old.filter(key => upcoming.data.some(p => p.periodKey === key && isAdvanceEligible(p)));
      return next.length === old.length ? old : next;
    });
  }, [upcoming.data]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refetch(), upcoming.refetch(), settings.refetch()]); }
    finally { setRefreshing(false); }
  };

  if (isLoading && !refreshing) return <LoadingState />;
  if (error && !data) return <ErrorState onRetry={refetch} />;

  const filteredData = (data || []).filter((item) => filter === 'all' || (filter === 'pending' ? isEligible(item) : item.status === filter));
  const selectedDues = error ? [] : (data || []).filter((d) => selected.includes(d.id) && isEligible(d) && !cashPending.includes(d.id) && !pending?.ids.includes(d.id));
  const advancePeriods = (upcoming.data || []).filter(isAdvanceEligible);
  const chosenAdvance = upcoming.isError ? [] : advancePeriods.filter(p => selectedAdvance.includes(p.periodKey));
  const selectionCount = selectedDues.length + chosenAdvance.length;
  const selTotal = selectedDues.reduce((s, d) => s + remainingCents(d), 0) + chosenAdvance.reduce((s, p) => s + toCents(p.amount), 0);
  const outstanding = (data || []).filter(isEligible).reduce((sum, d) => sum + remainingCents(d), 0);
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pendingIds = new Set(pending?.ids ?? []);

  const reopen = () => {
    if (!pending) return;
    openCheckout(pending.url).then((ok) => {
      if (!ok) setNotice('Could not open the checkout page. Tap Reopen checkout to try again.');
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: classicTabBarHeight(Platform.OS, insets.bottom) }}>
      <View style={[styles.filterScroll, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['all', 'pending', 'paid', 'overdue'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            testID={`dues-filter-${f}`}
            style={[styles.filterBtn, filter === f && { backgroundColor: colors.secondary, borderRadius: colors.radius }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: filter === f ? colors.foreground : colors.mutedForeground }]}>{f === 'pending' ? 'UNPAID' : f.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      {pending ? (
        <View style={[styles.banner, { backgroundColor: colors.secondary }]} testID="pay-awaiting">
          <Text style={[styles.bannerTitle, { color: colors.secondaryForeground }]}>Awaiting payment confirmation</Text>
          <Text style={[styles.bannerBody, { color: colors.secondaryForeground }]}>
            Your checkout is open with PayMongo. Dues stay unpaid here until the server confirms.
          </Text>
          <View style={styles.bannerRow}>
            <Pressable testID="pay-reopen" onPress={reopen} style={[styles.bannerBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
              <Text style={[styles.bannerBtnText, { color: colors.primaryForeground }]}>Reopen checkout</Text>
            </Pressable>
            <Pressable testID="pay-check-status" onPress={() => refetch()} style={[styles.bannerBtn, { borderColor: colors.primary, borderWidth: 1.5, borderRadius: colors.radius }]}>
              <Text style={[styles.bannerBtnText, { color: colors.primary }]}>Check status</Text>
            </Pressable>
            <Pressable testID="pay-dismiss-pending" onPress={() => setPending(null)} style={styles.bannerBtn}>
              <Text style={[styles.bannerBtnText, { color: colors.mutedForeground }]}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {error && <Pressable onPress={() => refetch()} style={[styles.banner, { backgroundColor: colors.muted }]}><Text style={{ color: colors.foreground }}>Dues could not be refreshed. Tap to retry before making a selection.</Text></Pressable>}
      {notice ? (
        <Pressable onPress={() => setNotice(null)} testID="pay-notice" style={[styles.banner, { backgroundColor: colors.muted }]}>
          <Text style={[styles.bannerBody, { color: colors.foreground }]}>{notice} (tap to dismiss)</Text>
        </Pressable>
      ) : null}
      {settings.isError ? (
        <Pressable onPress={() => settings.refetch()} testID="pay-settings-retry" style={[styles.banner, { backgroundColor: colors.muted }]}>
          <Text style={[styles.bannerBody, { color: colors.foreground }]}>Online payment status could not be loaded. Cash declarations remain available. Tap to retry.</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id.toString()}
        extraData={[selected, pending]}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={<View style={styles.summary}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.secondary }]}><Feather name="credit-card" size={22} color={colors.primary} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.date, { color: colors.mutedForeground }]}>Outstanding dues</Text><Text style={[styles.summaryTotal, { color: colors.foreground }]}>{error ? '—' : centsToString(outstanding)}</Text><Text style={[styles.date, { color: colors.mutedForeground }]}>Select periods, then choose cash or online.</Text></View>
        </View>}
        ListFooterComponent={<View style={[styles.advanceSection, { borderColor: colors.border }]}>
          <Pressable testID="advance-toggle" accessibilityRole="button" accessibilityState={{ expanded: advanceExpanded }} onPress={() => setAdvanceExpanded(v => !v)} style={styles.advanceHeading}>
            <View style={{ flex: 1 }}><Text style={[styles.period, { color: colors.foreground }]}>Plan ahead</Text><Text style={[styles.date, { color: colors.mutedForeground }]}>Advance periods · cash at HOA office</Text></View>
            <Feather name={advanceExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
          </Pressable>
          {advanceExpanded && (upcoming.isLoading ? <Text style={{ color: colors.mutedForeground }}>Loading available periods…</Text> : upcoming.isError ? <Pressable testID="advance-retry" onPress={() => upcoming.refetch()} style={styles.advanceHeading}><Text style={{ color: colors.destructive }}>Could not load advance periods. Tap to retry.</Text></Pressable> : !advancePeriods.length ? <Text style={[styles.date, { color: colors.mutedForeground }]}>No unbilled advance periods are available.</Text> : advancePeriods.map(p => {
            const checked = selectedAdvance.includes(p.periodKey);
            return <Pressable key={p.periodKey} testID={`advance-select-${p.periodKey}`} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelectedAdvance(s => s.includes(p.periodKey) ? s.filter(k => k !== p.periodKey) : [...s, p.periodKey])} style={[styles.advanceItem, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.secondary : colors.card, borderRadius: colors.radius }]}>
              <Feather name={checked ? 'check-square' : 'square'} size={20} color={colors.primary} />
              <Text style={[styles.date, { flex: 1, color: colors.foreground }]}>{p.period}</Text>
              <Text style={[styles.selectText, { color: colors.foreground }]}>{centsToString(toCents(p.amount))}</Text>
            </Pressable>;
          }))}
        </View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState message="No dues found." icon="check-circle" />}
        renderItem={({ item }) => {
          const eligible = !error && isEligible(item) && !pendingIds.has(item.id) && !cashPending.includes(item.id);
          const isSel = selected.includes(item.id);
          const hasRemaining = typeof item.remainingAmount === 'number' && Number.isFinite(item.remainingAmount);
          const shown = hasRemaining && item.status !== 'paid' ? item.remainingAmount! : item.amount;
          const partial = hasRemaining && item.status !== 'paid' && shown < item.amount;
          return (
            <Surface style={[styles.card, isSel && { borderColor: colors.primary, borderWidth: 2 }]} elevated>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.period, { color: colors.foreground }]}>{item.period}</Text>
                  {partial ? <Text style={[styles.date, { color: colors.mutedForeground }]}>{centsToString(toCents(item.amount))} total</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.amount, { color: colors.foreground }]} testID={`due-amount-${item.id}`}>{centsToString(toCents(shown))}</Text>
                  {partial ? <Text style={[styles.date, { color: colors.mutedForeground }]}>remaining</Text> : null}
                </View>
              </View>
              <View style={styles.details}>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>Due {formatDate(item.dueDate)}</Text>
                <View style={[styles.badge,
                  item.status === 'paid' ? { backgroundColor: colors.primary + '20' } :
                  item.status === 'overdue' ? { backgroundColor: colors.destructive + '20' } :
                  { backgroundColor: colors.accent }]}>
                  <Text style={[styles.badgeText,
                    item.status === 'paid' ? { color: colors.primary } :
                    item.status === 'overdue' ? { color: colors.destructive } :
                    { color: colors.accentForeground }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              {eligible ? (
                <Pressable
                  testID={`due-select-${item.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSel }}
                  onPress={() => toggle(item.id)}
                  style={[styles.selectBtn, { borderColor: colors.primary, borderRadius: colors.radius }, isSel && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.selectText, { color: isSel ? colors.primaryForeground : colors.primary }]}>{isSel ? 'Selected' : 'Select to pay'}</Text>
                </Pressable>
              ) : cashPending.includes(item.id) && isEligible(item) ? (
                <Text style={[styles.date, { color: colors.primary, marginTop: 10 }]} testID={`cash-pending-${item.id}`}>Cash declared · awaiting staff verification</Text>
              ) : pendingIds.has(item.id) ? (
                <Text style={[styles.date, { color: colors.mutedForeground, marginTop: 10 }]}>Checkout in progress</Text>
              ) : null}
            </Surface>
          );
        }}
      />

      {selectionCount > 0 ? (
        <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 120 }}>
            <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{selectionCount > 120 ? 'Choose no more than 120 periods' : `${selectionCount} selected · before online fees`}</Text>
            <Text style={[styles.barTotal, { color: colors.foreground }]} testID="dues-selected-total">{centsToString(selTotal)}</Text>
          </View>
          <Pressable testID="dues-review" disabled={selectionCount > 120} onPress={() => { setNotice(null); setReviewing(true); }} style={[styles.reviewBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: selectionCount > 120 ? 0.5 : 1 }]}>
            <Text style={[styles.bannerBtnText, { color: colors.primaryForeground }]}>Review and pay</Text>
          </Pressable>
        </View>
      ) : null}

      <DuesPaymentSheet
        visible={reviewing}
        dues={selectedDues}
          advances={chosenAdvance}
          onlineEnabled={payEnabled}
          sessionKey={userId}
        feePerPeriod={fee}
        onClose={() => setReviewing(false)}
        onCheckoutCreated={(p, opened) => {
          setReviewing(false);
          setSelected([]);
            setSelectedAdvance([]);
          setPending(p);
          if (!opened) setNotice('Checkout was created but could not be opened. Tap Reopen checkout.');
        }}
          onCashDeclared={(result) => {
            setReviewing(false);
            setSelected([]);
            setSelectedAdvance([]);
            setCashPending(old => [...new Set([...old, ...result.payments.map(p => p.duesId)])]);
            setNotice(result.payments.length ? result.message : 'No new cash declarations were recorded. Refresh your dues to check current eligibility.');
            void qc.invalidateQueries({ queryKey: getListMyDuesQueryKey() });
            void qc.invalidateQueries({ queryKey: getListMyUpcomingDuesQueryKey() });
          }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 24, marginTop: 4 },
  summaryIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryTotal: { fontFamily: 'Outfit_700Bold', fontSize: 30, marginVertical: 2 },
  advanceSection: { borderTopWidth: 1, paddingTop: 8, paddingBottom: 16, marginTop: 8 },
  advanceHeading: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 12 },
  advanceItem: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: 14, borderWidth: 1, marginBottom: 8 },
  filterScroll: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, gap: 4, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', minHeight: 44 },
  filterText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, letterSpacing: 0.5 },
  card: { padding: 16, marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  period: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  amount: { fontFamily: 'Outfit_700Bold', fontSize: 18 },
  details: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: 'DMSans_400Regular', fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontFamily: 'DMSans_700Bold', fontSize: 11, letterSpacing: 0.5 },
  selectBtn: { marginTop: 12, minHeight: 44, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  selectText: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  banner: { padding: 14, gap: 6 },
  bannerTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16 },
  bannerBody: { fontFamily: 'DMSans_500Medium', fontSize: 14, lineHeight: 20 },
  bannerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  bannerBtn: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  bannerBtnText: { fontFamily: 'DMSans_700Bold', fontSize: 15, textAlign: 'center' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1 },
  barLabel: { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  barTotal: { fontFamily: 'Outfit_700Bold', fontSize: 20 },
  reviewBtn: { minHeight: 48, flexGrow: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
});

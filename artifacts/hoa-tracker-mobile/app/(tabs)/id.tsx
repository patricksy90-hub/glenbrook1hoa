import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, AppState, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Redirect, useFocusEffect } from 'expo-router';
import { residentIdAccess, getResidentDesignation, RESIDENT_DESIGNATION_LABEL } from '@workspace/designation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCurrentUser,
  type AuthUser,
  getGetResidentIdCredentialQueryKey,
  useGetResidentIdCredential,
  useIssueResidentIdCredential,
} from '@workspace/api-client-react';
import { classicTabBarHeight } from '@/lib/tabBarLayout';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { buildIdNumber, fullName, getIdBadge, HOA_NAME, HOA_ADDRESS, RETURN_POLICY, VILLAGE_CODE, VILLAGE_NAME } from '@/lib/residentId';

const SIGS = {
  president: { name: 'Deo Alejo', title: 'President', src: require('@/assets/id-signatures/president.png') },
  vice: { name: 'Patrick Sy', title: 'Vice President', src: require('@/assets/id-signatures/vice-president.png') },
  secretary: { name: 'Lovhelyn Miniao', title: 'Secretary', src: require('@/assets/id-signatures/secretary.png') },
};
const NAVY = '#1a2472';
const TEAL = '#00838f';
const ORANGE = '#f57f17';
const PINK = '#c2185b';
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function Sig({ s }: { s: typeof SIGS.president }) {
  return (
    <View style={styles.sig} testID={`id-sig-${s.title.toLowerCase().replace(' ', '-')}`}>
      <Image source={s.src} style={styles.sigImg} contentFit="contain" accessibilityLabel={`${s.name} signature`} />
      <View style={styles.sigLine}>
        <Text style={styles.sigName}>{s.name}</Text>
        <Text style={styles.sigTitle}>{s.title}</Text>
      </View>
    </View>
  );
}

function Strip() {
  return (
    <View style={styles.strip}>
      <View style={[styles.band, { backgroundColor: TEAL, flex: 4 }]}><Text style={styles.bandText}>GL</Text></View>
      <View style={{ backgroundColor: ORANGE, flex: 0.8 }} />
      <View style={[styles.band, { backgroundColor: PINK, flex: 4 }]}><Text style={styles.bandText}>1</Text></View>
    </View>
  );
}

export default function IdScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [issueRetry, setIssueRetry] = useState(0);
  const issuedFor = useRef<number | null>(null);
  const userId = user?.id;
  const access = residentIdAccess(user?.role);
  const [fresh, setFresh] = useState<AuthUser | null>(null);
  const profileReq = useRef(0);

  const cred = useGetResidentIdCredential({
    query: {
      queryKey: [...getGetResidentIdCredentialQueryKey(), userId, user?.role],
      enabled: !!userId && access !== 'none',
      gcTime: 0,
      staleTime: 0,
      retry: 1,
      refetchOnMount: 'always',
      refetchInterval: focused && active ? 45000 : false,
    },
  });
  const issue = useIssueResidentIdCredential();
  const refetchRef = useRef(cred.refetch);
  refetchRef.current = cred.refetch;

  const confirm = useCallback(() => {
    setConfirmed(null);
    refetchRef.current().then((r) => setConfirmed(r.isError ? null : userId ?? null));
  }, [userId]);

  // account switch: drop any cached credential
  useEffect(() => {
    setConfirmed(null);
    setFresh(null);
    setSide('front');
    issuedFor.current = null;
  }, [userId, user?.role, qc]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      const req = ++profileReq.current;
      getCurrentUser()
        .then((u) => {
          if (profileReq.current === req) setFresh(u);
        })
        .catch(() => {});
      if (AppState.currentState === 'active') confirm();
      return () => {
        profileReq.current++;
        setFocused(false);
        setConfirmed(null);
      };
    }, [confirm]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const on = s === 'active';
      setActive(on);
      if (on) confirm();
      else setConfirmed(null);
    });
    return () => sub.remove();
  }, [confirm]);

  const data = cred.data;
  const status = data?.status;
  // issue only when never issued; never replace revoked
  useEffect(() => {
    if (status === 'not_issued' && userId && issuedFor.current !== userId && !issue.isPending) {
      issuedFor.current = userId;
      issue.mutate(undefined, {
        onSuccess: (res) => {
          qc.setQueryData([...getGetResidentIdCredentialQueryKey(), userId, user?.role], res);
          confirm();
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId, issueRetry]);

  if (!user) return null;
  if (access === 'none') return <Redirect href="/(tabs)" />;
  if (cred.isError) return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.background }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Outfit_600SemiBold', fontSize: 18 }}>Could not confirm access to your Resident ID.</Text>
      <Pressable onPress={confirm} style={{ paddingVertical: 16, minHeight: 44 }} testID="id-retry" accessibilityRole="button">
        <Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold', fontSize: 16 }}>Retry</Text>
      </Pressable>
    </View>
  );

  const profile = fresh?.id === user.id ? fresh : user;
  const photo = profile.photo ?? null;
  const badge = getIdBadge(profile);
  const idNumber = buildIdNumber(profile.id, profile.role, profile.createdAt);
  const memberYear = user.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear();
  const blockLot = user.blockNumber && user.lotNumber ? `Block ${user.blockNumber} · Lot ${user.lotNumber}` : '—';
  const address =
    user.blockNumber && user.lotNumber
      ? `Block ${user.blockNumber}, Lot ${user.lotNumber}${user.streetName ? ', ' + user.streetName : ''}, Brgy. Pasong Camachile 1, General Trias, Cavite City`
      : `${VILLAGE_NAME}, Brgy. Pasong Camachile 1, General Trias, Cavite City`;

  const busy = cred.isLoading || cred.isFetching || issue.isPending;
  const canViewBack = residentIdAccess(profile.role) === 'both' && data?.access === 'both' && !cred.isError;
  const qrOk = !!data?.qrDataUrl && PNG.test(data.qrDataUrl);
  const showQr = canViewBack && status === 'active' && qrOk && confirmed === userId && !busy && focused && active;

  let qrBody: React.ReactNode;
  if (showQr) {
    qrBody = <Image source={{ uri: data!.qrDataUrl }} style={styles.qrImg} contentFit="contain" testID="id-qr-image" accessibilityLabel="Resident ID verification QR" />;
  } else if (cred.isError || issue.isError) {
    qrBody = (
      <Pressable onPress={() => {
        issue.reset();
        issuedFor.current = null;
        setIssueRetry(n => n + 1);
        confirm();
      }} testID="id-retry" style={styles.qrMsg}>
        <Text style={styles.qrMsgText}>Could not confirm your ID. Tap to retry.</Text>
      </Pressable>
    );
  } else if (status === 'revoked' || status === 'ineligible' || (status === 'active' && !qrOk && !busy)) {
    qrBody = (
      <View style={styles.qrMsg} testID="id-invalid">
        <Text style={[styles.qrMsgText, { color: colors.destructive }]}>
          {status === 'revoked'
            ? 'This ID has been revoked. Contact the HOA office.'
            : status === 'ineligible'
              ? 'Your account is not eligible for a Resident ID.'
              : 'QR unavailable. Tap refresh.'}
        </Text>
      </View>
    );
  } else {
    qrBody = (
      <View style={styles.qrMsg} testID="id-loading">
        <ActivityIndicator color={NAVY} />
        <Text style={styles.qrMsgText}>Verifying ID</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: classicTabBarHeight(Platform.OS, insets.bottom) + 24, alignItems: 'center' }}
      testID="id-screen"
    >
      <View style={styles.intro} testID="id-intro">
        <Text style={[styles.introTitle, { color: colors.foreground }]}>Resident ID</Text>
        <Text style={[styles.introSub, { color: colors.mutedForeground }]}>Your Glenbrook 1 membership card</Text>
      </View>
      {canViewBack && <View style={[styles.toggle, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
        {(['front', 'back'] as const).map((s) => (
          <Pressable
            key={s}
            testID={`id-tab-${s}`}
            accessibilityRole="button"
            accessibilityState={{ selected: side === s }}
            onPress={() => setSide(s)}
            style={[styles.toggleBtn, side === s && { backgroundColor: colors.primary, borderRadius: colors.radius - 3 }]}
          >
            <Text style={[styles.toggleText, { color: side === s ? colors.primaryForeground : colors.mutedForeground }]}>
              {s === 'front' ? 'Front' : 'Back'}
            </Text>
          </Pressable>
        ))}
      </View>}

      {side === 'front' || !canViewBack ? (
        <View style={styles.card} testID="id-front">
          <Text style={styles.bar}>{HOA_NAME} · Resident ID</Text>
          <View style={styles.row}>
            <Strip />
            <View style={styles.front}>
              {photo ? (
                <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.photo} contentFit="contain" testID="id-photo" />
              ) : (
                <View style={[styles.photo, styles.noPhoto]} testID="id-no-photo"><Text style={styles.noPhotoText}>NO PHOTO</Text></View>
              )}
              <Text style={styles.lbl}>Resident Name</Text>
              <Text style={styles.name} testID="id-name">{fullName(user)}</Text>
              <Text style={styles.blockLot}>{blockLot}</Text>
              <Text style={[styles.lbl, { marginTop: 12 }]}>Designation / Role</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]} testID="id-badge">
                <Text style={styles.badgeText}>{badge.label.toUpperCase()}</Text>
              </View>
              {profile.designation && ['owner', 'renter'].includes(profile.role) && (
                <Text style={{ fontSize: 12, color: colors.text }}>{RESIDENT_DESIGNATION_LABEL[getResidentDesignation(profile)]}</Text>
              )}
              <Text style={[styles.lbl, { marginTop: 12 }]}>System Tracking Number</Text>
              <Text style={styles.mono} testID="id-number">{idNumber}</Text>
            </View>
          </View>
          <Text style={[styles.bar, { fontSize: 12 }]}>{HOA_NAME} · {VILLAGE_CODE}</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: '#f5f6fa' }]} testID="id-back">
          <View style={styles.row}>
            <View style={styles.back}>
              <Text style={styles.hoa}>{HOA_NAME}</Text>
              <Text style={styles.sub}>{HOA_ADDRESS}</Text>
              <View style={styles.divider} />
              <Text style={styles.secTitle}>Property Address Verification:</Text>
              <Text style={styles.secBody} testID="id-address">{address}</Text>
              <Text style={styles.secTitle}>Return Policy Note:</Text>
              <Text style={styles.secBody}>{RETURN_POLICY}</Text>
              <View style={styles.qrBox} testID="id-qr-box">{qrBody}</View>
              {showQr || busy ? null : (
                <Pressable onPress={confirm} testID="id-refresh" style={styles.refresh}><Text style={styles.refreshText}>Refresh</Text></Pressable>
              )}
              <View style={styles.sigRow}>
                <Sig s={SIGS.president} />
                <Sig s={SIGS.vice} />
              </View>
              <View style={{ alignItems: 'center', marginTop: 12 }}>
                <Sig s={SIGS.secretary} />
              </View>
            </View>
            <Strip />
          </View>
          <View style={styles.backFoot}>
            <View>
              <Text style={styles.lbl}>ID Number</Text>
              <Text style={styles.mono}>{idNumber}</Text>
            </View>
            <Text style={styles.since}>Member{'\n'}since {memberYear}</Text>
          </View>
        </View>
      )}
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        {canViewBack
          ? 'The verification QR is hidden whenever the app is in the background or being re-verified.'
          : 'Only the front of your ID is available here. Authorised HOA staff handle back-side viewing and printing.'}
      </Text>
      {status === 'revoked' || status === 'ineligible' ? (
        <Text style={[styles.note, { color: colors.destructive }]} testID="id-status">
          This ID is {status}. Contact the HOA office.
        </Text>
      ) : null}
      {issue.isError && (
        <Pressable onPress={() => {
          issue.reset();
          issuedFor.current = null;
          setIssueRetry(n => n + 1);
          confirm();
        }} style={{ paddingVertical: 16 }} testID="id-issue-retry">
          <Text style={{ color: colors.destructive }}>Could not prepare your ID credential. Tap to retry.</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { width: '100%', maxWidth: 420, marginBottom: 14 },
  introTitle: { fontFamily: 'Outfit_700Bold', fontSize: 26 },
  introSub: { fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 2 },
  toggle: { flexDirection: 'row', padding: 3, marginBottom: 16, width: '100%', maxWidth: 420 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  toggleText: { fontFamily: 'DMSans_700Bold', fontSize: 15 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#d9dbe6' },
  bar: { backgroundColor: NAVY, color: '#fff', textAlign: 'center', fontFamily: 'Outfit_700Bold', fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase', paddingVertical: 12, paddingHorizontal: 8 },
  row: { flexDirection: 'row' },
  strip: { width: 30 },
  band: { alignItems: 'center', justifyContent: 'center' },
  bandText: { color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: 16 },
  front: { flex: 1, padding: 16 },
  photo: { width: '100%', aspectRatio: 1, maxHeight: 220, backgroundColor: '#eceff1', borderRadius: 8, marginBottom: 14 },
  noPhoto: { backgroundColor: '#cfd8dc', alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { color: '#546e7a', fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 1 },
  lbl: { color: '#6b6f80', fontFamily: 'DMSans_600SemiBold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { color: '#111', fontFamily: 'Outfit_700Bold', fontSize: 22, lineHeight: 28, marginTop: 2 },
  blockLot: { color: '#333', fontFamily: 'DMSans_600SemiBold', fontSize: 15, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginTop: 4 },
  badgeText: { color: '#fff', fontFamily: 'DMSans_700Bold', fontSize: 14, letterSpacing: 1 },
  mono: { color: '#222', fontFamily: 'DMSans_700Bold', fontSize: 15, letterSpacing: 0.5, marginTop: 2 },
  back: { flex: 1, padding: 16, alignItems: 'stretch' },
  hoa: { color: NAVY, fontFamily: 'Outfit_700Bold', fontSize: 20, textAlign: 'center' },
  sub: { color: '#555', fontFamily: 'DMSans_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  divider: { height: 2, backgroundColor: NAVY, width: '80%', alignSelf: 'center', marginVertical: 12 },
  secTitle: { color: '#111', fontFamily: 'DMSans_700Bold', fontSize: 14, marginTop: 6 },
  secBody: { color: '#333', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  qrBox: { alignSelf: 'center', backgroundColor: '#fff', padding: 16, width: 220, height: 220, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  qrImg: { width: 188, height: 188 },
  qrMsg: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 4 },
  qrMsgText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, textAlign: 'center', color: '#333', lineHeight: 19 },
  refresh: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
  refreshText: { color: NAVY, fontFamily: 'DMSans_700Bold', fontSize: 15 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 14 },
  sig: { width: 118, maxWidth: '48%', flexShrink: 1, alignItems: 'center' },
  sigImg: { height: 42, width: '100%' },
  sigLine: { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 3, width: '100%', alignItems: 'center' },
  sigName: { color: '#111', fontFamily: 'DMSans_700Bold', fontSize: 13, textAlign: 'center' },
  sigTitle: { color: '#555', fontFamily: 'DMSans_400Regular', fontSize: 12, textAlign: 'center' },
  backFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd', padding: 14 },
  since: { color: '#666', fontFamily: 'DMSans_400Regular', fontSize: 13, textAlign: 'right' },
  note: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 16, maxWidth: 420 },
});

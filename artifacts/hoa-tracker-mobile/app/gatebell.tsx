import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetGateBellStateQueryKey,
  getGetGateBellMessagesQueryKey,
  getSearchGateBellUnitsQueryKey,
  useGetGateBellState,
  useSearchGateBellUnits,
  useSelectGateBellContext,
  useHandoverGateBellShift,
  useCreateGateBellCall,
  useDecideGateBellCall,
  useGetGateBellMessages,
  useAddGateBellMessage,
  useCreateGateBellEmergency,
  useUpdateGateBellEmergency,
  useCreateGateBellEmergencyRequest,
  useDispatchGateBellEmergencyRequest,
  registerGateBellDevice,
  unregisterGateBellDevice,
  requestGateBellCallPhotoUploadUrl,
  attachGateBellCallPhoto,
  getGetGateBellCallPhotoUrl,
  type GateBellCall,
  type GateBellUnit,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { Surface } from '@/components/Surface';
import { SecurityContactsCard } from '@/components/SecurityContactsCard';
import { LoadingState, ErrorState } from '@/components/ScreenState';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { getAccessToken } from '@/lib/mobileTokens';

const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const unitName = (unit: Pick<GateBellUnit, 'blockNumber' | 'lotNumber'>) =>
  `Block ${unit.blockNumber} · Lot ${unit.lotNumber}`;

function GateBellPhoto({ callId }: { callId: number }) {
  const colors = useColors();
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getAccessToken().then((value) => {
      if (active) setToken(value);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, []);

  if (!token && !failed) return <ActivityIndicator color={colors.primary} />;
  if (failed || !token) return <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Photo could not be loaded.</Text>;
  return (
    <Image
      accessibilityLabel="Private visitor photo"
      onError={() => setFailed(true)}
      resizeMode="cover"
      source={{
        uri: getGetGateBellCallPhotoUrl(callId),
        headers: { Authorization: `Bearer ${token}` },
      }}
      style={{ width: 220, height: 160, borderRadius: 12, marginTop: 10, backgroundColor: colors.secondary }}
    />
  );
}

const statusLabel: Record<string, string> = {
  pending: 'Awaiting response',
  let_in: 'Admitted',
  denied: 'Entry denied',
  no_answer: 'No response',
  dispatched: 'Dispatched',
  en_route: 'En route',
  resolved: 'Resolved',
};

export default function GateBellScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const role = user?.role;
  const isAdmin = role === 'admin' || role === 'admin_support';
  const isGuard = role === 'security_guard';
  const isResident = role === 'owner' || role === 'renter';
  const [search, setSearch] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<GateBellUnit | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorType, setVisitorType] = useState('delivery');
  const [gateId, setGateId] = useState<number | null>(null);
  const [rosterEntryId, setRosterEntryId] = useState<number | null>(null);
  const [handoverRosterId, setHandoverRosterId] = useState<number | null>(null);
  const [emergencyUnitId, setEmergencyUnitId] = useState<number | null>(null);
  const [alertType, setAlertType] = useState('Medical assistance');
  const [openMessagesFor, setOpenMessagesFor] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [errorText, setErrorText] = useState('');
  const [working, setWorking] = useState(false);
  const [pushPermissionGranted, setPushPermissionGranted] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState('');
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const [residentAlertType, setResidentAlertType] = useState<'Medical assistance' | 'Safety concern' | 'Other'>('Medical assistance');

  useEffect(() => {
    if ((!isResident && !isGuard) || Platform.OS !== 'android') return;
    let active = true;
    void Notifications.getPermissionsAsync().then((permission) => {
      if (active) setPushPermissionGranted(permission.granted);
    }).catch(() => {
      if (active) setPushPermissionGranted(false);
    });
    return () => { active = false; };
  }, [isResident, isGuard]);

  const stateQuery = useGetGateBellState({
    query: {
      queryKey: getGetGateBellStateQueryKey(),
      enabled: isAdmin || isGuard || isResident,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  });
  const state = stateQuery.data;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: getGetGateBellStateQueryKey() });
    });
    return () => subscription.remove();
  }, [queryClient]);
  const normalizedSearch = search.trim();
  const searchQuery = useSearchGateBellUnits(
    { search: normalizedSearch || undefined },
    {
      query: {
        queryKey: getSearchGateBellUnitsQueryKey({ search: normalizedSearch || undefined }),
        enabled: isGuard && normalizedSearch.length >= 2,
      },
    },
  );
  const messagesQuery = useGetGateBellMessages(openMessagesFor ?? 0, {
    query: {
      queryKey: getGetGateBellMessagesQueryKey(openMessagesFor ?? 0),
      enabled: openMessagesFor !== null,
    },
  });
  const selectContext = useSelectGateBellContext();
  const handover = useHandoverGateBellShift();
  const createCall = useCreateGateBellCall();
  const decideCall = useDecideGateBellCall();
  const addMessage = useAddGateBellMessage({
    mutation: {
      onSuccess: (_message, variables) => {
        void queryClient.invalidateQueries({ queryKey: getGetGateBellMessagesQueryKey(variables.callId) });
      },
    },
  });
  const createEmergency = useCreateGateBellEmergency();
  const updateEmergency = useUpdateGateBellEmergency();
  const createEmergencyRequest = useCreateGateBellEmergencyRequest();
  const dispatchEmergencyRequest = useDispatchGateBellEmergencyRequest();

  const refreshState = () => queryClient.invalidateQueries({ queryKey: getGetGateBellStateQueryKey() });
  const calls = state?.calls ?? [];
  const pendingCalls = useMemo(() => calls.filter(call => call.status === 'pending'), [calls]);
  const units = searchQuery.data?.units ?? [];
  const emergencyOpen = (state?.emergencies ?? []).filter(item => item.status !== 'resolved');
  const currentGate = state?.gates.find(gate => gate.id === state.context?.gateId);
  const mutationBusy = working || selectContext.isPending || handover.isPending || createCall.isPending
    || decideCall.isPending || addMessage.isPending || createEmergency.isPending || updateEmergency.isPending
    || createEmergencyRequest.isPending || dispatchEmergencyRequest.isPending;

  const enableBackgroundAlerts = async () => {
    setPushBusy(true);
    setPushFeedback('');
    try {
      const currentPermission = await Notifications.getPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await Notifications.requestPermissionsAsync();
      setPushPermissionGranted(permission.granted);
      if (!permission.granted) {
        await unregisterGateBellDevice();
        await refreshState();
        setPushFeedback(
          permission.canAskAgain
            ? 'Notifications are off. You can enable them later from this screen.'
            : 'Notifications are blocked. Open Android settings to allow GateBell alerts.',
        );
        return;
      }
      if (!state?.pushAvailable) {
        setPushFeedback('Firebase setup is still needed for background alerts. You can respond while GateBell is open.');
        return;
      }
      const token = await Notifications.getDevicePushTokenAsync();
      if (typeof token.data !== 'string' || token.data.length < 20) {
        throw new Error('Android did not return a valid notification token.');
      }
      await registerGateBellDevice({ token: token.data, permission: 'granted' });
      await refreshState();
      setPushFeedback('Background GateBell alerts are enabled on this device.');
    } catch {
      setPushFeedback('Could not register this device for alerts. Confirm Firebase is configured and try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const disableBackgroundAlerts = async () => {
    setPushBusy(true);
    setPushFeedback('');
    try {
      await unregisterGateBellDevice();
      await refreshState();
      setPushFeedback('GateBell alerts are turned off on this device.');
    } catch {
      setPushFeedback('Could not turn off GateBell alerts right now. Check your connection and retry.');
    } finally {
      setPushBusy(false);
    }
  };

  const perform = async (action: () => Promise<unknown>, success: string, after?: () => void) => {
    setErrorText('');
    setNotice('');
    setWorking(true);
    try {
      await action();
      await refreshState();
      after?.();
      setNotice(success);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'The action could not be completed. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const onRefresh = async () => {
    setErrorText('');
    await stateQuery.refetch();
  };

  const captureAndUploadPhoto = async (call: GateBellCall) => {
    setErrorText('');
    setNotice('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorText(permission.canAskAgain
          ? 'Camera access is needed to take the requested visitor photo.'
          : 'Camera access is blocked. Allow it in Android settings to take a visitor photo.');
        if (!permission.canAskAgain) await Linking.openSettings().catch(() => undefined);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.72,
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || (asset.mimeType && asset.mimeType !== 'image/jpeg')) {
        setErrorText('Please take a JPEG photo with the camera.');
        return;
      }
      const file = new File(asset.uri);
      const size = asset.fileSize ?? file.size;
      if (!size || size > 5 * 1024 * 1024) {
        setErrorText('The photo must be under 5 MB.');
        return;
      }

      setWorking(true);
      const upload = await requestGateBellCallPhotoUploadUrl(call.id, { contentType: 'image/jpeg', size });
      const uploaded = await expoFetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: file,
      });
      if (!uploaded.ok) throw new Error('The photo could not be uploaded.');
      await attachGateBellCallPhoto(call.id, { objectPath: upload.objectPath });
      await refreshState();
      await queryClient.invalidateQueries({ queryKey: getGetGateBellMessagesQueryKey(call.id) });
      setNotice('Visitor photo sent to the designated GateBell contacts.');
    } catch (cause) {
      setErrorText(cause instanceof Error ? cause.message : 'The visitor photo could not be sent. Try again.');
    } finally {
      setWorking(false);
    }
  };

  if (!isAdmin && !isGuard && !isResident) {
    return <View style={[styles.accessDenied, { backgroundColor: colors.background }]}><Feather name="lock" size={24} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>GateBell access is not available for this account.</Text></View>;
  }
  if (stateQuery.isLoading || stateQuery.isError || !state) return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      {isResident && <SecurityContactsCard />}
      {stateQuery.isLoading ? <LoadingState /> : <ErrorState onRetry={() => { void stateQuery.refetch(); }} />}
    </View>
  );

  const renderCall = (call: GateBellCall) => (
    <Surface key={call.id} style={[styles.callCard, { borderColor: call.status === 'pending' ? '#d99245' : colors.border }]} elevated>
      <View style={styles.rowBetween}>
        <View style={styles.callHeading}>
          <View style={[styles.callIcon, { backgroundColor: call.status === 'pending' ? '#fbefdc' : colors.secondary }]}>
            <Feather name="bell" size={17} color={call.status === 'pending' ? '#a56521' : colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.callVisitor, { color: colors.foreground }]}>{call.visitorName}</Text>
            <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{call.visitorType} · Block {call.blockNumber}, Lot {call.lotNumber}</Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: call.status === 'pending' ? '#fbefdc' : colors.secondary }]}>
          <Text style={[styles.statusText, { color: call.status === 'pending' ? '#865516' : colors.foreground }]}>{statusLabel[call.status] ?? call.status}</Text>
        </View>
      </View>
      <View style={[styles.callMeta, { borderTopColor: colors.border }]}>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>At {call.gateName} · {call.guardName}</Text>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Rang {formatTime(call.createdAt)}</Text>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Server deadline {formatTime(call.deadlineAt)}</Text>
      </View>
      {call.pushStatus === 'not_configured' && <Text style={[styles.pushNote, { color: '#926727' }]}>Push notifications are not configured for this request.</Text>}
      {!!call.photoUrl && <GateBellPhoto callId={call.id} />}
      {call.decidedByName && <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 7 }]}>Decision recorded by {call.decidedByName}.</Text>}
      {isResident && call.status === 'pending' && (
        <View style={styles.decisionRow}>
          <ActionButton title="Let in" icon="check" colors={colors} disabled={mutationBusy} onPress={() => void perform(
            () => decideCall.mutateAsync({ callId: call.id, data: { decision: 'let_in' } }),
            'Visitor admitted.',
          )} />
          <ActionButton title="Deny" icon="x" colors={colors} secondary destructive disabled={mutationBusy} onPress={() => void perform(
            () => decideCall.mutateAsync({ callId: call.id, data: { decision: 'denied' } }),
            'Entry denied.',
          )} />
        </View>
      )}
      {isResident && call.status === 'pending' && (
        <View style={styles.responseActions}>
          {!call.photoUrl && <SmallAction title="Request photo" colors={colors} disabled={mutationBusy} onPress={() => void perform(
            () => addMessage.mutateAsync({ callId: call.id, data: { kind: 'request_photo' } }),
            'Photo request sent.',
          )} />}
          <SmallAction title="Coming to gate" colors={colors} disabled={mutationBusy} onPress={() => void perform(
            () => addMessage.mutateAsync({ callId: call.id, data: { kind: 'coming_to_gate' } }),
            'Coming-to-gate message sent.',
          )} />
          <SmallAction title="Add a note" colors={colors} disabled={mutationBusy} onPress={() => { setOpenMessagesFor(call.id); setNote(''); }} />
        </View>
      )}
      {(isResident || isGuard) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View messages for ${call.visitorName}`}
          onPress={() => setOpenMessagesFor(openMessagesFor === call.id ? null : call.id)}
          style={styles.messagesToggle}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>{openMessagesFor === call.id ? 'Hide messages' : 'View audited messages'}</Text>
          <Feather name={openMessagesFor === call.id ? 'chevron-up' : 'chevron-down'} size={15} color={colors.primary} />
        </Pressable>
      )}
      {openMessagesFor === call.id && (
        <View style={[styles.messagesBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {messagesQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : messagesQuery.isError
            ? <Text style={[styles.smallText, { color: colors.destructive }]}>Messages could not be loaded. Pull to refresh and try again.</Text>
            : (messagesQuery.data?.messages ?? []).length === 0
              ? <Text style={[styles.smallText, { color: colors.mutedForeground }]}>No messages recorded yet.</Text>
              : messagesQuery.data?.messages.map(message => (
                <View key={message.id} style={[styles.messageItem, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowBetween}><Text style={[styles.messageName, { color: colors.foreground }]}>{message.name}</Text><Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatTime(message.createdAt)}</Text></View>
                  <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 4 }]}>{message.kind === 'request_photo' ? 'Requested a visitor photo' : message.kind === 'coming_to_gate' ? 'Resident is coming to the gate' : message.note}</Text>
                </View>
              ))}
          {isResident && noteCallId(openMessagesFor, call.id) && (
            <View style={styles.noteComposer}>
              <TextInput
                accessibilityLabel="Write a note to the guard"
                value={note}
                onChangeText={setNote}
                placeholder="Write a short note"
                placeholderTextColor={colors.mutedForeground}
                maxLength={500}
                multiline
                style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              />
              <ActionButton title={addMessage.isPending ? 'Sending…' : 'Send note'} icon="send" colors={colors} disabled={!note.trim() || mutationBusy} onPress={() => void perform(
                () => addMessage.mutateAsync({ callId: call.id, data: { kind: 'note', note: note.trim() } }),
                'Note sent to the gate.',
                () => setNote(''),
              )} />
            </View>
          )}
          {isGuard && !call.photoUrl && call.status !== 'let_in' && call.status !== 'denied'
            && (messagesQuery.data?.messages ?? []).some(message => message.kind === 'request_photo') && (
              <ActionButton
                title={working ? 'Sending photo…' : 'Take and send photo'}
                icon="camera"
                colors={colors}
                disabled={mutationBusy}
                onPress={() => void captureAndUploadPhoto(call)}
              />
            )}
        </View>
      )}
    </Surface>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 112 }]}
      refreshControl={<RefreshControl refreshing={stateQuery.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.pageHeader}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Feather name="shield" size={21} color={colors.primaryForeground} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>GLENBROOK 1 · COMMUNITY ACCESS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>GateBell</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh GateBell" onPress={() => void stateQuery.refetch()} style={[styles.refreshButton, { borderColor: colors.border }]}>
          <Feather name="refresh-cw" size={17} color={colors.primary} />
        </Pressable>
      </View>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        {isGuard ? 'A clear record for every visitor and response.' : isAdmin ? 'Community access activity, in one place.' : 'A familiar way to answer the gate.'}
      </Text>

      {!!errorText && <FeedbackBanner text={errorText} colors={colors} tone="error" />}
      {!!notice && <FeedbackBanner text={notice} colors={colors} tone="success" />}
      {!state.pushAvailable && !isResident && (
        <FeedbackBanner text="Firebase is not configured for background alerts. GateBell records remain available here." colors={colors} tone="warning" />
      )}
      {(isAdmin || isGuard) && state.pushReadiness && (
        <Surface style={[styles.infoCard, { borderColor: state.pushReadiness.missingRegistrations > 0 ? '#e4c98e' : colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{isGuard ? 'This post’s emergency alert readiness' : 'On-duty emergency alert readiness'}</Text>
          {state.pushReadiness.activeAssignments === 0 ? (
            <Text style={[styles.bodyText, { color: colors.mutedForeground, marginTop: 5 }]}>
              {isGuard
                ? 'No active gate post is assigned to this device; it cannot receive GateBell alerts. Use the community security hotline for urgent help.'
                : 'No active guard post is registered to receive GateBell alerts. Use the community security hotline for urgent help.'}
            </Text>
          ) : (
            <>
              <Text style={[styles.bodyText, { color: colors.mutedForeground, marginTop: 5 }]}>
                {isGuard
                  ? state.pushReadiness.missingRegistrations > 0
                    ? 'No active Android push phone is registered for this post.'
                    : 'An active Android push phone is registered for this post.'
                  : `${state.pushReadiness.registeredAssignments} of ${state.pushReadiness.activeAssignments} active guard posts have a registered Android push phone.`}
              </Text>
              {state.pushReadiness.missingRegistrations > 0 && (
                <Text style={[styles.bodyText, { color: colors.destructive, fontWeight: '700', marginTop: 5 }]}>If no guard phone is registered, use the community security hotline for urgent help.</Text>
              )}
            </>
          )}
          <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 8 }]}>Registration indicates setup only; GateBell cannot confirm that an alert was delivered.</Text>
        </Surface>
      )}

      {isResident && (
        <>
          <SecurityContactsCard />
          <Surface style={styles.infoCard}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Request emergency assistance</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Send a request for your registered household to on-duty security. Notifications depend on connectivity and phone settings. A saved request is not confirmation that help is on the way.</Text>
            <View style={styles.chipWrap}>
              {(['Medical assistance', 'Safety concern', 'Other'] as const).map(type => (
                <ChoiceChip key={type} label={type} selected={residentAlertType === type} colors={colors} onPress={() => { setResidentAlertType(type); setConfirmEmergency(false); }} />
              ))}
            </View>
            {(state.emergencyRequests ?? []).some(request => request.status === 'pending')
              ? <Text accessibilityRole="alert" style={[styles.bodyText, { color: colors.destructive }]}>Your household already has a pending request. Call the hotline if help is urgent.</Text>
              : confirmEmergency ? (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <Text style={[styles.bodyText, { color: colors.foreground }]}>Send a {residentAlertType.toLowerCase()} request for your household now?</Text>
                  <ActionButton title="Confirm and alert security" icon="alert-triangle" colors={colors} destructive disabled={mutationBusy} onPress={() => void perform(
                    () => createEmergencyRequest.mutateAsync({ data: { alertType: residentAlertType } }),
                    'Request recorded. Wait for security to dispatch; call the hotline for urgent help.',
                    () => setConfirmEmergency(false),
                  )} />
                  <SmallAction title="Cancel" colors={colors} disabled={mutationBusy} onPress={() => setConfirmEmergency(false)} />
                </View>
              ) : <ActionButton title="Request security assistance" icon="alert-triangle" colors={colors} destructive disabled={mutationBusy} onPress={() => setConfirmEmergency(true)} />}
          </Surface>
        </>
      )}

      {(state.emergencyRequests ?? []).length > 0 && (
        <Surface style={styles.infoCard}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{isResident ? 'Your household requests' : 'Resident emergency requests'}</Text>
          {state.emergencyRequests.map(request => (
            <View key={request.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, gap: 6 }}>
              <Text style={[styles.cardTitle, { color: request.status === 'pending' ? colors.destructive : colors.foreground }]}>{request.alertType} · {request.status === 'pending' ? 'Awaiting security' : statusLabel[request.status]}</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{unitName(request)} · {request.residentName} · {formatTime(request.createdAt)}</Text>
              {isGuard && request.status === 'pending' && <ActionButton title="Dispatch roving guard" icon="shield" colors={colors} disabled={mutationBusy || !state.context} onPress={() => void perform(
                () => dispatchEmergencyRequest.mutateAsync({ requestId: request.id }),
                'Roving guard dispatch recorded.',
              )} />}
            </View>
          ))}
        </Surface>
      )}

      {(isResident || isGuard) && (
        <Surface elevated style={{ padding: 16, marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="bell" size={19} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Background alerts</Text>
              <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 3 }]}>
                {isGuard && !state.context
                  ? 'Start a gate post below, then enable notifications to receive resident emergencies on this phone.'
                  : Platform.OS !== 'android'
                  ? 'GateBell background alerts are available in the Android app.'
                  : !state.pushAvailable
                    ? 'Firebase setup is still needed. You can respond while GateBell is open.'
                    : pushPermissionGranted
                      ? 'Notifications are allowed. Enable or refresh registration below to receive alerts on this device.'
                      : isGuard ? 'Enable notifications to hear resident emergency requests while the app is closed.' : 'Enable notifications to hear about a gate call when the app is closed.'}
              </Text>
            </View>
          </View>
          {Platform.OS === 'android' && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Pressable
                accessibilityRole="button"
                disabled={pushBusy || !state.pushAvailable || (isGuard && !state.context)}
                onPress={() => void enableBackgroundAlerts()}
                style={[{ minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pushBusy || !state.pushAvailable ? 0.55 : 1 }]}
              >
                {pushBusy
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={[{ fontFamily: 'DMSans_700Bold', fontSize: 13 }, { color: colors.primaryForeground }]}>
                    {pushPermissionGranted ? 'Refresh alert registration' : 'Enable background alerts'}
                  </Text>}
              </Pressable>
              {pushPermissionGranted && (
                <Pressable
                  accessibilityRole="button"
                  disabled={pushBusy}
                  onPress={() => void disableBackgroundAlerts()}
                  style={[{ minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1 }, { borderColor: colors.border, borderRadius: colors.radius }]}
                >
                  <Text style={[{ fontFamily: 'DMSans_600SemiBold', fontSize: 13 }, { color: colors.foreground }]}>Turn off alerts</Text>
                </Pressable>
              )}
              {pushPermissionGranted === false && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { void Linking.openSettings().catch(() => undefined); }}
                  style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 8 }}
                >
                  <Text style={[styles.smallText, { color: colors.primary }]}>Notification settings</Text>
                </Pressable>
              )}
            </View>
          )}
          {!!pushFeedback && <Text accessibilityRole="alert" style={[styles.smallText, { color: colors.mutedForeground, marginTop: 10 }]}>{pushFeedback}</Text>}
        </Surface>
      )}

      {isAdmin && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 16 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Security overview</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Read-only · role-scoped activity</Text></View>
            <Feather name="activity" size={19} color={colors.primary} />
          </View>
          <View style={styles.statsRow}>
            <StatTile title="Awaiting" value={pendingCalls.length} colors={colors} />
            <StatTile title="Calls" value={calls.length} colors={colors} />
            <StatTile title="Emergencies" value={emergencyOpen.length} colors={colors} urgent={emergencyOpen.length > 0} />
          </View>
          <Surface style={styles.infoCard}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Manage GateBell configuration</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Gate setup and designated resident contacts are managed in the HOA web dashboard.</Text>
            <ActionButton title="Open web dashboard" icon="external-link" colors={colors} onPress={() => router.push({ pathname: '/portal-handoff', params: { feature: 'GateBell configuration' } })} />
          </Surface>
        </>
      )}

      {isGuard && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 14 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Guard post</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Use the existing shared shift roster</Text></View>
            <Feather name="map-pin" size={18} color={colors.primary} />
          </View>
          {!state.activeShift ? (
            <Surface style={styles.infoCard}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>No active shared shift</Text>
              <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Enter your guard shift through the existing app workflow before using gate operations.</Text>
            </Surface>
          ) : (
            <Surface style={styles.infoCard}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Select active gate</Text>
              <View style={styles.chipWrap}>
                {state.gates.filter(gate => gate.active).map(gate => (
                  <ChoiceChip key={gate.id} label={gate.name} selected={(gateId ?? state.context?.gateId) === gate.id} colors={colors} onPress={() => setGateId(gate.id)} />
                ))}
                {state.gates.filter(gate => gate.active).length === 0 && <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No active gates are configured. Ask an administrator to configure gates in the web dashboard.</Text>}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Guard on post · from shift roster</Text>
              <View style={styles.chipWrap}>
                {state.activeShift.roster.map(entry => (
                  <ChoiceChip key={entry.id} label={entry.name} selected={(rosterEntryId ?? state.context?.rosterEntryId) === entry.id} colors={colors} onPress={() => setRosterEntryId(entry.id)} />
                ))}
                {state.activeShift.roster.length === 0 && <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No roster members are available for this shift.</Text>}
              </View>
              <ActionButton title={selectContext.isPending ? 'Saving post…' : state.context ? 'Update gate post' : 'Start gate post'} icon="check" colors={colors} disabled={mutationBusy || !(gateId ?? state.context?.gateId) || !(rosterEntryId ?? state.context?.rosterEntryId)} onPress={() => {
                const chosenGate = gateId ?? state.context?.gateId;
                const chosenRoster = rosterEntryId ?? state.context?.rosterEntryId;
                if (chosenGate && chosenRoster) void perform(
                  () => selectContext.mutateAsync({ data: { gateId: chosenGate, rosterEntryId: chosenRoster } }),
                  'Gate post selection saved.',
                );
              }} />
              {state.context && (
                <View style={[styles.handoverBox, { borderTopColor: colors.border }]}>
                  <Text style={[styles.smallText, { color: colors.mutedForeground }]}>Current post: {state.context.gateName} · {state.context.guardName}</Text>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Transfer this gate to</Text>
                  <View style={styles.chipWrap}>
                    {state.activeShift.roster.filter(entry => entry.id !== state.context?.rosterEntryId).map(entry => (
                      <ChoiceChip key={entry.id} label={entry.name} selected={handoverRosterId === entry.id} colors={colors} onPress={() => setHandoverRosterId(entry.id)} />
                    ))}
                  </View>
                  <View style={styles.actionStack}>
                    <ActionButton title={handover.isPending ? 'Transferring…' : 'Transfer gate post'} icon="repeat" colors={colors} disabled={mutationBusy || !handoverRosterId} onPress={() => handoverRosterId && void perform(
                      () => handover.mutateAsync({ data: { nextRosterEntryId: handoverRosterId } }),
                      'Gate post transferred. The shared shift remains open.',
                      () => setHandoverRosterId(null),
                    )} />
                    <Text style={[styles.smallText, { color: colors.mutedForeground }]}>A handover does not close the shared shift.</Text>
                  </View>
                </View>
              )}
            </Surface>
          )}

          <View style={[styles.sectionHeading, { marginTop: 18 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Find a resident</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Name or block and lot · no contact details shown</Text></View>
          </View>
          <TextInput
            accessibilityLabel="Search resident name, block, or lot"
            value={search}
            onChangeText={value => { setSearch(value); setSelectedUnit(null); }}
            placeholder="Search resident or unit"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          />
          {normalizedSearch.length > 0 && normalizedSearch.length < 2 && <Text style={[styles.helpText, { color: colors.mutedForeground }]}>Enter two or more characters to search.</Text>}
          {searchQuery.isLoading && normalizedSearch.length >= 2 && <ActivityIndicator style={styles.searchLoading} color={colors.primary} />}
          {searchQuery.isError && <RetryInline text="Search unavailable. Tap to retry." colors={colors} onPress={() => void searchQuery.refetch()} />}
          {normalizedSearch.length >= 2 && !searchQuery.isLoading && !searchQuery.isError && (
            <View style={styles.results}>
              {units.length === 0 ? <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No households found for that search.</Text> : units.map(unit => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Select ${unitName(unit)} ${unit.residentNames.join(', ')}`} key={unit.id} onPress={() => setSelectedUnit(unit)} style={[styles.unitResult, { borderColor: selectedUnit?.id === unit.id ? colors.primary : colors.border, backgroundColor: colors.card }]}>
                  <View style={styles.flex}><Text style={[styles.unitTitle, { color: colors.foreground }]}>{unitName(unit)}</Text><Text style={[styles.smallText, { color: colors.mutedForeground }]}>{unit.residentNames.join(', ') || unit.name}</Text></View>
                  <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                </Pressable>
              ))}
              {searchQuery.data?.truncated && <Text style={[styles.helpText, { color: colors.mutedForeground }]}>Additional results exist. Refine your search.</Text>}
            </View>
          )}
          {selectedUnit && (
            <Surface style={styles.infoCard}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Visitor call · {unitName(selectedUnit)}</Text>
              <TextInput accessibilityLabel="Visitor name" value={visitorName} onChangeText={setVisitorName} placeholder="Visitor name" placeholderTextColor={colors.mutedForeground} maxLength={100} style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>Visit type</Text>
              <View style={styles.chipWrap}>{['delivery', 'guest', 'service', 'other'].map(type => <ChoiceChip key={type} label={type} selected={visitorType === type} colors={colors} onPress={() => setVisitorType(type)} />)}</View>
              <ActionButton title={createCall.isPending ? 'Calling…' : state.context ? 'Ring designated contacts' : 'Choose a gate post first'} icon="bell" colors={colors} disabled={mutationBusy || !visitorName.trim() || !state.context} onPress={() => void perform(
                () => createCall.mutateAsync({ data: { unitId: selectedUnit.id, visitorName: visitorName.trim(), visitorType } }),
                'Visitor call sent to designated contacts.',
                () => setVisitorName(''),
              )} />
            </Surface>
          )}

          <View style={[styles.sectionHeading, { marginTop: 18 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Emergency dispatch</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>One-tap dispatch for a searched household</Text></View>
            <Feather name="alert-triangle" size={18} color={colors.destructive} />
          </View>
          <Surface style={[styles.emergencyCard, { borderColor: '#e4c4b8' }]}>
            {selectedUnit ? <Text style={[styles.cardTitle, { color: colors.foreground }]}>Selected: {unitName(selectedUnit)}</Text> : <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Search and select a household above to dispatch assistance.</Text>}
            <View style={styles.chipWrap}>{['Medical assistance', 'Safety concern', 'Other'].map(label => <ChoiceChip key={label} label={label} selected={alertType === label} colors={colors} onPress={() => setAlertType(label)} />)}</View>
            <ActionButton title={createEmergency.isPending ? 'Dispatching…' : 'Dispatch assistance'} icon="alert-triangle" colors={colors} destructive disabled={mutationBusy || !selectedUnit || !state.context} onPress={() => selectedUnit && void perform(
              () => createEmergency.mutateAsync({ data: { unitId: selectedUnit.id, alertType } }),
              'Emergency dispatch sent.',
            )} />
          </Surface>
        </>
      )}

      {isResident && (
        <>
          {emergencyOpen.length > 0 && (
            <Surface style={styles.emergencyBanner}>
              <View style={styles.row}>
                <Feather name="alert-triangle" size={20} color="#9a4338" />
                <Text style={styles.emergencyHeading}>Emergency response active</Text>
              </View>
              {emergencyOpen.map(item => (
                <View key={item.id} style={styles.emergencyItem}>
                  <Text style={styles.emergencyName}>{item.alertType} · {unitName(item)}</Text>
                  <Text style={styles.emergencyDetail}>{item.gateName} · {statusLabel[item.status] ?? item.status} · {formatTime(item.createdAt)}</Text>
                </View>
              ))}
            </Surface>
          )}
          <View style={[styles.sectionHeading, { marginTop: 14 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your visitor decisions</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Only server-authorized household calls are shown</Text></View>
            <View style={[styles.countPill, { backgroundColor: '#fbefdc' }]}><Text style={styles.countText}>{pendingCalls.length} pending</Text></View>
          </View>
          <Text style={[styles.helpText, { color: colors.mutedForeground }]}>A request follows the server status and deadline. An expired request is never automatically admitted.</Text>
        </>
      )}

      {(isAdmin || isResident || isGuard) && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 18 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isResident ? 'Visitor calls' : 'Gate calls'}</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>{isResident ? 'Respond only when you are a designated contact' : 'Server-recorded decisions and requests'}</Text></View>
            {isGuard && <View style={[styles.countPill, { backgroundColor: colors.secondary }]}><Text style={[styles.countText, { color: colors.foreground }]}>{pendingCalls.length} pending</Text></View>}
          </View>
          {calls.length === 0 ? (
            <Surface style={styles.emptyState}>
              <Feather name="inbox" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{isResident ? 'No visitor calls right now' : 'No calls recorded'}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{isResident ? 'A call to your linked home will appear here if you are designated to respond.' : 'New visitor activity will appear here as it is recorded.'}</Text>
            </Surface>
          ) : <View style={styles.stack}>{calls.map(renderCall)}</View>}
        </>
      )}

      {isGuard && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 18 }]}>
            <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Emergency status</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Update dispatch progress as it changes</Text></View>
          </View>
          {emergencyOpen.length === 0 ? <Surface style={styles.emptyState}><Feather name="check-circle" size={22} color={colors.primary} /><Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 8 }]}>No active emergencies.</Text></Surface> : (
            <View style={styles.stack}>{emergencyOpen.map(item => (
              <Surface key={item.id} style={styles.emergencyStatusCard}>
                <Text style={[styles.callVisitor, { color: colors.foreground }]}>{item.alertType}</Text>
                <Text style={[styles.smallText, { color: colors.mutedForeground }]}>{unitName(item)} · {item.gateName} · {item.guardName}</Text>
                <View style={styles.rowBetween}>
                  <View style={[styles.statusPill, { backgroundColor: '#fbefdc' }]}><Text style={[styles.statusText, { color: '#865516' }]}>{statusLabel[item.status]}</Text></View>
                  <View style={styles.statusActions}>
                    {item.status === 'dispatched' && <SmallAction title="En route" colors={colors} disabled={mutationBusy} onPress={() => void perform(() => updateEmergency.mutateAsync({ emergencyId: item.id, data: { status: 'en_route' } }), 'Emergency marked en route.')} />}
                    <SmallAction title="Resolve" colors={colors} disabled={mutationBusy} onPress={() => void perform(() => updateEmergency.mutateAsync({ emergencyId: item.id, data: { status: 'resolved' } }), 'Emergency resolved.')} />
                  </View>
                </View>
              </Surface>
            ))}</View>
          )}
        </>
      )}

      {isAdmin && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 18 }]}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active response</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Current emergency dispatch</Text></View></View>
          {emergencyOpen.length === 0 ? <Surface style={styles.emptyState}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active emergencies.</Text></Surface> : <View style={styles.stack}>{emergencyOpen.map(item => <Surface key={item.id} style={styles.emergencyStatusCard}><Text style={[styles.callVisitor, { color: colors.foreground }]}>{item.alertType} · {unitName(item)}</Text><Text style={[styles.smallText, { color: colors.mutedForeground }]}>{item.gateName} · {statusLabel[item.status]} · {formatTime(item.createdAt)}</Text></Surface>)}</View>}
        </>
      )}

      {(isAdmin || isGuard) && (
        <>
          <View style={[styles.sectionHeading, { marginTop: 18 }]}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Audited activity</Text><Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Server activity feed</Text></View><Feather name="clock" size={17} color={colors.primary} /></View>
          {state.activity.length === 0 ? <Surface style={styles.emptyState}><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No activity has been recorded yet.</Text></Surface> : <Surface style={styles.activityCard}>{state.activity.map(event => <View key={event.id} style={[styles.activityRow, { borderBottomColor: colors.border }]}><View style={[styles.activityDot, { backgroundColor: colors.primary }]} /><View style={styles.flex}><View style={styles.rowBetween}><Text style={[styles.messageName, { color: colors.foreground }]}>{event.name}</Text><Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatTime(event.createdAt)}</Text></View><Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 4 }]}>{event.description}</Text></View></View>)}</Surface>}
        </>
      )}
    </ScrollView>
  );
}

function noteCallId(openId: number | null, callId: number) {
  return openId === callId;
}

function ActionButton({ title, icon, colors, disabled, onPress, secondary, destructive }: {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  colors: ReturnType<typeof useColors>;
  disabled?: boolean;
  onPress: () => void;
  secondary?: boolean;
  destructive?: boolean;
}) {
  const background = secondary ? colors.card : destructive ? colors.destructive : colors.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.actionButton, { backgroundColor: background, borderColor: destructive && secondary ? colors.destructive : background, borderWidth: secondary ? 1 : 0, borderRadius: colors.radius, opacity: disabled ? 0.55 : 1 }]}>
      <Feather name={icon} size={16} color={secondary ? (destructive ? colors.destructive : colors.primary) : colors.primaryForeground} />
      <Text style={[styles.actionButtonText, { color: secondary ? (destructive ? colors.destructive : colors.primary) : colors.primaryForeground }]}>{title}</Text>
    </Pressable>
  );
}

function SmallAction({ title, colors, disabled, onPress }: { title: string; colors: ReturnType<typeof useColors>; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.smallAction, { borderColor: colors.border, backgroundColor: colors.card, opacity: disabled ? 0.55 : 1 }]}><Text style={[styles.smallActionText, { color: colors.primary }]}>{title}</Text></Pressable>;
}

function ChoiceChip({ label, selected, colors, onPress }: { label: string; selected: boolean; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choiceChip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Text style={[styles.choiceText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{label}</Text></Pressable>;
}

function StatTile({ title, value, colors, urgent }: { title: string; value: number; colors: ReturnType<typeof useColors>; urgent?: boolean }) {
  return <Surface style={styles.statTile}><Text style={[styles.statValue, { color: urgent ? colors.destructive : colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{title}</Text></Surface>;
}

function FeedbackBanner({ text, colors, tone }: { text: string; colors: ReturnType<typeof useColors>; tone: 'error' | 'success' | 'warning' }) {
  const tint = tone === 'error' ? colors.destructive : tone === 'success' ? colors.primary : '#8a6728';
  const background = tone === 'error' ? '#fff1ed' : tone === 'success' ? colors.secondary : '#faf2df';
  return <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: background }]}><Feather name={tone === 'success' ? 'check-circle' : 'alert-circle'} size={16} color={tint} /><Text style={[styles.feedbackText, { color: tint }]}>{text}</Text></View>;
}

function RetryInline({ text, colors, onPress }: { text: string; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.retry}><Text style={[styles.linkText, { color: colors.destructive }]}>{text}</Text></Pressable>;
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  flex: { flex: 1 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 2 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 29, lineHeight: 34 },
  refreshButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  intro: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 14, marginBottom: 12 },
  feedbackText: { flex: 1, fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  sectionTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 20 },
  sectionCaption: { fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  statTile: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
  statValue: { fontFamily: 'Outfit_700Bold', fontSize: 23 },
  statLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginTop: 2 },
  infoCard: { padding: 16, marginBottom: 12 },
  cardTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, marginBottom: 6 },
  bodyText: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  fieldLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, minHeight: 34, justifyContent: 'center' },
  choiceText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12, textTransform: 'capitalize' },
  actionButton: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  actionButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  handoverBox: { borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  actionStack: { marginTop: 4 },
  searchInput: { height: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  helpText: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17, marginTop: 6, marginBottom: 8 },
  searchLoading: { marginVertical: 18 },
  retry: { paddingVertical: 12 },
  results: { gap: 7, marginTop: 10, marginBottom: 8 },
  unitResult: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  unitTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  textInput: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 8 },
  callCard: { padding: 14, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  callHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  callIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  callVisitor: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  smallText: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontFamily: 'DMSans_700Bold', fontSize: 10 },
  callMeta: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, gap: 4 },
  metaText: { fontFamily: 'DMSans_400Regular', fontSize: 11 },
  pushNote: { fontFamily: 'DMSans_500Medium', fontSize: 11, marginTop: 8 },
  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 7 },
  responseActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  smallAction: { borderWidth: 1, borderRadius: 10, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallActionText: { fontFamily: 'DMSans_600SemiBold', fontSize: 11 },
  messagesToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 10 },
  linkText: { fontFamily: 'DMSans_600SemiBold', fontSize: 12 },
  messagesBox: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 8 },
  messageItem: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8, marginBottom: 2 },
  messageName: { fontFamily: 'DMSans_700Bold', fontSize: 12 },
  timestamp: { fontFamily: 'DMSans_400Regular', fontSize: 10 },
  noteComposer: { gap: 8, marginTop: 6 },
  noteInput: { minHeight: 68, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: 'top', fontFamily: 'DMSans_400Regular', fontSize: 14 },
  emptyState: { alignItems: 'center', padding: 22, marginBottom: 12 },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, marginTop: 9 },
  emptyText: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  stack: { gap: 0 },
  countPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  countText: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: '#81531c' },
  emergencyCard: { borderWidth: 1, padding: 15 },
  emergencyBanner: { backgroundColor: '#fff0eb', borderColor: '#e5b5a8', borderWidth: 1, padding: 15, marginBottom: 14 },
  emergencyHeading: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: '#873d31' },
  emergencyItem: { borderTopColor: '#edcec5', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 9 },
  emergencyName: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: '#693d34' },
  emergencyDetail: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: '#896c62', marginTop: 4 },
  emergencyStatusCard: { padding: 14, marginBottom: 9, gap: 8 },
  statusActions: { flexDirection: 'row', gap: 6 },
  activityCard: { paddingHorizontal: 14, paddingVertical: 4, marginBottom: 10 },
  activityRow: { flexDirection: 'row', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  activityDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
});

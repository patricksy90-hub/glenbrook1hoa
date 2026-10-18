import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CarStickerApplication, DocumentInput, GatePassApplication, HomeImprovementApplication,
  MoveApplication, useCancelMyGatePassApplication, useCancelMyMoveApplication,
  useCreateMyCarSticker, useCreateMyGatePassApplication, useCreateMyHomeImprovement,
  useCreateMyMoveApplication, useListMyCarStickers, useListMyGatePassApplications,
  useListMyHomeImprovements, useListMyMoveApplications, useResubmitMyCarSticker,
  useResubmitMyHomeImprovement, useUploadMyCarStickerDocument,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { Surface } from '@/components/Surface';
import { LoadingState } from '@/components/ScreenState';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

type Kind = 'home' | 'move' | 'gate' | 'sticker';
type FileItem = DocumentInput & { id: string };
type PendingStickerUpload = { applicationId: number; remaining: FileItem[] };
type Resubmission = { kind: 'home' | 'sticker'; id: number; initial: Record<string, string | boolean> };

export default function ApplicationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'sticker' ? 'sticker' : 'home');
  const [showForm, setShowForm] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingStickerUpload, setPendingStickerUpload] = useState<PendingStickerUpload | null>(null);
  const [resubmission, setResubmission] = useState<Resubmission | null>(null);
  const home = useListMyHomeImprovements();
  const move = useListMyMoveApplications();
  const gate = useListMyGatePassApplications();
  const sticker = useListMyCarStickers();
  const createHome = useCreateMyHomeImprovement();
  const createMove = useCreateMyMoveApplication();
  const createGate = useCreateMyGatePassApplication();
  const createSticker = useCreateMyCarSticker();
  const uploadSticker = useUploadMyCarStickerDocument();
  const resubmitHome = useResubmitMyHomeImprovement();
  const resubmitSticker = useResubmitMyCarSticker();
  const cancelMove = useCancelMyMoveApplication();
  const cancelGate = useCancelMyGatePassApplication();

  const resetForm = (nextKind: Kind = kind) => {
    setKind(nextKind);
    setResubmission(null);
    setFiles(nextKind === 'sticker' && pendingStickerUpload ? pendingStickerUpload.remaining : []);
    setShowForm(true);
  };
  const refresh = () => Promise.all([home.refetch(), move.refetch(), gate.refetch(), sticker.refetch()]).then(() => undefined);
  const uploadStickerFiles = async (applicationId: number, filesToUpload: FileItem[]) => {
    let remaining = [...filesToUpload];
    setPendingStickerUpload({ applicationId, remaining });
    await sticker.refetch();
    while (remaining.length) {
      try {
        await uploadSticker.mutateAsync({ id: applicationId, data: remaining[0] });
        remaining = remaining.slice(1);
        setPendingStickerUpload(remaining.length ? { applicationId, remaining } : null);
        setFiles(remaining);
      } catch {
        setPendingStickerUpload({ applicationId, remaining });
        setFiles(remaining);
        throw new Error(`Application saved. ${remaining.length} attachment${remaining.length === 1 ? '' : 's'} still need to upload. Tap “Retry uploads” to continue without creating another application.`);
      }
    }
  };
  const onCreated = async () => {
    await refresh();
    setFiles([]);
    setShowForm(false);
  };

  const submit = async (values: Record<string, string | boolean>) => {
    setSubmitting(true);
    try {
      if (kind === 'home') {
        if (!values.workDescription || !values.startDate || (!resubmission && !files.length)) throw new Error('Add a work description, start date, and at least one supporting photo.');
        const data = {
          applicantType: 'homeowner', improvementTypes: [String(values.improvementType || 'General improvement')],
          workDescription: String(values.workDescription), startDate: String(values.startDate),
          targetCompletionDate: String(values.targetCompletionDate || '') || null,
          notes: String(values.notes || '') || null,
        };
        if (resubmission?.kind === 'home') await resubmitHome.mutateAsync({ id: resubmission.id, data: { ...data, newDocuments: files } });
        else await createHome.mutateAsync({ data: { ...data, documents: files } });
        setResubmission(null);
        await onCreated();
      } else if (kind === 'move') {
        if (!values.moveDate || !values.moveTime || !values.termsAccepted) throw new Error('Choose a date and time, then accept the undertaking.');
        await createMove.mutateAsync({ data: {
          applicationType: String(values.applicationType || 'move_in') as 'move_in' | 'move_out',
          moveDate: String(values.moveDate), moveTime: String(values.moveTime),
          vehicleType: String(values.vehicleType || '') || null, vehiclePlate: String(values.vehiclePlate || '') || null,
          driverName: String(values.driverName || '') || null, contractorName: String(values.contractorName || '') || null,
          helpersNames: String(values.helpersNames || '') || null, termsAccepted: true, documents: files,
          notes: String(values.notes || '') || null,
        } });
        await onCreated();
      } else if (kind === 'gate') {
        if (!values.purpose || !values.entryDate || !values.entryTime || !values.visitorName || !values.undertakingAccepted) throw new Error('Complete the purpose, visit schedule, visitor name, and undertaking.');
        await createGate.mutateAsync({ data: {
          requestType: 'regular', purpose: String(values.purpose), entryDate: String(values.entryDate),
          entryTime: String(values.entryTime), exitDate: String(values.exitDate || '') || null,
          exitTime: String(values.exitTime || '') || null, visitorName: String(values.visitorName),
          contactNumber: String(values.contactNumber || '') || null, vehicleType: String(values.vehicleType || '') || null,
          vehiclePlate: String(values.vehiclePlate || '') || null, driverName: String(values.driverName || '') || null,
          undertakingAccepted: true, documents: files, notes: String(values.notes || '') || null,
        } });
        await onCreated();
      } else {
        if (resubmission?.kind === 'sticker') {
          if (!values.vehiclePlate) throw new Error('Vehicle plate number is required.');
          await resubmitSticker.mutateAsync({ id: resubmission.id, data: {
            vehiclePlate: String(values.vehiclePlate).toUpperCase(), vehicleMake: String(values.vehicleMake || '') || null,
            vehicleModel: String(values.vehicleModel || '') || null, vehicleColor: String(values.vehicleColor || '') || null,
            vehicleType: String(values.vehicleType || '') || null, notes: String(values.notes || '') || null, newDocuments: files,
          } });
          setResubmission(null);
          await onCreated();
          return;
        }
        if (pendingStickerUpload) {
          await uploadStickerFiles(pendingStickerUpload.applicationId, pendingStickerUpload.remaining);
          await onCreated();
          return;
        }
        if (!values.vehiclePlate) throw new Error('Vehicle plate number is required.');
        const created = await createSticker.mutateAsync({ data: {
          vehiclePlate: String(values.vehiclePlate).toUpperCase(), vehicleMake: String(values.vehicleMake || '') || null,
          vehicleModel: String(values.vehicleModel || '') || null, vehicleColor: String(values.vehicleColor || '') || null,
          vehicleType: String(values.vehicleType || '') || null, notes: String(values.notes || '') || null,
        } });
        if (files.length) await uploadStickerFiles(created.id, files);
        await onCreated();
      }
    } catch (error) {
      Alert.alert('Could not submit application', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSubmitting(false); }
  };

  const cancel = (type: 'move' | 'gate', id: number) => Alert.alert('Cancel application?', 'This action cannot be undone.', [
    { text: 'Keep', style: 'cancel' }, { text: 'Cancel application', style: 'destructive', onPress: async () => {
      try { if (type === 'move') await cancelMove.mutateAsync({ id }); else await cancelGate.mutateAsync({ id }); await refresh(); }
      catch { Alert.alert('Could not cancel application', 'Please try again.'); }
    } },
  ]);
  const beginResubmit = (item: HomeImprovementApplication | CarStickerApplication) => {
    if ('applicationNumber' in item) {
      setKind('home');
      setResubmission({ kind: 'home', id: item.id, initial: {
        improvementType: item.improvementTypes?.replace(/[[\]"]/g, '') || 'General improvement',
        workDescription: item.workDescription ?? '', startDate: item.startDate ?? '',
        targetCompletionDate: item.targetCompletionDate ?? '', notes: item.notes ?? '',
      } });
    } else {
      setKind('sticker');
      setResubmission({ kind: 'sticker', id: item.id, initial: {
        vehiclePlate: item.vehiclePlate, vehicleMake: item.vehicleMake ?? '', vehicleModel: item.vehicleModel ?? '',
        vehicleColor: item.vehicleColor ?? '', vehicleType: item.vehicleType ?? '', notes: item.notes ?? '',
      } });
    }
    setFiles([]);
    setShowForm(true);
  };

  if ([home, move, gate, sticker].some((query) => query.isLoading)) return <LoadingState />;
  if (showForm) return <ApplicationForm kind={kind} colors={colors} insets={insets} files={files} setFiles={setFiles} initialValues={resubmission?.initial} submitting={submitting} retryingUpload={kind === 'sticker' && Boolean(pendingStickerUpload)} resubmitting={Boolean(resubmission)} onBack={() => { setShowForm(false); setResubmission(null); }} onSubmit={submit} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
      <Text style={[styles.title, { color: colors.foreground }]}>Applications</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Submit requests and follow their progress without leaving the app.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {([['home', 'Home improvement', 'tool'], ['move', 'Move', 'truck'], ['gate', 'Gate pass', 'log-in'], ['sticker', 'Car sticker', 'credit-card']] as const).map(([value, label, icon]) => (
          <Pressable key={value} onPress={() => setKind(value)} style={[styles.tab, { backgroundColor: kind === value ? colors.primary : colors.card, borderColor: kind === value ? colors.primary : colors.border }]}>
            <Feather name={icon} size={15} color={kind === value ? colors.primaryForeground : colors.mutedForeground} /><Text style={{ color: kind === value ? colors.primaryForeground : colors.foreground, fontFamily: 'DMSans_500Medium', fontSize: 13 }}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable testID={`new-${kind}-application`} onPress={() => resetForm()} style={[styles.newButton, { backgroundColor: colors.secondary, borderColor: colors.primary, borderRadius: colors.radius }]}><Feather name={kind === 'sticker' && pendingStickerUpload ? 'upload-cloud' : 'plus'} size={17} color={colors.primary} /><Text style={[styles.newButtonText, { color: colors.primary }]}>{kind === 'sticker' && pendingStickerUpload ? `Resume ${pendingStickerUpload.remaining.length} pending upload${pendingStickerUpload.remaining.length === 1 ? '' : 's'}` : `New ${labelFor(kind)} application`}</Text></Pressable>
      {kind === 'home' && <ApplicationList items={home.data ?? []} kind={kind} colors={colors} onResubmit={beginResubmit} />}
      {kind === 'move' && <ApplicationList items={move.data ?? []} kind={kind} colors={colors} onCancel={(id) => cancel('move', id)} />}
      {kind === 'gate' && <ApplicationList items={gate.data ?? []} kind={kind} colors={colors} onCancel={(id) => cancel('gate', id)} />}
      {kind === 'sticker' && <ApplicationList items={sticker.data ?? []} kind={kind} colors={colors} onResubmit={beginResubmit} />}
    </ScrollView>
  );
}

function ApplicationList({ items, kind, colors, onCancel, onResubmit }: { items: (HomeImprovementApplication | MoveApplication | GatePassApplication | CarStickerApplication)[]; kind: Kind; colors: ReturnType<typeof useColors>; onCancel?: (id: number) => void; onResubmit?: (item: HomeImprovementApplication | CarStickerApplication) => void }) {
  if (!items.length) return <Surface style={styles.empty}><Feather name="file-text" size={24} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {labelFor(kind)} applications</Text><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Your submitted requests will appear here with their latest status.</Text></Surface>;
  return <View style={{ gap: 10 }}>{items.map((item) => {
    const anyItem = item as any;
    const title = kind === 'home' ? anyItem.applicationNumber : kind === 'move' ? `${anyItem.applicationType === 'move_out' ? 'Move out' : 'Move in'} · ${anyItem.moveDate}` : kind === 'gate' ? `${anyItem.visitorName} · ${anyItem.entryDate}` : `${anyItem.vehiclePlate} · ${anyItem.stickerNumber}`;
    return <Surface key={item.id} style={styles.applicationCard} elevated>
      <View style={styles.applicationHead}><View style={{ flex: 1 }}><Text style={[styles.applicationTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.applicationMeta, { color: colors.mutedForeground }]}>{labelFor(kind)} · Submitted {formatDate(item.createdAt)}</Text></View><Status status={item.status} colors={colors} /></View>
      {anyItem.workDescription && <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>{anyItem.workDescription}</Text>}
      {anyItem.purpose && <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>Purpose: {anyItem.purpose}</Text>}
      {anyItem.documentCount > 0 && <View style={styles.documentLine}><Feather name="paperclip" size={14} color={colors.mutedForeground} /><Text style={[styles.applicationMeta, { color: colors.mutedForeground }]}>{anyItem.documentCount} supporting file{anyItem.documentCount === 1 ? '' : 's'}</Text></View>}
      {onCancel && ['pending', 'submitted', 'under_review'].includes(item.status) && <Pressable onPress={() => onCancel(item.id)} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={{ color: colors.destructive, fontFamily: 'DMSans_500Medium', fontSize: 13 }}>Cancel request</Text></Pressable>}
      {onResubmit && ['rejected', 'disapproved'].includes(item.status) && <Pressable testID={`resubmit-application-${item.id}`} onPress={() => onResubmit(item as HomeImprovementApplication | CarStickerApplication)} style={[styles.cancelButton, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold', fontSize: 13 }}>Edit and resubmit</Text></Pressable>}
      {anyItem.rejectionReason && <Text style={[styles.rejection, { color: colors.destructive }]}>Needs attention: {anyItem.rejectionReason}</Text>}
    </Surface>;
  })}</View>;
}

function Status({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const isGood = ['approved', 'active', 'completed'].includes(status);
  const isBad = ['rejected', 'cancelled', 'denied'].includes(status);
  const backgroundColor = isGood ? '#DFF4E7' : isBad ? '#FDE5E5' : colors.accent;
  const color = isGood ? '#176B3A' : isBad ? colors.destructive : colors.primary;
  return <View style={[styles.status, { backgroundColor }]}><Text style={{ color, fontFamily: 'DMSans_700Bold', fontSize: 11, textTransform: 'capitalize' }}>{status.replace(/_/g, ' ')}</Text></View>;
}

function ApplicationForm({ kind, colors, insets, files, setFiles, initialValues, submitting, retryingUpload, resubmitting, onBack, onSubmit }: {
  kind: Kind; colors: ReturnType<typeof useColors>; insets: { bottom: number }; files: FileItem[]; setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  initialValues?: Record<string, string | boolean>; submitting: boolean; retryingUpload: boolean; resubmitting: boolean; onBack: () => void; onSubmit: (values: Record<string, string | boolean>) => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>({ termsAccepted: false, undertakingAccepted: false, applicationType: 'move_in', ...initialValues });
  const set = (key: string, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const field = (label: string, key: string, placeholder?: string, multiline = false) => <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={String(values[key] ?? '')} onChangeText={(value) => set(key, value)} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} multiline={multiline} style={[styles.input, multiline && styles.multiline, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} /></View>;
  const check = (label: string, key: string) => <Pressable onPress={() => set(key, !values[key])} style={styles.check}><View style={[styles.checkbox, { borderColor: values[key] ? colors.primary : colors.border, backgroundColor: values[key] ? colors.primary : colors.card }]}>{values[key] && <Feather name="check" size={13} color={colors.primaryForeground} />}</View><Text style={[styles.checkText, { color: colors.foreground }]}>{label}</Text></Pressable>;
  const heading = kind === 'home' ? 'Home improvement request' : kind === 'move' ? 'Move application' : kind === 'gate' ? 'Gate pass request' : 'Car sticker application';
  return <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
    <Pressable onPress={onBack} style={styles.back}><Feather name="arrow-left" size={18} color={colors.primary} /><Text style={[styles.backText, { color: colors.primary }]}>Applications</Text></Pressable>
    <Text style={[styles.title, { color: colors.foreground }]}>{resubmitting ? `Resubmit ${heading.toLowerCase()}` : heading}</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Provide complete information so the HOA team can review your request.</Text>
    {kind === 'home' && <>{field('Type of improvement', 'improvementType', 'e.g. Renovation')}{field('Work description *', 'workDescription', 'Describe the work and affected area', true)}{field('Start date *', 'startDate', 'YYYY-MM-DD')}{field('Target completion date', 'targetCompletionDate', 'YYYY-MM-DD')}{field('Notes', 'notes', 'Anything else the reviewer should know', true)}</>}
    {kind === 'move' && <>{<Text style={[styles.label, { color: colors.foreground }]}>Application type</Text>}<View style={styles.choiceWrap}>{[['move_in', 'Move in'], ['move_out', 'Move out']].map(([value, label]) => <Pressable key={value} onPress={() => set('applicationType', value)} style={[styles.choice, { backgroundColor: values.applicationType === value ? colors.primary : colors.card, borderColor: values.applicationType === value ? colors.primary : colors.border }]}><Text style={{ color: values.applicationType === value ? colors.primaryForeground : colors.foreground, fontFamily: 'DMSans_500Medium' }}>{label}</Text></Pressable>)}</View>{field('Move date *', 'moveDate', 'YYYY-MM-DD')}{field('Preferred time *', 'moveTime', 'e.g. 10:00 AM')}{field('Vehicle type', 'vehicleType', 'Truck / van')}{field('Vehicle plate', 'vehiclePlate')}{field('Driver name', 'driverName')}{field('Contractor / company', 'contractorName')}{field('Helpers names', 'helpersNames')}{field('Notes', 'notes', 'Additional details', true)}{check('I accept the move undertaking and HOA rules.', 'termsAccepted')}</>}
    {kind === 'gate' && <>{field('Purpose *', 'purpose', 'Delivery, visitor, repair, etc.')}{field('Visitor / company name *', 'visitorName')}{field('Entry date *', 'entryDate', 'YYYY-MM-DD')}{field('Entry time *', 'entryTime', 'e.g. 2:00 PM')}{field('Exit date', 'exitDate', 'YYYY-MM-DD')}{field('Exit time', 'exitTime', 'e.g. 4:00 PM')}{field('Contact number', 'contactNumber')}{field('Vehicle type', 'vehicleType', 'Car / motorcycle / truck')}{field('Vehicle plate', 'vehiclePlate')}{field('Driver name', 'driverName')}{field('Notes', 'notes', 'Additional details', true)}{check('I accept the gate pass undertaking.', 'undertakingAccepted')}</>}
    {kind === 'sticker' && <>{field('Vehicle plate *', 'vehiclePlate', 'ABC 1234')}{field('Vehicle make', 'vehicleMake', 'Toyota')}{field('Vehicle model', 'vehicleModel', 'Vios')}{field('Vehicle color', 'vehicleColor', 'White')}{field('Vehicle type', 'vehicleType', 'Sedan / SUV / motorcycle')}{field('Notes', 'notes', 'Additional details', true)}</>}
    <FilePicker colors={colors} files={files} setFiles={setFiles} required={kind === 'home'} />
    <Pressable testID="submit-application" onPress={() => onSubmit(values)} disabled={submitting} style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: submitting ? .6 : 1 }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{submitting ? 'Submitting…' : retryingUpload ? 'Retry uploads' : resubmitting ? 'Resubmit application' : 'Submit application'}</Text></Pressable>
  </KeyboardAwareScrollViewCompat>;
}

function FilePicker({ colors, files, setFiles, required }: { colors: ReturnType<typeof useColors>; files: FileItem[]; setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>; required: boolean }) {
  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access required', 'Allow photo access to attach supporting documents.', [
        { text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, base64: true, quality: .75 });
    if (result.canceled) return;
    const selected = result.assets.map((asset, index) => ({
      id: `${asset.assetId ?? asset.uri}-${index}`, fileName: asset.fileName ?? `supporting-photo-${index + 1}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg', fileSize: asset.fileSize ?? null, fileData: asset.base64 ?? '',
    })).filter((file) => file.fileData);
    setFiles((current) => [...current, ...selected].slice(0, 8));
  };
  return <View style={styles.uploadBox}><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Supporting files{required ? ' *' : ''}</Text><Text style={[styles.applicationMeta, { color: colors.mutedForeground }]}>Photos are encoded securely and sent with your application.</Text>{files.map((file) => <View key={file.id} style={styles.fileRow}><Feather name="image" size={14} color={colors.primary} /><Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>{file.fileName}</Text><Pressable onPress={() => setFiles((current) => current.filter((item) => item.id !== file.id))}><Feather name="x" size={16} color={colors.mutedForeground} /></Pressable></View>)}</View><Pressable testID="pick-supporting-files" onPress={pick} style={[styles.uploadButton, { borderColor: colors.primary }]}><Feather name="upload" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontFamily: 'DMSans_700Bold', fontSize: 13 }}>Choose photos</Text></Pressable></View>;
}

function labelFor(kind: Kind) { return kind === 'home' ? 'home improvement' : kind === 'move' ? 'move' : kind === 'gate' ? 'gate pass' : 'car sticker'; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

const styles = StyleSheet.create({
  title: { fontFamily: 'Outfit_700Bold', fontSize: 24, marginBottom: 6 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  tabs: { gap: 8, paddingBottom: 14 },
  tab: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  newButton: { minHeight: 46, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  newButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  empty: { alignItems: 'center', padding: 28, gap: 8, marginTop: 8 },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 17 },
  emptyText: { fontFamily: 'DMSans_400Regular', textAlign: 'center', fontSize: 13, lineHeight: 18 },
  applicationCard: { padding: 15 },
  applicationHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  applicationTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  applicationMeta: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 17 },
  status: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  description: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18, marginTop: 12 },
  documentLine: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 },
  cancelButton: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, marginTop: 12 },
  rejection: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 10 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22 },
  backText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  field: { marginBottom: 13 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 7 },
  input: { borderWidth: 1, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: 7 },
  choice: { borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 20 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 7 },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 },
  uploadBox: { borderWidth: 1, borderColor: '#00000018', borderRadius: 12, padding: 12, marginVertical: 10, gap: 10 },
  uploadButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  fileName: { fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});
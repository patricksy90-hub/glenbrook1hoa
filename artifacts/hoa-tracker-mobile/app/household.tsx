import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HouseholdMember,
  HouseholdMemberInput,
  useCreateHouseholdMember,
  useDeleteHouseholdMember,
  useListHouseholdMembers,
  useUpdateHouseholdMember,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { Surface } from '@/components/Surface';
import { EmptyState, LoadingState } from '@/components/ScreenState';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

const RELATIONSHIPS = [
  ['spouse', 'Spouse / Partner'], ['child', 'Child'], ['parent', 'Parent'],
  ['sibling', 'Sibling'], ['tenant', 'Tenant'], ['caregiver', 'Caregiver'], ['other', 'Other'],
] as const;

type Form = {
  firstName: string; middleName: string; lastName: string; relationship: string;
  birthdate: string; sex: string; occupation: string; phone: string; email: string;
  idType: string; idNumber: string; notes: string;
};

const EMPTY: Form = {
  firstName: '', middleName: '', lastName: '', relationship: 'spouse', birthdate: '',
  sex: '', occupation: '', phone: '', email: '', idType: '', idNumber: '', notes: '',
};

export default function HouseholdScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const homeownerId = user?.homeownerId ?? 0;
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<HouseholdMember | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const list = useListHouseholdMembers(homeownerId);
  const create = useCreateHouseholdMember();
  const update = useUpdateHouseholdMember();
  const remove = useDeleteHouseholdMember();

  const members = list.data ?? [];
  const grouped = useMemo(() => {
    const groups: Record<string, HouseholdMember[]> = {};
    members.forEach((member) => {
      const key = member.relationship || 'other';
      (groups[key] ??= []).push(member);
    });
    return groups;
  }, [members]);

  const beginAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setMode('form');
  };

  const beginEdit = (member: HouseholdMember) => {
    setEditing(member);
    setForm({
      firstName: member.firstName, middleName: member.middleName ?? '', lastName: member.lastName,
      relationship: member.relationship, birthdate: member.birthdate ?? '', sex: member.sex ?? '',
      occupation: member.occupation ?? '', phone: member.phone ?? '', email: member.email ?? '',
      idType: member.idType ?? '', idNumber: member.idNumber ?? '', notes: member.notes ?? '',
    });
    setMode('form');
  };

  const payload = (): HouseholdMemberInput => ({
    firstName: form.firstName.trim(),
    middleName: form.middleName.trim() || null,
    lastName: form.lastName.trim(),
    relationship: form.relationship,
    birthdate: form.birthdate.trim() || null,
    sex: form.sex || null,
    occupation: form.occupation.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    idType: form.idType.trim() || null,
    idNumber: form.idNumber.trim() || null,
    notes: form.notes.trim() || null,
  });

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !homeownerId) {
      Alert.alert('Missing information', 'First name and last name are required.');
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({ homeownerId, id: editing.id, data: payload() });
      } else {
        await create.mutateAsync({ homeownerId, data: payload() });
      }
      await list.refetch();
      setMode('list');
    } catch (error) {
      Alert.alert('Could not save member', getError(error));
    }
  };

  const confirmDelete = (member: HouseholdMember) => {
    Alert.alert('Remove household member?', `${member.firstName} ${member.lastName} will be removed from your household record.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await remove.mutateAsync({ homeownerId, id: member.id });
          await list.refetch();
        } catch (error) {
          Alert.alert('Could not remove member', getError(error));
        }
      } },
    ]);
  };

  if (mode === 'form') {
    return <MemberForm colors={colors} insets={insets} form={form} setForm={setForm} editing={Boolean(editing)}
      saving={create.isPending || update.isPending} onBack={() => setMode('list')} onSave={save} />;
  }

  if (list.isLoading) return <LoadingState />;
  if (!homeownerId) return <EmptyState message="Your account is not linked to a household record. Please contact the HOA office." icon="alert-circle" />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={RELATIONSHIPS.flatMap(([key, label]) => (grouped[key] ?? []).map((member) => ({ key, label, member })))}
        keyExtractor={({ member }) => String(member.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
        refreshing={list.isFetching}
        onRefresh={() => { void list.refetch(); }}
        ListHeaderComponent={
          <View>
            <View style={styles.headingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.foreground }]}>My Household</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Keep your household roster current for HOA records.</Text>
              </View>
              <Pressable testID="add-household-member" onPress={beginAdd} style={[styles.addButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Feather name="plus" size={18} color={colors.primaryForeground} />
                <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Add</Text>
              </Pressable>
            </View>
            <Surface style={[styles.info, { backgroundColor: colors.accent }]}><Feather name="heart" size={18} color={colors.primary} /><Text style={[styles.infoText, { color: colors.foreground }]}>Your household information is private and used for administrative purposes only.</Text></Surface>
          </View>
        }
        ListEmptyComponent={<EmptyState message="No household members yet. Add a family member, tenant, or caregiver to get started." icon="users" />}
        renderItem={({ item, index }) => (
          <View>
            {(index === 0 || item.key !== (RELATIONSHIPS.flatMap(([key]) => grouped[key] ?? [])[index - 1]?.relationship ?? '')) && (
              <Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{item.label}</Text>
            )}
            <MemberCard member={item.member} colors={colors} onEdit={() => beginEdit(item.member)} onDelete={() => confirmDelete(item.member)} />
          </View>
        )}
      />
    </View>
  );
}

function MemberCard({ member, colors, onEdit, onDelete }: { member: HouseholdMember; colors: ReturnType<typeof useColors>; onEdit: () => void; onDelete: () => void }) {
  const initials = `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase();
  return (
    <Surface style={styles.memberCard} elevated>
      <View style={styles.memberTop}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.memberName, { color: colors.foreground }]}>{member.firstName} {member.middleName ? `${member.middleName} ` : ''}{member.lastName}</Text>
          <Text style={[styles.memberRelation, { color: colors.primary }]}>{RELATIONSHIPS.find(([key]) => key === member.relationship)?.[1] ?? member.relationship}</Text>
        </View>
        <View style={styles.iconActions}>
          <Pressable testID={`edit-household-member-${member.id}`} onPress={onEdit} hitSlop={8}><Feather name="edit-2" size={17} color={colors.mutedForeground} /></Pressable>
          <Pressable testID={`delete-household-member-${member.id}`} onPress={onDelete} hitSlop={8}><Feather name="trash-2" size={17} color={colors.destructive} /></Pressable>
        </View>
      </View>
      {(member.occupation || member.phone || member.email) && <View style={styles.details}>
        {member.occupation && <Detail icon="briefcase" text={member.occupation} colors={colors} />}
        {member.phone && <Detail icon="phone" text={member.phone} colors={colors} />}
        {member.email && <Detail icon="mail" text={member.email} colors={colors} />}
      </View>}
    </Surface>
  );
}

function Detail({ icon, text, colors }: { icon: React.ComponentProps<typeof Feather>['name']; text: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.detail}><Feather name={icon} size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.mutedForeground }]} numberOfLines={1}>{text}</Text></View>;
}

function MemberForm({ colors, insets, form, setForm, editing, saving, onBack, onSave }: {
  colors: ReturnType<typeof useColors>; insets: { bottom: number }; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
  editing: boolean; saving: boolean; onBack: () => void; onSave: () => void;
}) {
  const field = (label: string, key: keyof Form, placeholder?: string, multiline = false) => (
    <View style={styles.field}><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput
      value={form[key]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
      placeholder={placeholder} placeholderTextColor={colors.mutedForeground}
      multiline={multiline} style={[styles.input, multiline && styles.multiline, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]} />
    </View>
  );
  return (
    <KeyboardAwareScrollViewCompat style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
      <Pressable onPress={onBack} style={styles.back}><Feather name="arrow-left" size={18} color={colors.primary} /><Text style={[styles.backText, { color: colors.primary }]}>Household</Text></Pressable>
      <Text style={[styles.title, { color: colors.foreground }]}>{editing ? 'Edit household member' : 'Add household member'}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Add the details the HOA needs to keep your household record accurate.</Text>
      <View style={styles.twoCol}>{field('First name *', 'firstName', 'First name')}{field('Last name *', 'lastName', 'Last name')}</View>
      {field('Middle name', 'middleName', 'Middle name')}
      <Text style={[styles.label, { color: colors.foreground }]}>Relationship</Text>
      <View style={styles.choiceWrap}>{RELATIONSHIPS.map(([key, label]) => <Pressable key={key} onPress={() => setForm((current) => ({ ...current, relationship: key }))} style={[styles.choice, { borderColor: form.relationship === key ? colors.primary : colors.border, backgroundColor: form.relationship === key ? colors.primary : colors.card }]}><Text style={{ color: form.relationship === key ? colors.primaryForeground : colors.foreground, fontFamily: 'DMSans_500Medium', fontSize: 13 }}>{label}</Text></Pressable>)}</View>
      <View style={styles.twoCol}>{field('Birthdate', 'birthdate', 'YYYY-MM-DD')}{field('Sex', 'sex', 'Male / Female')}</View>
      {field('Occupation / school', 'occupation', 'e.g. Engineer, Student')}
      <View style={styles.twoCol}>{field('Phone', 'phone', '09XX XXX XXXX')}{field('Email', 'email', 'name@example.com')}</View>
      <View style={styles.twoCol}>{field('ID type', 'idType', 'e.g. Passport')}{field('ID number', 'idNumber')}</View>
      {field('Notes', 'notes', 'Additional information', true)}
      <Pressable testID="save-household-member" onPress={onSave} disabled={saving} style={[styles.primaryButton, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: saving ? 0.6 : 1 }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add member'}</Text></Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

function getError(error: unknown) {
  const message = (error as { message?: string })?.message;
  return message || 'Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 24, marginBottom: 6 },
  subtitle: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10 },
  addButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 14 },
  info: { padding: 13, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 20 },
  infoText: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18 },
  groupTitle: { fontFamily: 'DMSans_700Bold', fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  memberCard: { padding: 14, marginBottom: 10 },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Outfit_700Bold', fontSize: 15 },
  memberName: { fontFamily: 'Outfit_600SemiBold', fontSize: 16 },
  memberRelation: { fontFamily: 'DMSans_500Medium', fontSize: 12, marginTop: 3 },
  iconActions: { flexDirection: 'row', gap: 16 },
  details: { marginTop: 12, gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#00000010' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailText: { fontFamily: 'DMSans_400Regular', fontSize: 13, flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22 },
  backText: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  field: { flex: 1, marginBottom: 13 },
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 7 },
  input: { borderWidth: 1, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  choice: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 20 },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryButtonText: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
});
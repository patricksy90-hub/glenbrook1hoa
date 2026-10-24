import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Surface } from './Surface';
import { useColors } from '@/hooks/useColors';

const hotlines = [
  { network: 'Globe', display: '0927-666-2357', uri: 'tel:+639276662357' },
  { network: 'Smart', display: '0947-527-3003', uri: 'tel:+639475273003' },
];

export function SecurityContactsCard() {
  const colors = useColors();
  const [error, setError] = useState('');
  return (
    <Surface elevated style={{ padding: 16, marginVertical: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Feather name="phone-call" size={21} color={colors.destructive} />
        <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 18, color: colors.foreground }}>Contact security</Text>
      </View>
      <Text style={{ fontFamily: 'DMSans_400Regular', color: colors.mutedForeground, marginTop: 6 }}>
        Main Gate Guard Hotline. For urgent help, call directly rather than waiting for an app response.
      </Text>
      {hotlines.map(hotline => (
        <Pressable key={hotline.network} accessibilityRole="button"
          accessibilityLabel={`Call security ${hotline.network} ${hotline.display}`}
          onPress={() => {
            setError('');
            void Linking.openURL(hotline.uri).catch(() => setError(`The dialer could not open. Dial ${hotline.display} directly.`));
          }}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius }}>
          <Feather name="phone" size={18} color={colors.primary} />
          <Text style={{ fontFamily: 'DMSans_600SemiBold', color: colors.primary, flex: 1 }}>{hotline.network}: {hotline.display}</Text>
          <Feather name="external-link" size={16} color={colors.primary} />
        </Pressable>
      ))}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.destructive, marginTop: 8 }}>{error}</Text>}
    </Surface>
  );
}

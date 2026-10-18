import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

export function LoadingState() {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error?: string, onRetry?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <Feather name="alert-triangle" size={32} color={colors.destructive} style={{ marginBottom: 16 }} />
      <Text style={[styles.text, { color: colors.foreground }]}>{error || 'Something went wrong.'}</Text>
      {onRetry && (
        <Pressable 
          onPress={onRetry} 
          style={[styles.btn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string, icon?: React.ComponentProps<typeof Feather>['name'] }) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <Feather name={icon} size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
      <Text style={[styles.text, { color: colors.mutedForeground }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontFamily: 'DMSans_400Regular', fontSize: 16, textAlign: 'center', marginBottom: 24 },
  btn: { paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { fontFamily: 'DMSans_500Medium', fontSize: 16 },
});

import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface SurfaceProps extends ViewProps {
  elevated?: boolean;
}

export function Surface({ style, elevated, children, ...props }: SurfaceProps) {
  const colors = useColors();
  return (
    <View 
      style={[
        styles.surface,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
        elevated && [styles.elevated, { shadowColor: colors.foreground }],
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  elevated: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  }
});

import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/contexts/AuthContext';
import { residentIdAccess } from '@workspace/designation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { classicTabBarHeight } from '@/lib/tabBarLayout';

function NativeTabLayout() {
  const { user } = useAuth();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="dues">
        <Icon sf={{ default: 'dollarsign.circle', selected: 'dollarsign.circle.fill' }} />
        <Label>Dues</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community">
        <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
        <Label>Community</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="id" hidden={residentIdAccess(user?.role) === 'none'}>
        <Icon sf={{ default: 'person.text.rectangle', selected: 'person.text.rectangle.fill' }} />
        <Label>ID</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: 'line.3.horizontal', selected: 'line.3.horizontal' }} />
        <Label>More</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          fontFamily: 'Outfit_600SemiBold',
          color: colors.foreground,
        },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          height: classicTabBarHeight(Platform.OS, insets.bottom),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="dues"
        options={{
          title: 'Dues',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="dollarsign.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="dollar-sign" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.2" tintColor={color} size={24} />
            ) : (
              <Feather name="users" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="id"
        options={{
          title: 'Digital ID',
          href: residentIdAccess(user?.role) === 'none' ? null : undefined,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.text.rectangle" tintColor={color} size={24} />
            ) : (
              <Feather name="credit-card" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="line.3.horizontal" tintColor={color} size={24} />
            ) : (
              <Feather name="menu" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}

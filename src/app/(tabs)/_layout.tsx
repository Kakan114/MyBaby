import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { lightColors, spacing, typography } from '@/theme/tokens';

type TabIconName = ComponentProps<typeof SymbolView>['name'];

function TabIcon({ color, name }: { color: ColorValue; name: TabIconName }) {
  return <SymbolView name={name} size={24} tintColor={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: lightColors.background },
        tabBarActiveTintColor: lightColors.actionPrimary,
        tabBarInactiveTintColor: lightColors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: typography.caption,
        tabBarStyle: {
          backgroundColor: lightColors.surface,
          borderTopColor: lightColors.borderSubtle,
          borderTopWidth: 1,
          paddingTop: spacing.xs,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Idag',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              name={{ ios: 'house.fill', android: 'home', web: 'home' }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Logga',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Lär',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              name={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistent',
          tabBarIcon: ({ color }) => (
            <TabIcon
              color={color}
              name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="family"
        options={{
          title: 'Familj',
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} />
          ),
        }}
      />
    </Tabs>
  );
}

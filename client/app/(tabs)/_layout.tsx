import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';

const THEME = '#0F6B5C';
const INACTIVE = '#9CA3AF';

export default function TabsLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: THEME,
          tabBarInactiveTintColor: INACTIVE,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '整理',
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? 'folder-open' : 'folder-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="rules"
          options={{
            title: '分类规则',
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? 'options' : 'options-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: '历史',
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { clearHistory, loadHistory, type HistoryRecord } from '@/utils/store';
import { encodeUriParam } from '@/utils/saf';

const THEME = '#0F6B5C';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory().then(setRecords);
    }, []),
  );

  const confirmClear = useCallback(() => {
    if (records.length === 0) return;
    Alert.alert('清空历史', `将删除 ${records.length} 条整理记录，确定吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void clearHistory().then(() => setRecords([]));
        },
      },
    ]);
  }, [records.length]);

  const renderItem = useCallback(({ item }: { item: HistoryRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{item.rootName || '已授权目录'}</Text>
        <Text style={styles.cardTime}>{fmtTime(item.time)}</Text>
      </View>
      <Text style={styles.cardSummary}>
        移动 {item.moved} / {item.total} 个
        {item.skippedSize > 0 ? ` · 跳过 ${item.skippedSize} 个超大文件` : ''}
        {item.failed > 0 ? ` · 失败 ${item.failed} 个` : ''}
      </Text>
      <View style={styles.tagWrap}>
        {Object.entries(item.perCategory).map(([name, count]) => {
          const dirUri = item.perCategoryUris?.[name];
          return (
            <Pressable
              key={name}
              style={({ pressed }) => [styles.tag, pressed && styles.tagPressed]}
              onPress={() => {
                if (dirUri) {
                  router.push({ pathname: '/browser', params: { uri: dirUri, name } });
                } else {
                  Alert.alert(
                    '无法浏览',
                    '这条记录没有保存目录信息（旧版本整理的），重新整理一次后即可点分类查看文件',
                  );
                }
              }}
            >
              <Text style={styles.tagText}>
                {name} {count} ›
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ), [router]);

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>整理历史</Text>
        {records.length > 0 && (
          <Pressable onPress={confirmClear} hitSlop={8}>
            <Text style={styles.clearText}>清空</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="file-tray" size={44} color="#D1D5DB" />
            <Text style={styles.emptyText}>还没有整理记录{'\n'}去「整理」页扫描一个目录吧</Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  clearText: { fontSize: 14, color: '#DC2626', fontWeight: '500' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  cardTime: { fontSize: 12, color: '#9CA3AF' },
  cardSummary: { fontSize: 13, color: '#4B5563', marginTop: 6 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { backgroundColor: `${THEME}14`, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  tagPressed: { opacity: 0.6 },
  tagText: { fontSize: 12, color: THEME, fontWeight: '500' },
  emptyWrap: { alignItems: 'center', paddingTop: 120, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
});

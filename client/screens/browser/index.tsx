// 分类文件夹浏览：列出指定目录下的文件/子目录（SAF）
import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { decodeUriParam, encodeUriParam, listEntries, type SafEntry } from '@/utils/saf';

const THEME = '#0F6B5C';

export default function BrowserScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ uri?: string | string[]; name?: string | string[] }>();
  // SAF uri 经路由传输会被二次解码破坏，Base64 打包后此处还原
  const rawUri = Array.isArray(params.uri) ? params.uri[0] : params.uri || '';
  const uri = rawUri.includes('content://') ? rawUri : decodeUriParam(rawUri);
  const name = Array.isArray(params.name) ? params.name[0] : params.name || '文件夹';

  const [entries, setEntries] = useState<SafEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!uri) {
      setFailed(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const list = await listEntries(uri);
      const dirs = list.filter((e) => e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
      const files = list.filter((e) => !e.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
      setEntries([...dirs, ...files]);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [uri]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const renderItem = useCallback(
    ({ item }: { item: SafEntry }) => (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        disabled={!item.isDirectory}
        onPress={() =>
          router.push({
            pathname: '/browser',
            params: { uri: encodeUriParam(item.uri), name: item.name },
          })
        }
      >
        <Ionicons
          name={item.isDirectory ? 'folder' : 'document-outline'}
          size={20}
          color={item.isDirectory ? '#F59E0B' : '#64748B'}
        />
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.isDirectory && <Ionicons name="chevron-forward" size={16} color="#C4C9D0" />}
      </Pressable>
    ),
    [router],
  );

  const dirCount = entries.filter((e) => e.isDirectory).length;
  const fileCount = entries.length - dirCount;

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name}
          </Text>
          {!loading && !failed && (
            <Text style={styles.headerSub}>
              {dirCount > 0 ? `${dirCount} 个文件夹 · ` : ''}
              {fileCount} 个文件
            </Text>
          )}
        </View>
      </View>

      {loading && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={THEME} />
          <Text style={styles.tipText}>正在读取...</Text>
        </View>
      )}

      {!loading && failed && (
        <View style={styles.centerWrap}>
          <Ionicons name="warning-outline" size={44} color="#D97706" />
          <Text style={styles.tipTitle}>无法读取该文件夹</Text>
          <Text style={styles.tipText}>
            目录授权已过期（重启手机或 APP 后失效）。{'\n'}
            去「整理」页重新授权同一目录并整理一次，{'\n'}即可恢复浏览。
          </Text>
          <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]} onPress={() => router.back()}>
            <Text style={styles.primaryBtnText}>返回</Text>
          </Pressable>
        </View>
      )}

      {!loading && !failed && (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.uri}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          ListEmptyComponent={
            <View style={styles.centerWrap}>
              <Ionicons name="folder-open-outline" size={44} color="#D1D5DB" />
              <Text style={styles.tipText}>这个文件夹是空的</Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  headerMeta: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  centerWrap: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  tipTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  tipText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowPressed: { opacity: 0.7 },
  rowName: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  primaryBtn: {
    backgroundColor: THEME,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnPressed: { opacity: 0.85 },
});

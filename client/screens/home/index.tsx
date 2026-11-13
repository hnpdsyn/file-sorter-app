import React, { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { getExt, type RulesConfig } from '@/utils/fileRules';
import {
  executeOrganize,
  scanAndClassify,
  type ClassifiedFile,
  type OrganizeResult,
} from '@/utils/organize';
import { pickDirectory, type PickResult } from '@/utils/saf';
import { addHistory, loadRules, type HistoryRecord } from '@/utils/store';

type Phase = 'idle' | 'scanning' | 'preview' | 'running' | 'done';

const THEME = '#0F6B5C';

const MATCHED_LABEL: Record<ClassifiedFile['matchedBy'], string> = {
  filename: '文件名',
  content: '内容',
  ext: '类型',
  fallback: '兜底',
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('idle');
  const [picked, setPicked] = useState<PickResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [files, setFiles] = useState<ClassifiedFile[]>([]);
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [busy, setBusy] = useState(false);

  const catById = useMemo(() => {
    const map = new Map<string, RulesConfig['categories'][number]>();
    for (const cat of rules?.categories || []) {
      map.set(cat.id, cat);
    }
    return map;
  }, [rules]);

  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const file of files) {
      map.set(file.categoryId, (map.get(file.categoryId) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [files]);

  const startAuthorize = useCallback(async () => {
    setBusy(true);
    try {
      const pickedResult = await pickDirectory();
      if (!pickedResult.granted || !pickedResult.uri) {
        Toast.show({ type: 'info', text1: '未授权目录，无法开始整理' });
        return;
      }
      setPicked(pickedResult);
      const config = await loadRules();
      setRules(config);
      setPhase('scanning');
      setScanCount(0);
      const output = await scanAndClassify(pickedResult.uri, config, (count) =>
        setScanCount(count),
      );
      setFiles(output.files);
      if (output.files.length === 0) {
        Toast.show({ type: 'info', text1: '该目录下没有可整理的文件' });
        setPhase('idle');
        return;
      }
      setPhase('preview');
      Toast.show({
        type: 'success',
        text1: `扫描完成，共 ${output.files.length} 个文件`,
        text2: output.contentScanned > 0 ? `已识别 ${output.contentScanned} 个文本内容` : undefined,
      });
    } catch {
      Toast.show({ type: 'error', text1: '扫描失败', text2: '请确认目录授权是否有效' });
      setPhase('idle');
    } finally {
      setBusy(false);
    }
  }, []);

  const runOrganize = useCallback(async () => {
    if (!picked || !rules) return;
    setBusy(true);
    setPhase('running');
    setProgress({ done: 0, total: files.length, current: '' });
    try {
      const res = await executeOrganize(picked.uri, files, rules.categories, (done, total, current) =>
        setProgress({ done, total, current }),
      );
      setResult(res);
      setPhase('done');
      const record: HistoryRecord = {
        id: `${Date.now()}`,
        time: Date.now(),
        rootName: picked.name,
        total: res.total,
        moved: res.moved,
        skippedSize: res.skippedSize,
        failed: res.failed,
        perCategory: res.perCategory,
      };
      await addHistory(record);
      if (res.failed > 0) {
        Toast.show({
          type: 'error',
          text1: `已移动 ${res.moved} 个，${res.failed} 个失败`,
        });
      } else {
        Toast.show({ type: 'success', text1: `整理完成，已移动 ${res.moved} 个文件` });
      }
    } catch {
      Toast.show({ type: 'error', text1: '整理中断', text2: '部分文件可能已完成移动' });
      setPhase('preview');
    } finally {
      setBusy(false);
    }
  }, [files, picked, rules]);

  const reset = useCallback(() => {
    setPhase('idle');
    setFiles([]);
    setResult(null);
    setProgress({ done: 0, total: 0, current: '' });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ClassifiedFile }) => {
      const cat = catById.get(item.categoryId);
      return (
        <View style={styles.fileRow}>
          <Ionicons name={cat?.icon || 'folder'} size={20} color={cat?.color || '#64748B'} />
          <View style={styles.fileMeta}>
            <Text style={styles.fileName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.fileSub}>
              {cat?.name || '其他'} · {MATCHED_LABEL[item.matchedBy]}
              {item.ext ? ` · .${getExt(item.name)}` : ''}
            </Text>
          </View>
        </View>
      );
    },
    [catById],
  );

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>文件整理</Text>
        <Text style={styles.headerSub}>扫描 · 内容识别 · 自动归档</Text>
      </View>

      {phase === 'idle' && (
        <View style={styles.centerWrap}>
          <View style={styles.heroCard}>
            <Ionicons name="folder-open" size={44} color={THEME} />
            <Text style={styles.heroTitle}>一键整理手机文件</Text>
            <Text style={styles.heroDesc}>
              选择一个文件夹（如「下载」或「内部存储」），APP 会扫描其中文件，按文件名、内容关键词和文件类型自动分进对应文件夹。
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              onPress={startAuthorize}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>选择目录并开始扫描</Text>
              )}
            </Pressable>
            <Text style={styles.heroTip}>
              整理只在授权目录内移动文件 · 超大文件自动跳过 · 可在「分类规则」中自定义
            </Text>
          </View>
        </View>
      )}

      {phase === 'scanning' && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={THEME} />
          <Text style={styles.scanText}>正在扫描 {picked?.name || ''} ...</Text>
          <Text style={styles.scanCount}>已发现 {scanCount} 个文件</Text>
        </View>
      )}

      {phase === 'preview' && (
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>
            {picked?.name} · {files.length} 个文件
          </Text>
          <View style={styles.statsWrap}>
            {stats.map(([catId, count]) => {
              const cat = catById.get(catId);
              return (
                <View key={catId} style={[styles.statCard, { backgroundColor: `${cat?.color || '#64748B'}14` }]}>
                  <Ionicons name={cat?.icon || 'folder'} size={18} color={cat?.color || '#64748B'} />
                  <Text style={[styles.statCount, { color: cat?.color || '#64748B' }]}>{count}</Text>
                  <Text style={styles.statName}>{cat?.name || '其他'}</Text>
                </View>
              );
            })}
          </View>
          <FlatList
            data={files}
            keyExtractor={(item) => item.uri}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 120 }}
            style={styles.flex1}
          />
          <View style={[styles.footerBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.secondaryBtn} onPress={reset} disabled={busy}>
              <Text style={styles.secondaryBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, styles.flex1, pressed && styles.btnPressed]}
              onPress={runOrganize}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>开始整理（{files.length} 个）</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'running' && (
        <View style={styles.centerWrap}>
          <Text style={styles.progressPct}>{progressPct}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.scanText}>正在移动文件...</Text>
          <Text style={styles.scanCount} numberOfLines={1}>
            {progress.done}/{progress.total} {progress.current}
          </Text>
          <Text style={styles.heroTip}>请保持 APP 在前台，大文件需要一点时间</Text>
        </View>
      )}

      {phase === 'done' && result && (
        <View style={styles.centerWrap}>
          <Ionicons
            name={result.failed > 0 ? 'alert-circle' : 'checkmark-circle'}
            size={44}
            color={result.failed > 0 ? '#D97706' : '#15803D'}
          />
          <Text style={styles.doneTitle}>
            整理完成：移动 {result.moved} / 共 {result.total} 个
          </Text>
          {result.skippedSize > 0 && (
            <Text style={styles.doneSub}>{result.skippedSize} 个超大文件已跳过（请手动移动）</Text>
          )}
          {result.failed > 0 && (
            <Text style={styles.doneSub}>{result.failed} 个失败（可能被系统占用）</Text>
          )}
          <View style={styles.resultWrap}>
            {Object.entries(result.perCategory).map(([name, count]) => (
              <View key={name} style={styles.resultRow}>
                <Text style={styles.resultName}>{name}</Text>
                <Text style={styles.resultCount}>{count} 个</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
            onPress={reset}
          >
            <Text style={styles.primaryBtnText}>再整理一次</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  centerWrap: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  heroCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  heroIcon: { fontSize: 44 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  heroDesc: { fontSize: 14, color: '#4B5563', lineHeight: 21, textAlign: 'center' },
  heroTip: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },
  primaryBtn: {
    backgroundColor: THEME,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnPressed: { opacity: 0.85 },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  secondaryBtnText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  scanText: { fontSize: 16, color: '#374151', fontWeight: '600' },
  scanCount: { fontSize: 13, color: '#6B7280', maxWidth: '100%' },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statCard: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 72,
  },
  statIcon: { fontSize: 18 },
  statCount: { fontSize: 16, fontWeight: '700' },
  statName: { fontSize: 11, color: '#6B7280' },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  fileIcon: { fontSize: 22 },
  fileMeta: { flex: 1 },
  fileName: { fontSize: 14, color: '#111827', fontWeight: '500' },
  fileSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  progressPct: { fontSize: 40, fontWeight: '700', color: THEME },
  progressTrack: {
    width: '80%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: THEME, borderRadius: 4 },
  doneIcon: { fontSize: 44 },
  doneTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  doneSub: { fontSize: 13, color: '#D97706', textAlign: 'center' },
  resultWrap: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  resultName: { fontSize: 14, color: '#374151' },
  resultCount: { fontSize: 14, color: THEME, fontWeight: '700' },
});

import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { DEFAULT_RULES, type Category, type RulesConfig } from '@/utils/fileRules';
import { loadRules, saveRules } from '@/utils/store';

const THEME = '#0F6B5C';

// 内容识别类可编辑关键词；类型类可编辑扩展名；other 不可编辑
function canEditKeywords(cat: Category): boolean {
  return cat.keywords.length > 0 || ['contract', 'invoice', 'resume', 'notes'].includes(cat.id);
}
function canEditExtensions(cat: Category): boolean {
  return cat.extensions.length > 0;
}

export default function RulesScreen() {
  const insets = useSafeAreaInsets();
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [draftItems, setDraftItems] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const ensureLoaded = useCallback(async (): Promise<RulesConfig | null> => {
    if (rules) return rules;
    const loaded = await loadRules();
    setRules(loaded);
    return loaded;
  }, [rules]);

  const persist = useCallback(async (next: RulesConfig) => {
    setRules(next);
    try {
      await saveRules(next);
      Toast.show({ type: 'success', text1: '规则已保存' });
    } catch {
      Toast.show({ type: 'error', text1: '保存失败，请重试' });
    }
  }, []);

  const openEditor = useCallback(
    (cat: Category) => {
      if (!canEditKeywords(cat) && !canEditExtensions(cat)) {
        Toast.show({ type: 'info', text1: '该类别按兜底规则工作，无需编辑' });
        return;
      }
      setEditing(cat);
      setDraftItems(canEditKeywords(cat) ? [...cat.keywords] : [...cat.extensions]);
      setInput('');
    },
    [],
  );

  const addItem = useCallback(() => {
    const value = input.trim().toLowerCase().replace(/^\.+/, '');
    if (!value || !editing) return;
    if (draftItems.includes(value)) {
      Toast.show({ type: 'info', text1: '已存在相同条目' });
      return;
    }
    setDraftItems([...draftItems, value]);
    setInput('');
  }, [draftItems, editing, input]);

  const removeItem = useCallback((item: string) => {
    setDraftItems((prev) => prev.filter((v) => v !== item));
  }, []);

  const saveEditor = useCallback(() => {
    if (!editing || !rules) return;
    const nextCategories = rules.categories.map((cat) =>
      cat.id === editing.id
        ? { ...cat, ...(canEditKeywords(editing) ? { keywords: draftItems } : { extensions: draftItems }) }
        : cat,
    );
    void persist({ ...rules, categories: nextCategories });
    setEditing(null);
  }, [draftItems, editing, persist, rules]);

  const toggleContentScan = useCallback(() => {
    void ensureLoaded().then((loaded) => {
      if (!loaded) return;
      void persist({ ...loaded, contentScan: !loaded.contentScan });
    });
  }, [ensureLoaded, persist]);

  const changeDepth = useCallback(
    (delta: number) => {
      void ensureLoaded().then((loaded) => {
        if (!loaded) return;
        const next = Math.min(6, Math.max(1, loaded.maxDepth + delta));
        void persist({ ...loaded, maxDepth: next });
      });
    },
    [ensureLoaded, persist],
  );

  const confirmReset = useCallback(() => {
    Alert.alert('恢复默认规则', '将丢弃全部自定义关键词与扩展名设置，确定吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '恢复默认',
        style: 'destructive',
        onPress: () => void persist({ ...DEFAULT_RULES, categories: DEFAULT_RULES.categories.map((c) => ({ ...c })) }),
      },
    ]);
  }, [persist]);

  const shownRules = rules;

  return (
    <Screen safeAreaEdges={['top', 'left', 'right']}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>分类规则</Text>
        <Pressable onPress={confirmReset} hitSlop={8}>
          <Text style={styles.resetText}>恢复默认</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.flex1}>
              <Text style={styles.settingTitle}>读取文本内容识别</Text>
              <Text style={styles.settingDesc}>
                对 txt/md/json 等可读文件读取开头内容，命中关键词后归类
              </Text>
            </View>
            <Switch
              value={shownRules?.contentScan ?? true}
              onValueChange={toggleContentScan}
              trackColor={{ true: THEME, false: '#D1D5DB' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.flex1}>
              <Text style={styles.settingTitle}>子目录扫描深度</Text>
              <Text style={styles.settingDesc}>越深越全面，扫描耗时也越长</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable style={styles.stepBtn} onPress={() => changeDepth(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{shownRules?.maxDepth ?? 3}</Text>
              <Pressable style={styles.stepBtn} onPress={() => changeDepth(1)}>
                <Text style={styles.stepBtnText}>＋</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTip}>
          点按类别可编辑{`\n`}识别优先级：文件名关键词 → 内容关键词 → 扩展名 → 兜底
        </Text>

        {(shownRules?.categories || []).map((cat) => (
          <Pressable key={cat.id} style={styles.catCard} onPress={() => openEditor(cat)}>
            <View style={styles.catHead}>
              <Ionicons name={cat.icon} size={20} color={cat.color} />
              <Text style={styles.catName}>{cat.name}</Text>
              <Text style={styles.catEditHint}>
                {canEditKeywords(cat) ? '编辑关键词' : canEditExtensions(cat) ? '编辑扩展名' : '兜底'}
              </Text>
            </View>
            <View style={styles.chipWrap}>
              {canEditKeywords(cat) &&
                (cat.keywords.length > 0 ? (
                  cat.keywords.slice(0, 6).map((k) => (
                    <View key={k} style={[styles.chip, { backgroundColor: `${cat.color}1A` }]}>
                      <Text style={[styles.chipText, { color: cat.color }]}>{k}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyChips}>暂无关键词</Text>
                ))}
              {canEditExtensions(cat) &&
                (cat.extensions.length > 0 ? (
                  cat.extensions.slice(0, 6).map((k) => (
                    <View key={k} style={[styles.chip, { backgroundColor: `${cat.color}1A` }]}>
                      <Text style={[styles.chipText, { color: cat.color }]}>.{k}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyChips}>暂无扩展名</Text>
                ))}
              {cat.id === 'other' && (
                <Text style={styles.emptyChips}>无法归类的文件自动进入此类别</Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="slide">
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.modalTitle}>
              {editing ? `编辑「${editing.name}」` : ''}
            </Text>
            <Text style={styles.modalDesc}>
              {editing && canEditKeywords(editing)
                ? '文件名或文本内容命中任一关键词即归入该类别'
                : '文件扩展名命中任一条目即归入该类别（无需带点）'}
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="输入后点添加"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable style={styles.addBtn} onPress={addItem}>
                <Text style={styles.addBtnText}>添加</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.chipScroll} contentContainerStyle={styles.chipWrap}>
              {draftItems.map((item) => (
                <Pressable key={item} style={styles.chipDel} onPress={() => removeItem(item)}>
                  <Text style={styles.chipDelText}>
                    {item} ✕
                  </Text>
                </Pressable>
              ))}
              {draftItems.length === 0 && <Text style={styles.emptyChips}>暂无条目</Text>}
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.secondaryBtn} onPress={() => setEditing(null)}>
                <Text style={styles.secondaryBtnText}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.primaryBtn, styles.flex1, pressed && styles.btnPressed]}
                onPress={saveEditor}
              >
                <Text style={styles.primaryBtnText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
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
  resetText: { fontSize: 14, color: '#DC2626', fontWeight: '500' },
  settingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  settingDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 18, color: THEME, fontWeight: '700' },
  stepValue: { fontSize: 16, fontWeight: '700', color: '#111827', minWidth: 20, textAlign: 'center' },
  sectionTip: { fontSize: 12, color: '#9CA3AF', lineHeight: 18, marginBottom: 10 },
  catCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catIcon: { fontSize: 20 },
  catName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  catEditHint: { fontSize: 12, color: THEME },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  chipText: { fontSize: 12, fontWeight: '500' },
  emptyChips: { fontSize: 12, color: '#9CA3AF' },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalDesc: { fontSize: 12, color: '#6B7280', marginTop: 4, marginBottom: 12, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  addBtn: {
    backgroundColor: THEME,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  chipScroll: { maxHeight: 200, marginTop: 12 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  chipDel: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FEE2E2',
  },
  chipDelText: { fontSize: 12, color: '#B91C1C', fontWeight: '500' },
  primaryBtn: {
    backgroundColor: THEME,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnPressed: { opacity: 0.85 },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  secondaryBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});

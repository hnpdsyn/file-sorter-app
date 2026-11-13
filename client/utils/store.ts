// 规则与历史的本地持久化（AsyncStorage）
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_RULES, type RulesConfig } from './fileRules';

const RULES_KEY = 'filesorter.rules.v1';
const HISTORY_KEY = 'filesorter.history.v1';
const HISTORY_MAX = 50;

export interface HistoryRecord {
  id: string;
  time: number;
  rootName: string;
  total: number;
  moved: number;
  skippedSize: number;
  failed: number;
  perCategory: Record<string, number>;
}

// 规则缺失字段用默认值合并，兼容旧版本结构变化
export async function loadRules(): Promise<RulesConfig> {
  try {
    const raw = await AsyncStorage.getItem(RULES_KEY);
    if (!raw) return { ...DEFAULT_RULES };
    const parsed = JSON.parse(raw) as Partial<RulesConfig>;
    const defaultById = new Map(DEFAULT_RULES.categories.map((c) => [c.id, c]));
    const categories = (parsed.categories || []).map((c) => ({
      ...defaultById.get(c.id),
      ...c,
    })) as RulesConfig['categories'];
    return {
      categories: categories.length > 0 ? categories : DEFAULT_RULES.categories,
      contentScan: parsed.contentScan ?? DEFAULT_RULES.contentScan,
      maxDepth: parsed.maxDepth ?? DEFAULT_RULES.maxDepth,
    };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export async function saveRules(rules: RulesConfig): Promise<void> {
  await AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

export async function loadHistory(): Promise<HistoryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addHistory(record: HistoryRecord): Promise<void> {
  const list = await loadHistory();
  const next = [record, ...list].slice(0, HISTORY_MAX);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

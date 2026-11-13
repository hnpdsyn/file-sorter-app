// 分类引擎与整理执行
import {
  CONTENT_CATEGORY_IDS,
  TEXT_EXTENSIONS,
  type Category,
} from './fileRules';
import {
  DirCache,
  moveFileWithinTree,
  readTextHead,
  scanTree,
  type ScannedFile,
} from './saf';

export type MatchedBy = 'filename' | 'content' | 'ext' | 'fallback';

export interface ClassifiedFile extends ScannedFile {
  categoryId: string;
  matchedBy: MatchedBy;
}

export interface ScanOutput {
  files: ClassifiedFile[];
  contentScanned: number;
}

export interface OrganizeResult {
  total: number;
  moved: number;
  skippedSize: number;
  failed: number;
  perCategory: Record<string, number>;
}

function containsKeyword(haystack: string, keywords: string[]): boolean {
  const lower = haystack.toLowerCase();
  return keywords.some((k) => k.length > 0 && lower.includes(k.toLowerCase()));
}

// 分类优先级：文件名关键词 > 文本内容关键词 > 扩展名 > 兜底（文档/其他）
export function classifyFile(file: ScannedFile, categories: Category[]): ClassifiedFile {
  for (const cat of categories) {
    if (cat.keywords.length > 0 && containsKeyword(file.name, cat.keywords)) {
      return { ...file, categoryId: cat.id, matchedBy: 'filename' };
    }
  }

  if (file.ext) {
    for (const cat of categories) {
      if (cat.extensions.includes(file.ext)) {
        return { ...file, categoryId: cat.id, matchedBy: 'ext' };
      }
    }
  }

  const fallback = categories.find((c) => c.id === 'other');
  return {
    ...file,
    categoryId: fallback ? fallback.id : 'other',
    matchedBy: 'fallback',
  };
}

// 扫描 + 内容识别 + 分类
export async function scanAndClassify(
  rootUri: string,
  rules: { categories: Category[]; contentScan: boolean; maxDepth: number },
  onProgress?: (count: number) => void,
): Promise<ScanOutput> {
  const raw = await scanTree(rootUri, rules.maxDepth, onProgress);
  let contentScanned = 0;
  const files: ClassifiedFile[] = [];

  for (const file of raw) {
    // 文件名命中过的无需再读内容
    let classified = classifyFile(file, rules.categories);

    if (
      rules.contentScan &&
      classified.matchedBy !== 'filename' &&
      TEXT_EXTENSIONS.has(file.ext)
    ) {
      const head = await readTextHead(file.uri);
      if (head.length > 0) {
        contentScanned += 1;
        const lower = head.toLowerCase();
        const hit = rules.categories.find(
          (cat) =>
            CONTENT_CATEGORY_IDS.has(cat.id) &&
            cat.keywords.some((k) => k.length > 0 && lower.includes(k.toLowerCase())),
        );
        if (hit) {
          classified = { ...file, categoryId: hit.id, matchedBy: 'content' };
        }
      }
    }

    files.push(classified);
  }

  return { files, contentScanned };
}

// 执行整理：每个类别在授权根目录下建（或复用）同名文件夹，逐个搬运
export async function executeOrganize(
  rootUri: string,
  classified: ClassifiedFile[],
  categories: Category[],
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<OrganizeResult> {
  const result: OrganizeResult = {
    total: classified.length,
    moved: 0,
    skippedSize: 0,
    failed: 0,
    perCategory: {},
  };
  const dirCache = new DirCache(rootUri);
  const namePools = new Map<string, Set<string>>();

  let done = 0;
  for (const item of classified) {
    try {
      const cat = categories.find((c) => c.id === item.categoryId);
      const dirName = cat ? cat.name : '其他文件';
      const dirUri = await dirCache.get(dirName);

      let pool = namePools.get(dirUri);
      if (!pool) {
        pool = await dirCache.takenNames(dirUri);
        namePools.set(dirUri, pool);
      }

      const outcome = await moveFileWithinTree(item, dirUri, pool);
      if (outcome.ok) {
        result.moved += 1;
        result.perCategory[dirName] = (result.perCategory[dirName] || 0) + 1;
      } else if (outcome.skipReason === 'size') {
        result.skippedSize += 1;
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
    done += 1;
    if (onProgress) {
      onProgress(done, classified.length, item.name);
    }
  }

  return result;
}

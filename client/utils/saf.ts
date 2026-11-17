// Android SAF（Storage Access Framework）操作封装
// 全部基于 expo-file-system/legacy 原生已支持的能力：
// readDirectoryAsync / makeDirectoryAsync / createFileAsync /
// readAsStringAsync / writeAsStringAsync / deleteAsync / getInfoAsync
import * as FileSystem from 'expo-file-system/legacy';
// StorageAccessFramework（namespace）与 EncodingType（enum）不会被 export * 链
// 转发到 'expo-file-system/legacy' 顶层，需从包内源文件直接导入
import { StorageAccessFramework } from 'expo-file-system/src/legacy/FileSystem';
import { EncodingType } from 'expo-file-system/src/legacy/FileSystem.types';

import {
  BASE64_MOVE_LIMIT_BYTES,
  CONTENT_READ_LIMIT_CHARS,
  TEXT_EXTENSIONS,
  getExt,
  mimeForExt,
} from './fileRules';

// StorageAccessFramework 已从包内源文件直接导入

export interface SafEntry {
  uri: string;
  name: string;
  isDirectory: boolean;
}

export interface ScannedFile {
  uri: string;
  name: string;
  ext: string;
  parentUri: string;
}

export interface PickResult {
  granted: boolean;
  uri: string;
  name: string;
}

// SAF document uri 末段形如 primary%3ADownload%2Fa.txt，解码出文件名
export function decodeName(uri: string): string {
  let dec = uri;
  try {
    dec = decodeURIComponent(uri);
  } catch {
    // 编码异常时用原始串兜底
  }
  const last = dec.split('/').pop() || '';
  const colon = last.indexOf(':');
  const pathPart = colon >= 0 ? last.slice(colon + 1) : last;
  return pathPart.includes('/') ? pathPart.slice(pathPart.lastIndexOf('/') + 1) : pathPart;
}

// 目录授权（系统目录选择器，无需额外 manifest 权限）
export async function pickDirectory(): Promise<PickResult> {
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) {
    return { granted: false, uri: '', name: '' };
  }
  return { granted: true, uri: perm.directoryUri, name: decodeName(perm.directoryUri) };
}

// SAF uri 经 expo-router params 传输会被二次解码（%3A->: 等），破坏 documentId 编码，
// 导致子目录被错误解析成授权根目录。改用 URL-safe Base64 打包传输（content uri 为纯 ASCII）。
// 注意：标准 Base64 含 +/= 三个字符，在 query 参数中同样会被改写（+ 变空格、= 是键值分隔符），
// 必须换成 URL-safe 字母表（-_）并去掉 padding，保证编码结果在 URL 传输中零失真
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeUriParam(uri: string): string {
  let out = '';
  for (let i = 0; i < uri.length; i += 3) {
    const b0 = uri.charCodeAt(i);
    const b1 = i + 1 < uri.length ? uri.charCodeAt(i + 1) : -1;
    const b2 = i + 2 < uri.length ? uri.charCodeAt(i + 2) : -1;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >= 0 ? b1 >> 4 : 0)];
    if (b1 < 0) break; // 不输出 padding
    out += B64_CHARS[((b1 & 15) << 2) | (b2 >= 0 ? b2 >> 6 : 0)];
    if (b2 < 0) break; // 不输出 padding
    out += B64_CHARS[b2 & 63];
  }
  // 转为 URL-safe 字母表：+ -> -，/ -> _，无 padding
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

export function decodeUriParam(encoded: string): string {
  // 先还原标准字母表，再去尾部 padding（解码循环本身兼容缺位）
  const clean = encoded.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const idx = (ch: string) => B64_CHARS.indexOf(ch);
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = idx(clean[i]);
    const c1 = i + 1 < clean.length ? idx(clean[i + 1]) : 0;
    const c2 = i + 2 < clean.length ? idx(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? idx(clean[i + 3]) : -1;
    if (c0 < 0 || c1 < 0) continue;
    out += String.fromCharCode((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out += String.fromCharCode(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) out += String.fromCharCode(((c2 & 3) << 6) | c3);
  }
  return out;
}

// getInfoAsync 对 content uri 支持不稳定，目录探测用双保险：
// 先试 getInfoAsync，无效时用 readDirectoryAsync 探测（抛错即文件）
async function probeIsDirectory(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.isDirectory === 'boolean') {
      return info.isDirectory;
    }
  } catch {
    // 继续走探测
  }
  try {
    await StorageAccessFramework.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

export async function listEntries(dirUri: string): Promise<SafEntry[]> {
  const uris = await StorageAccessFramework.readDirectoryAsync(dirUri);
  const out: SafEntry[] = [];
  for (const uri of uris) {
    out.push({
      uri,
      name: decodeName(uri),
      isDirectory: await probeIsDirectory(uri),
    });
  }
  return out;
}

// 递归扫描目录树，收集文件（目录按 maxDepth 限制）
export async function scanTree(
  rootUri: string,
  maxDepth: number,
  onProgress?: (count: number) => void,
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  let count = 0;

  async function walk(dirUri: string, depth: number): Promise<void> {
    const entries = await listEntries(dirUri);
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (depth < maxDepth) {
          await walk(entry.uri, depth + 1);
        }
      } else {
        files.push({
          uri: entry.uri,
          name: entry.name,
          ext: getExt(entry.name),
          parentUri: dirUri,
        });
        count += 1;
        if (onProgress && count % 5 === 0) {
          onProgress(count);
        }
      }
    }
  }

  await walk(rootUri, 0);
  return files;
}

// 读取文本文件头部用于内容识别；失败返回空串
export async function readTextHead(fileUri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: EncodingType.UTF8,
      length: CONTENT_READ_LIMIT_CHARS,
    });
  } catch {
    return '';
  }
}

// 目标目录缓存：categoryId/dirName -> uri，避免重复创建和列举
export class DirCache {
  private byName: Map<string, string> = new Map();

  constructor(private rootUri: string) {}

  async get(dirName: string): Promise<string> {
    const cached = this.byName.get(dirName);
    if (cached) return cached;

    // 先看授权树内是否已有同名目录
    const entries = await listEntries(this.rootUri);
    const found = entries.find((e) => e.isDirectory && e.name === dirName);
    const uri = found
      ? found.uri
      : await StorageAccessFramework.makeDirectoryAsync(this.rootUri, dirName);
    this.byName.set(dirName, uri);
    return uri;
  }

  // 目标目录内已占用的文件名集合（用于冲突改名）
  async takenNames(dirUri: string): Promise<Set<string>> {
    const entries = await listEntries(dirUri);
    return new Set(entries.map((e) => e.name));
  }
}

export interface MoveOutcome {
  ok: boolean;
  skipReason?: 'size' | 'error';
  finalName?: string;
}

// 在 SAF 树内"移动"一个文件：读内容 -> 目标目录建空文件 -> 写入 -> 删除源
// 文本走 UTF8，二进制走 Base64；超限或失败时跳过（源文件保持不动）
export async function moveFileWithinTree(
  file: ScannedFile,
  dirUri: string,
  takenNames: Set<string>,
): Promise<MoveOutcome> {
  // 冲突改名：name(1).ext / name(2).ext
  let finalName = file.name;
  if (takenNames.has(finalName)) {
    const dot = finalName.lastIndexOf('.');
    const base = dot > 0 ? finalName.slice(0, dot) : finalName;
    const extPart = dot > 0 ? finalName.slice(dot) : '';
    let i = 1;
    while (takenNames.has(`${base}(${i})${extPart}`)) {
      i += 1;
    }
    finalName = `${base}(${i})${extPart}`;
  }

  try {
    let content: string;
    let encoding: 'utf8' | 'base64';
    const isText = TEXT_EXTENSIONS.has(file.ext);

    if (isText) {
      content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: EncodingType.UTF8,
      });
      encoding = 'utf8';
      if (content.length > CONTENT_READ_LIMIT_CHARS * 256) {
        return { ok: false, skipReason: 'size' };
      }
    } else {
      content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: EncodingType.Base64,
      });
      encoding = 'base64';
      if (content.length > BASE64_MOVE_LIMIT_BYTES * 1.34) {
        return { ok: false, skipReason: 'size' };
      }
    }

    // createFileAsync 的 fileName 不含扩展名，Android 按 mime 自动补全；
    // 最终名以返回 uri 解码为准（系统可能自动追加序号）
    const dot = finalName.lastIndexOf('.');
    const base = dot > 0 ? finalName.slice(0, dot) : finalName;
    const mime = mimeForExt(file.ext);
    const targetUri = await StorageAccessFramework.createFileAsync(dirUri, base, mime);
    const realName = decodeName(targetUri);

    await FileSystem.writeAsStringAsync(targetUri, content, {
      encoding:
        encoding === 'utf8'
          ? EncodingType.UTF8
          : EncodingType.Base64,
    });
    await FileSystem.deleteAsync(file.uri, { idempotent: false });

    takenNames.add(realName);
    return { ok: true, finalName: realName };
  } catch {
    // 读写出错或系统拒绝时跳过该文件，源文件保持原位
    return { ok: false, skipReason: 'error' };
  }
}

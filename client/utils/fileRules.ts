// 文件分类规则与默认配置
import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

// 类别图标统一使用 Ionicons 图标名（数据驱动渲染）
export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface Category {
  id: string;
  name: string;
  icon: IconName;
  extensions: string[];
  keywords: string[];
  color: string;
}

export interface RulesConfig {
  categories: Category[];
  contentScan: boolean;
  maxDepth: number;
}

// 内容识别类：命中关键词即归类（优先于扩展名）
const CONTENT_CATEGORIES: Category[] = [
  {
    id: 'contract',
    name: '合同协议',
    icon: 'document-text',
    extensions: [],
    keywords: ['合同', '协议', '契约', '条款', 'contract', 'agreement'],
    color: '#B45309',
  },
  {
    id: 'invoice',
    name: '发票账单',
    icon: 'receipt',
    extensions: [],
    keywords: ['发票', '收据', '账单', '凭证', '对账', 'invoice', 'receipt'],
    color: '#0369A1',
  },
  {
    id: 'resume',
    name: '个人简历',
    icon: 'person',
    extensions: [],
    keywords: ['简历', '求职', 'resume', 'cv', '个人简介'],
    color: '#7C3AED',
  },
  {
    id: 'notes',
    name: '学习笔记',
    icon: 'book',
    extensions: [],
    keywords: ['笔记', '教程', '课件', '课程', '总结', '复习', 'notes', 'course'],
    color: '#15803D',
  },
];

// 类型识别类：按扩展名归类
const TYPE_CATEGORIES: Category[] = [
  {
    id: 'image',
    name: '图片',
    icon: 'image',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'svg', 'tiff'],
    keywords: [],
    color: '#DB2777',
  },
  {
    id: 'video',
    name: '视频',
    icon: 'videocam',
    extensions: ['mp4', 'mov', 'avi', 'mkv', '3gp', 'webm', 'flv', 'wmv', 'm4v'],
    keywords: [],
    color: '#DC2626',
  },
  {
    id: 'audio',
    name: '音频',
    icon: 'musical-notes',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'amr'],
    keywords: [],
    color: '#9333EA',
  },
  {
    id: 'doc',
    name: '文档资料',
    icon: 'document',
    extensions: [
      'pdf', 'doc', 'docx', 'txt', 'md', 'xls', 'xlsx', 'ppt', 'pptx',
      'csv', 'json', 'log', 'epub', 'pages', 'key', 'numbers',
    ],
    keywords: [],
    color: '#2563EB',
  },
  {
    id: 'archive',
    name: '压缩包',
    icon: 'archive',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    keywords: [],
    color: '#D97706',
  },
  {
    id: 'apk',
    name: '安装包',
    icon: 'download',
    extensions: ['apk', 'xapk', 'apks', 'ipa'],
    keywords: [],
    color: '#0D9488',
  },
  {
    id: 'other',
    name: '其他文件',
    icon: 'folder',
    extensions: [],
    keywords: [],
    color: '#64748B',
  },
];

export const DEFAULT_RULES: RulesConfig = {
  categories: [...CONTENT_CATEGORIES, ...TYPE_CATEGORIES],
  contentScan: true,
  maxDepth: 3,
};

export const CONTENT_CATEGORY_IDS = new Set(CONTENT_CATEGORIES.map((c) => c.id));

// 可以安全做文本内容识别的扩展名
export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'log', 'json', 'ini', 'conf', 'srt', 'vtt',
  'xml', 'yaml', 'yml', 'html', 'htm', 'js', 'ts', 'py', 'java', 'kt',
]);

// 文本内容识别的读取上限（字符）
export const CONTENT_READ_LIMIT_CHARS = 8192;

// 二进制文件 base64 搬运的上限（原始字节，超过跳过）
export const BASE64_MOVE_LIMIT_BYTES = 20 * 1024 * 1024;

export function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic', svg: 'image/svg+xml',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', '3gp': 'video/3gpp', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
  m4a: 'audio/mp4', ogg: 'audio/ogg', amr: 'audio/amr',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  json: 'application/json', log: 'text/plain',
  zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
  apk: 'application/vnd.android.package-archive',
};

export function mimeForExt(ext: string): string {
  return MIME_MAP[ext] || 'application/octet-stream';
}

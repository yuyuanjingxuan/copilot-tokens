export type Lang = 'en' | 'zh-CN';

export interface Strings {
  title: string;
  titleCol: string;
  days: string;
  all: string;
  refresh: string;
  exportJson: string;
  sessions: string;
  requests: string;
  input: string;
  output: string;
  cached: string;
  total: string;
  session: string;
  time: string;
  reqs: string;
  model: string;
  noData: string;
  noDataHint: string;
  detail: string;
  latency: string;
  close: string;
  exportDone: string;
  exportFailed: string;
  version: string;
}

const en: Strings = {
  titleCol: 'Title',
  title: 'Copilot Token Usage',
  days: 'Days',
  all: 'All',
  refresh: 'Refresh',
  exportJson: 'Export JSON',
  sessions: 'Sessions',
  requests: 'Requests',
  input: 'Input',
  output: 'Output',
  cached: 'Cached',
  total: 'Total',
  session: 'Session',
  time: 'Time',
  reqs: 'Reqs',
  model: 'Model',
  noData: 'No sessions found',
  noDataHint: 'Make sure "github.copilot.chat.agentDebugLog.fileLogging.enabled" is set to true in your settings, then try again after a few chat turns.',
  detail: 'Requests',
  latency: 'Latency',
  close: 'Close',
  exportDone: 'JSON exported',
  exportFailed: 'Export failed',
  version: 'Version',
};

const zh: Strings = {
  titleCol: '标题',
  title: 'Copilot Token 用量',
  days: '天数',
  all: '全部',
  refresh: '刷新',
  exportJson: '导出 JSON',
  sessions: '会话数',
  requests: '请求数',
  input: '输入',
  output: '输出',
  cached: '缓存',
  total: '总计',
  session: '会话',
  time: '时间',
  reqs: '请求',
  model: '模型',
  noData: '未找到会话',
  noDataHint: '请确认设置中已开启 "github.copilot.chat.agentDebugLog.fileLogging.enabled"，然后进行几轮对话后再试。',
  detail: '请求明细',
  latency: '耗时',
  close: '关闭',
  exportDone: 'JSON 已导出',
  exportFailed: '导出失败',
  version: '版本',
};

export function getStrings(lang: Lang): Strings {
  return lang === 'zh-CN' ? zh : en;
}

/** Resolve the effective language from the setting + VS Code display language. */
export function resolveLanguage(setting: string, vscodeLang: string): Lang {
  if (setting === 'en' || setting === 'zh-CN') return setting;
  return vscodeLang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

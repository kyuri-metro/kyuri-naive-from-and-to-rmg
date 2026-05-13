import type { KyuriNaiveDocV3, KyuriStation, StationType, TransferLine } from './kyuriModel.js';
import { getBranches, type RmgStationDict } from './getBranches.js';
import { KYURI_NAIVE_SCHEMA } from './schema.js';

export type RmgToKyuriWarningCode = 'loop' | 'coline' | 'branch';

export type RmgToKyuriResult =
  | {
      ok: true;
      doc: KyuriNaiveDocV3;
      warnings: { code: RmgToKyuriWarningCode; message: string }[];
    }
  | { ok: false; message: string };

const WARN_LOOP = '环线会被拆开：仅导出主干线（getBranches 的第一条分支）上的站点顺序，环线拓扑不保留。';
const WARN_COLINE = '共线会被取消：Kyuri naive 不表达 RMG 的 coline，导出结果中不含共线信息。';
const WARN_BRANCH = '支线不被保留：除主干线（branches[0]）外的支线站点不会出现在导出列表中。';

function readName(st: Record<string, unknown>): { zh: string; en: string } {
  const loc = st.localisedName;
  if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    return { zh: String(o.zh ?? ''), en: String(o.en ?? '') };
  }
  return { zh: '', en: '' };
}

function rmgFacilityToType(facility: unknown): StationType {
  if (facility === 'railway') {
    return 'railway';
  }
  if (facility === 'airport') {
    return 'airport';
  }
  return 'none';
}

/** 换乘 theme 中的 #RGB / #RRGGBB → 小写 #RRGGBB，供 Kyuri naive 使用 */
function normalizeInterchangeHex(raw: string): string {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
    return v.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const x = v.slice(1).toLowerCase();
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`;
  }
  return '#000000';
}

/**
 * 形如「Line *」或「*号线」（* 仅字母数字）时返回 *，否则 null。
 * 仍仅从 name 语义推断，不用 theme。
 */
function lineIdTokenFromNumberedName(s: string): string | null {
  const t = s.trim();
  if (!t) {
    return null;
  }
  const lineEn = t.match(/^Line\s*([A-Za-z0-9]+)\s*$/i);
  if (lineEn?.[1]) {
    return lineEn[1];
  }
  const lineZh = t.match(/^([A-Za-z0-9]+)\s*号线\s*$/);
  if (lineZh?.[1]) {
    return lineZh[1];
  }
  return null;
}

function transferLineIdFromName(nameZh: string, nameEn: string): string {
  const fromZh = lineIdTokenFromNumberedName(nameZh);
  if (fromZh !== null) {
    return fromZh;
  }
  const fromEn = lineIdTokenFromNumberedName(nameEn);
  if (fromEn !== null) {
    return fromEn;
  }
  return nameZh || nameEn;
}

function extractTransfers(transfer: unknown): TransferLine[] {
  if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) {
    return [];
  }
  const t = transfer as Record<string, unknown>;
  const groups = t.groups;
  if (!Array.isArray(groups)) {
    return [];
  }
  const out: TransferLine[] = [];
  for (const g of groups) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) {
      continue;
    }
    const lines = (g as Record<string, unknown>).lines;
    if (!Array.isArray(lines)) {
      continue;
    }
    for (const line of lines) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        continue;
      }
      const li = line as Record<string, unknown>;
      const theme = li.theme;
      const name = li.name;
      const nameZh = Array.isArray(name) && name.length >= 1 ? String(name[0] ?? '').trim() : '';
      const nameEn = Array.isArray(name) && name.length >= 2 ? String(name[1] ?? '').trim() : '';
      const lineId = transferLineIdFromName(nameZh, nameEn);
      if (!lineId) {
        continue;
      }
      let color = '#000000';
      let textColor = '#ffffff';
      if (Array.isArray(theme) && theme.length >= 4) {
        color = normalizeInterchangeHex(String(theme[2] ?? '#000000'));
        textColor = normalizeInterchangeHex(String(theme[3] ?? '#ffffff'));
      }
      out.push({ lineId, color, textColor });
    }
  }
  return out;
}

function normalizeTheme(theme: unknown): [string, string, string, string] {
  if (Array.isArray(theme) && theme.length >= 4) {
    return [String(theme[0]), String(theme[1]), String(theme[2]), String(theme[3])];
  }
  return ['other', 'other', '#000000', '#ffffff'];
}

function lineDisplayName(theme: [string, string, string, string], lineName: unknown, lineNum: unknown): string {
  if (Array.isArray(lineName) && lineName.length >= 1 && String(lineName[0]).trim()) {
    return String(lineName[0]);
  }
  if (lineNum !== undefined && lineNum !== null && String(lineNum).trim()) {
    return String(lineNum);
  }
  return theme[1] || '1';
}

/**
 * RMG JSON → Kyuri naive 3.0（仅用 getBranches(stn_list)[0] 的线性顺序）。
 */
export function rmgJsonToKyuriNaive(raw: unknown): RmgToKyuriResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: 'RMG 输入必须是 JSON 对象。' };
  }
  const param = raw as Record<string, unknown>;
  const stnList = param.stn_list;
  if (!stnList || typeof stnList !== 'object' || Array.isArray(stnList)) {
    return { ok: false, message: '缺少或无效的 stn_list。' };
  }

  const warnings: { code: RmgToKyuriWarningCode; message: string }[] = [];

  if (param.loop === true) {
    warnings.push({ code: 'loop', message: WARN_LOOP });
  }

  const coline = param.coline;
  if (coline && typeof coline === 'object' && !Array.isArray(coline) && Object.keys(coline).length > 0) {
    warnings.push({ code: 'coline', message: WARN_COLINE });
  }

  let branches: string[][];
  try {
    branches = getBranches(stnList as RmgStationDict);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `getBranches 失败：${msg}` };
  }

  if (branches.length > 1) {
    warnings.push({ code: 'branch', message: WARN_BRANCH });
  }

  const main = branches[0] ?? [];
  const internal = main.filter((id) => id !== 'linestart' && id !== 'lineend');

  const stations: KyuriStation[] = [];
  for (const id of internal) {
    const rawSt = (stnList as Record<string, unknown>)[id];
    if (!rawSt || typeof rawSt !== 'object' || Array.isArray(rawSt)) {
      continue;
    }
    const st = rawSt as Record<string, unknown>;
    const { zh, en } = readName(st);
    stations.push({
      id,
      chName: zh,
      enName: en,
      type: rmgFacilityToType(st.facility),
      transfer: extractTransfers(st.transfer),
    });
  }

  const theme = normalizeTheme(param.theme);
  const lineNumStr =
    param.line_num !== undefined && param.line_num !== null ? String(param.line_num).trim() : '';
  const lineId = lineNumStr || lineDisplayName(theme, param.line_name, param.line_num);

  const dir = param.direction === 'l' || param.direction === 'r' ? param.direction : 'r';
  const currentIdx = typeof param.current_stn_idx === 'string' ? param.current_stn_idx : '';
  const currentStnId =
    currentIdx && internal.includes(currentIdx) ? currentIdx : (stations[0]?.id ?? '');

  const doc: KyuriNaiveDocV3 = {
    version: 3,
    schema: KYURI_NAIVE_SCHEMA,
    direction: dir,
    currentStnId,
    lineId,
    color: theme[2],
    textColor: theme[3],
    stations,
  };

  return { ok: true, doc, warnings };
}

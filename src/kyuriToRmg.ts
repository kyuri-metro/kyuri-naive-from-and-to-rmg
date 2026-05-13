import type { KyuriNaiveDocV3, KyuriStation } from './kyuriModel.js';

type JsonObject = Record<string, unknown>;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const STATION_NUM_PAD = (n: number, w: number) => String(n).padStart(w, '0');

function sanitizeRmgKey(raw: string, used: Set<string>): string {
  let base = raw.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'stn';
  if (!/^[a-zA-Z_]/.test(base)) {
    base = `s${base}`;
  }
  let candidate = base;
  let i = 0;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base.slice(0, 8)}${i}`;
  }
  used.add(candidate);
  return candidate;
}

/** RMG line_name [zh, en]：线路 id 为「单字母 + 1～2 位数字」或「仅 1～2 位数字」时中文 `{id}号线`、英文 `Line {id}`；否则中文为 id、英文空串。 */
function lineNamePair(lineId: string): [string, string] {
  const id = lineId.trim();
  if (/^([a-zA-Z]\d{1,2}|\d{1,2})$/.test(id)) {
    return [`${id}号线`, `Line ${id}`];
  }
  return [id, ''];
}

function kyuriTransferToRmg(
  transfers: KyuriStation['transfer'],
  tick: 'l' | 'r',
): JsonObject {
  if (transfers.length === 0) {
    return { tick_direc: tick, paid_area: true, groups: [{}] };
  }
  const lines = transfers.map((t) => ({
    theme: ['other', t.lineId.slice(0, 32), t.color, t.textColor],
    name: lineNamePair(t.lineId),
  }));
  return { tick_direc: tick, paid_area: true, groups: [{ lines }] };
}

function pickPrototypeStation(stnList: Record<string, unknown>): JsonObject {
  for (const key of Object.keys(stnList)) {
    if (key === 'linestart' || key === 'lineend') {
      continue;
    }
    const v = stnList[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return deepClone(v) as JsonObject;
    }
  }
  throw new Error('模板 stn_list 中找不到可用站点原型（除 linestart/lineend 外）。');
}

/**
 * 将 Kyuri naive 3.0 套入 RMG 模板 JSON：仅替换线性 stn_list、主题色、方向、当前站等。
 */
export function kyuriDocToRmgJson(template: unknown, doc: KyuriNaiveDocV3): JsonObject {
  if (template === null || typeof template !== 'object' || Array.isArray(template)) {
    throw new Error('模板必须是 JSON 对象。');
  }
  const tpl = deepClone(template) as JsonObject;
  const stnList = tpl.stn_list;
  if (!stnList || typeof stnList !== 'object' || Array.isArray(stnList)) {
    throw new Error('模板缺少 stn_list 对象。');
  }
  const list = stnList as Record<string, unknown>;

  const prototype = pickPrototypeStation(list);
  const linestartProto = deepClone(list.linestart) as JsonObject;
  const lineendProto = deepClone(list.lineend) as JsonObject;

  const direction = doc.direction;
  const stations = doc.stations;
  if (stations.length === 0) {
    throw new Error('Kyuri 文档没有站点，无法生成 RMG。');
  }

  const used = new Set<string>();
  const rmgIds = stations.map((s) => sanitizeRmgKey(s.id, used));

  const newList: Record<string, unknown> = {};

  const mkStn = (i: number, st: KyuriStation, parents: string[], children: string[]): JsonObject => {
    const facility =
      st.type === 'railway' ? 'railway' : st.type === 'airport' ? 'airport' : undefined;
    const transfer = kyuriTransferToRmg(st.transfer, direction);
    const base: JsonObject = {
      ...prototype,
      parents,
      children,
      num: STATION_NUM_PAD(i + 1, 2),
      localisedName: { zh: st.chName, en: st.enName },
      transfer,
    };
    if (facility) {
      base.facility = facility;
    } else {
      delete base.facility;
    }
    return base;
  };

  const firstId = rmgIds[0]!;
  const lastId = rmgIds[rmgIds.length - 1]!;

  newList.linestart = {
    ...linestartProto,
    parents: [],
    children: [firstId],
  };
  newList.lineend = {
    ...lineendProto,
    parents: [lastId],
    children: [],
  };

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i]!;
    const id = rmgIds[i]!;
    const parents = i === 0 ? ['linestart'] : [rmgIds[i - 1]!];
    const children = i === stations.length - 1 ? ['lineend'] : [rmgIds[i + 1]!];
    newList[id] = mkStn(i, st, parents, children);
  }

  tpl.stn_list = newList;
  tpl.direction = direction;
  tpl.theme = ['other', doc.lineId.slice(0, 32), doc.color, doc.textColor];
  tpl.line_name = lineNamePair(doc.lineId);
  tpl.line_num = doc.lineId;
  tpl.coline = {};
  tpl.loop = false;

  const curKyuri = doc.currentStnId;
  const idx = stations.findIndex((s) => s.id === curKyuri);
  tpl.current_stn_idx = idx >= 0 ? rmgIds[idx]! : rmgIds[0]!;

  return tpl;
}

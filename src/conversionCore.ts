import { parseKyuriYaml, serializeKyuriDoc } from './yamlKyuri.js';
import { rmgJsonToKyuriNaive } from './rmgToKyuri.js';
import { kyuriDocToRmgJson } from './kyuriToRmg.js';

export type RmgToKyuriCoreResult =
  | { ok: true; yaml: string; warnings: { code: string; message: string }[] }
  | { ok: false; message: string };

export function runRmgJsonToKyuriYaml(rmgJsonText: string): RmgToKyuriCoreResult {
  let raw: unknown;
  try {
    raw = JSON.parse(rmgJsonText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `JSON 解析失败：${msg}` };
  }
  const conv = rmgJsonToKyuriNaive(raw);
  if (!conv.ok) {
    return { ok: false, message: conv.message };
  }
  return { ok: true, yaml: serializeKyuriDoc(conv.doc), warnings: conv.warnings };
}

export type KyuriToRmgCoreResult = { ok: true; json: string } | { ok: false; message: string };

export function runKyuriYamlToRmgJson(kyuriYamlText: string, template: unknown): KyuriToRmgCoreResult {
  const parsed = parseKyuriYaml(kyuriYamlText);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  try {
    const out = kyuriDocToRmgJson(template, parsed.doc);
    return { ok: true, json: JSON.stringify(out, null, 0) + '\n' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

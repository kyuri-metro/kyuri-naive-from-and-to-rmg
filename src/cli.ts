#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runKyuriYamlToRmgJson, runRmgJsonToKyuriYaml } from './conversionCore.js';

const USAGE = `kyuri-rmg — Kyuri naive 3.0 ↔ RMG 转换

用法:
  kyuri-rmg rmg-to-kyuri <输入.json> <输出.yaml>
      使用 RMG getBranches(stn_list)[0] 导出 Kyuri naive 3.0；环线/共线/支线见 stderr 提示

  kyuri-rmg kyuri-to-rmg <输入.yaml> <模板.json> <输出.json>
      套用 RMG 模板，将 Kyuri naive 3.0 YAML 写成线性 stn_list（输入须为 version: 3）
`;

function readUtf8(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const cmd = argv[0];

  if (cmd === 'rmg-to-kyuri') {
    if (argv.length < 3) {
      die('参数不足：rmg-to-kyuri <输入.json> <输出.yaml>');
    }
    const conv = runRmgJsonToKyuriYaml(readUtf8(argv[1]!));
    if (!conv.ok) {
      die(conv.message);
    }
    for (const w of conv.warnings) {
      console.error(`[${w.code}] ${w.message}`);
    }
    writeFileSync(resolve(argv[2]!), conv.yaml, 'utf8');
    console.error('已写入', resolve(argv[2]!));
    return;
  }

  if (cmd === 'kyuri-to-rmg') {
    if (argv.length < 4) {
      die('参数不足：kyuri-to-rmg <输入.yaml> <模板.json> <输出.json>');
    }
    const yml = readUtf8(argv[1]!);
    let template: unknown;
    try {
      template = JSON.parse(readUtf8(argv[2]!));
    } catch (e) {
      die(`模板 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    const r = runKyuriYamlToRmgJson(yml, template);
    if (!r.ok) {
      die(r.message);
    }
    writeFileSync(resolve(argv[3]!), r.json, 'utf8');
    console.error('已写入', resolve(argv[3]!));
    return;
  }

  die(`未知子命令：${cmd}\n\n${USAGE}`);
}

main();

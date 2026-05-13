import { useCallback, useEffect, useRef, useState } from 'react';
import { runKyuriYamlToRmgJson, runRmgJsonToKyuriYaml } from '../conversionCore.js';
import {
  CHILD_MSG_SOURCE,
  PARENT_MSG_SOURCE,
  postToParent,
  type ChildToParentMessage,
  type ParentToChildMessage,
} from './protocol.js';

type Tab = 'rmg-to-kyuri' | 'kyuri-to-rmg';

function useEmbedMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('hideOutput') === '1';
}

function initialTabFromUrl(): Tab {
  if (typeof window === 'undefined') {
    return 'rmg-to-kyuri';
  }
  return new URLSearchParams(window.location.search).get('flow') === 'kyuri-to-rmg' ? 'kyuri-to-rmg' : 'rmg-to-kyuri';
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const embed = useEmbedMode();
  const inIframe = typeof window !== 'undefined' && window.parent !== window;

  const [tab, setTab] = useState<Tab>(initialTabFromUrl);
  const [rmgIn, setRmgIn] = useState('');
  const [kyuriOut, setKyuriOut] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const [kyuriIn, setKyuriIn] = useState('');
  const [templateText, setTemplateText] = useState('');
  const [rmgOut, setRmgOut] = useState('');

  const [templateReady, setTemplateReady] = useState(false);

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}rmg-default-template.json`)
      .then((r) => r.json())
      .then((j) => {
        setTemplateText(JSON.stringify(j, null, 2));
        setTemplateReady(true);
      })
      .catch(() => {
        setTemplateReady(false);
      });
  }, []);

  useEffect(() => {
    postToParent({ source: CHILD_MSG_SOURCE, type: 'ready' });
  }, []);

  const emitOk = useCallback(
    (msg: Extract<ChildToParentMessage, { type: 'result'; ok: true }>) => {
      if (inIframe) {
        postToParent(msg);
      }
    },
    [inIframe],
  );

  const emitErr = useCallback(
    (mode: Tab, message: string) => {
      if (inIframe) {
        postToParent({ source: CHILD_MSG_SOURCE, type: 'result', mode, ok: false, message });
      }
    },
    [inIframe],
  );

  const convertRmgToKyuri = useCallback(() => {
    setWarnings([]);
    const r = runRmgJsonToKyuriYaml(rmgIn);
    if (!r.ok) {
      emitErr('rmg-to-kyuri', r.message);
      if (!(embed && inIframe)) {
        window.alert(r.message);
      }
      return;
    }
    const w = r.warnings.map((x) => x.message);
    setWarnings(w);
    setKyuriOut(r.yaml);
    emitOk({ source: CHILD_MSG_SOURCE, type: 'result', mode: 'rmg-to-kyuri', ok: true, yaml: r.yaml, warnings: w });
  }, [rmgIn, embed, inIframe, emitOk, emitErr]);

  const convertKyuriToRmg = useCallback(() => {
    let tpl: unknown;
    try {
      tpl = JSON.parse(templateText || '{}');
    } catch (e) {
      const msg = `模板 JSON 无效：${e instanceof Error ? e.message : String(e)}`;
      emitErr('kyuri-to-rmg', msg);
      if (!(embed && inIframe)) {
        window.alert(msg);
      }
      return;
    }
    const r = runKyuriYamlToRmgJson(kyuriIn, tpl);
    if (!r.ok) {
      emitErr('kyuri-to-rmg', r.message);
      if (!(embed && inIframe)) {
        window.alert(r.message);
      }
      return;
    }
    setRmgOut(r.json);
    emitOk({ source: CHILD_MSG_SOURCE, type: 'result', mode: 'kyuri-to-rmg', ok: true, json: r.json });
  }, [kyuriIn, templateText, embed, inIframe, emitOk, emitErr]);

  const convertRmgRef = useRef(convertRmgToKyuri);
  const convertKyuriRef = useRef(convertKyuriToRmg);
  convertRmgRef.current = convertRmgToKyuri;
  convertKyuriRef.current = convertKyuriToRmg;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as ParentToChildMessage;
      if (!d || d.source !== PARENT_MSG_SOURCE) {
        return;
      }
      if (d.type === 'setKyuriYaml') {
        setKyuriIn(d.yaml);
        setTab('kyuri-to-rmg');
        if (d.thenConvert) {
          window.setTimeout(() => convertKyuriRef.current(), 0);
        }
      }
      if (d.type === 'setRmgJson') {
        setRmgIn(d.json);
        setTab('rmg-to-kyuri');
        if (d.thenConvert) {
          window.setTimeout(() => convertRmgRef.current(), 0);
        }
      }
      if (d.type === 'convert') {
        if (d.mode === 'rmg-to-kyuri') {
          setTab('rmg-to-kyuri');
          window.setTimeout(() => convertRmgRef.current(), 0);
        } else if (d.mode === 'kyuri-to-rmg') {
          setTab('kyuri-to-rmg');
          window.setTimeout(() => convertKyuriRef.current(), 0);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const showStandaloneChrome = !embed;

  return (
    <div className="app-root">
      <h1 className="app-title">Kyuri naive ↔ RMG</h1>
      <p className="app-note">{embed ? '由线路图页面打开；转换结果会回到该页面。' : '在 Kyuri 线路 YAML 与 RMG 参数 JSON 之间转换。'}</p>

      {showStandaloneChrome ? (
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'rmg-to-kyuri'}
            onClick={() => setTab('rmg-to-kyuri')}
          >
            RMG → Kyuri YAML
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'kyuri-to-rmg'}
            onClick={() => setTab('kyuri-to-rmg')}
          >
            Kyuri YAML → RMG JSON
          </button>
        </div>
      ) : null}

      {tab === 'rmg-to-kyuri' ? (
        <section className="section" aria-labelledby="h-rmg">
          <h2 id="h-rmg">RMG 参数 JSON</h2>
          <label className="field-label" htmlFor="rmg-in">
            粘贴或上传后转换
          </label>
          <textarea id="rmg-in" className="mono-area" value={rmgIn} onChange={(ev) => setRmgIn(ev.target.value)} spellCheck={false} />
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={convertRmgToKyuri}>
              转换
            </button>
            <label className="btn">
              上传 JSON
              <input
                type="file"
                accept=".json,application/json"
                className="visually-hidden"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = '';
                  if (!f) {
                    return;
                  }
                  void f.text().then(setRmgIn);
                }}
              />
            </label>
            {!embed && kyuriOut ? (
              <button type="button" className="btn" onClick={() => downloadText('kyuri-naive.yml', kyuriOut, 'text/yaml')}>
                下载 YAML
              </button>
            ) : null}
          </div>
          {warnings.length > 0 ? (
            <ul className="warnings">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          {!embed ? (
            <>
              <div className="divider" />
              <label className="field-label" htmlFor="kyuri-out">
                Kyuri naive 3.0 YAML
              </label>
              <textarea id="kyuri-out" className="mono-area" readOnly value={kyuriOut} spellCheck={false} />
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'kyuri-to-rmg' ? (
        <section className="section" aria-labelledby="h-kyuri">
          {embed ? (
            <p className="app-note" id="h-kyuri" style={{ marginBottom: 12 }}>
              点击「转换」生成 RMG JSON；需要时可再次转换或下载。
            </p>
          ) : (
            <>
              <h2 id="h-kyuri">Kyuri naive YAML</h2>
              <label className="field-label" htmlFor="kyuri-in">
                线路 YAML（Kyuri naive 3.0）
              </label>
              <textarea id="kyuri-in" className="mono-area" value={kyuriIn} onChange={(ev) => setKyuriIn(ev.target.value)} spellCheck={false} />
              <div className="divider" />
              <h2>RMG 模板 JSON</h2>
              <p className="app-note" style={{ marginBottom: 8 }}>
                默认已加载内置模板；可粘贴或上传替换。
                {!templateReady ? '（内置模板加载失败，请自行粘贴完整模板。）' : null}
              </p>
              <textarea className="mono-area" value={templateText} onChange={(ev) => setTemplateText(ev.target.value)} spellCheck={false} />
            </>
          )}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={convertKyuriToRmg}>
              转换
            </button>
            {!embed ? (
              <>
                <label className="btn">
                  上传 Kyuri YAML
                  <input
                    type="file"
                    accept=".yml,.yaml,text/yaml"
                    className="visually-hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      ev.target.value = '';
                      if (!f) {
                        return;
                      }
                      void f.text().then(setKyuriIn);
                    }}
                  />
                </label>
                <label className="btn">
                  上传模板 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="visually-hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      ev.target.value = '';
                      if (!f) {
                        return;
                      }
                      void f.text().then(setTemplateText);
                    }}
                  />
                </label>
              </>
            ) : null}
            {rmgOut ? (
              <button type="button" className="btn" onClick={() => downloadText('rmg-param.json', rmgOut, 'application/json')}>
                下载 RMG JSON
              </button>
            ) : null}
          </div>
          <div className="divider" />
          <label className="field-label" htmlFor="rmg-out">
            RMG 参数 JSON
          </label>
          <textarea id="rmg-out" className="mono-area" readOnly value={rmgOut} spellCheck={false} />
        </section>
      ) : null}

      <footer className="license">
        本软件以 <a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU GPL v3</a> 发布。
      </footer>
    </div>
  );
}

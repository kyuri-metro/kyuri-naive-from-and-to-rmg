/** 嵌入 njmetro-railmap-creator 等父页面时使用（与 GPL 许可的父文档跨源 postMessage，父项目本身不必为 GPL） */
export const PARENT_MSG_SOURCE = 'njmetro-railmap-parent' as const;
export const CHILD_MSG_SOURCE = 'kyuri-rmg-tool' as const;

export type ParentToChildMessage =
  | { source: typeof PARENT_MSG_SOURCE; type: 'setKyuriYaml'; yaml: string; thenConvert?: boolean }
  | { source: typeof PARENT_MSG_SOURCE; type: 'setRmgJson'; json: string; thenConvert?: boolean }
  | {
      source: typeof PARENT_MSG_SOURCE;
      type: 'convert';
      mode: 'rmg-to-kyuri' | 'kyuri-to-rmg';
    };

export type ChildToParentMessage =
  | { source: typeof CHILD_MSG_SOURCE; type: 'ready' }
  | {
      source: typeof CHILD_MSG_SOURCE;
      type: 'result';
      mode: 'rmg-to-kyuri' | 'kyuri-to-rmg';
      ok: true;
      yaml?: string;
      json?: string;
      warnings?: string[];
    }
  | {
      source: typeof CHILD_MSG_SOURCE;
      type: 'result';
      mode: 'rmg-to-kyuri' | 'kyuri-to-rmg';
      ok: false;
      message: string;
    };

export function postToParent(msg: ChildToParentMessage): void {
  if (typeof window === 'undefined' || window.parent === window) {
    return;
  }
  window.parent.postMessage(msg, '*');
}

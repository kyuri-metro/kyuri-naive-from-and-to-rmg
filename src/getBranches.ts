/**
 * 来源：RMG（Rail Map Generator）
 *
 * 自上游仓库 [railmapgen/rmg](https://github.com/railmapgen/rmg) 文件
 * `src/redux/helper/graph-theory-util.ts` 中的 `getBranches` 及其紧邻英文 JSDoc
 * 所描述之算法复制而来；语义：第一个分支为主干线，其余为支线拓扑段。
 *
 * 在 RMG 克隆上执行 git blame 显示历次记录的 `author` 字段目前为止仅有
 * **Chito Wong**（chi.to.wong@outlook.com）出现
 *
 * 本文件相对上游另有少量改写（例如独立导出的 TS 类型名、`children` 数量非 1 或 2 时抛错等）。
 */
export type BranchInfo = Partial<Record<'left' | 'right', ['through' | 'nonthrough', string]>>;

export type RmgStationNode = {
  children: string[];
  branch?: BranchInfo;
};

export type RmgStationDict = Record<string, RmgStationNode>;

export const getBranches = (stnList: RmgStationDict): string[][] => {
  const stack = ['linestart'];
  const branches: string[][] = [['linestart']];
  let branchCount = 0;

  while (stack.length) {
    let curId = stack.shift() as string;
    const prevId = branches[branchCount].slice(-1)[0] ?? null;
    if (prevId && curId !== 'linestart') {
      branches[branchCount].push(curId);
    } else {
      branches[branchCount] = [curId];
    }
    while (curId !== 'lineend') {
      const prev = curId;
      const children = stnList[prev]!.children;
      switch (children.length) {
        case 1:
          curId = children[0]!;
          break;
        case 2: {
          const rightBranchInfo = stnList[prev]!.branch!.right!;
          const branchNextId = rightBranchInfo[1]!;
          if (rightBranchInfo[0] === 'through') {
            branches.push([curId]);
            stack.push(branchNextId);
          } else {
            if (branchCount === 0) {
              branches.push([prev]);
              stack.push(branchNextId);
            }
          }
          curId = children.filter((stnId) => stnId !== branchNextId)[0]!;
          break;
        }
        default:
          throw new Error(`站点 ${prev} 的 children 数量既不是 1 也不是 2，无法用于 getBranches`);
      }
      branches[branchCount]!.push(curId);

      if (prev === stnList[curId]!.branch?.left?.[1]) {
        break;
      }
    }
    branchCount++;
  }

  return branches;
};

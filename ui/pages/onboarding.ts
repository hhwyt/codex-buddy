// onboarding page. Owner: A5. O-01..O-08 欢迎屏「开始安装」→ 进度打勾 → 模型页；故障屏「再试一次 / 复制日志 / 进群发给我们」
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

export const renderOnboarding: Page = ({ root }) => {
  root.replaceChildren(h('div', { 'data-testid': TID.onboarding.root }));
};

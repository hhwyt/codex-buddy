// settings page. Owner: A6. T-01..T-04, L-01..L-07 汉化两张预览图（照 ui-design/language-final.html）、版本和检查更新、一键还原
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

export const renderSettings: Page = ({ root }) => {
  root.replaceChildren(h('div', { 'data-testid': TID.settings.root }));
};

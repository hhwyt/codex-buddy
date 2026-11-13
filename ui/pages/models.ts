// models page. Owner: A5. M-01..M-28, C-01..C-10 叠卡（切换）和摊开（分身），照 ui-design/model-page-final.html
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

export const renderModels: Page = ({ root }) => {
  root.replaceChildren(h('div', { 'data-testid': TID.models.root }));
};

// help page. Owner: A6. H-01, H-02 报错解读、企业微信码
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

export const renderHelp: Page = ({ root }) => {
  root.replaceChildren(h('div', { 'data-testid': TID.help.root }));
};

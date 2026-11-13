// @vitest-environment happy-dom
// L3: the left column (W-02) and the shell entries A6 owns (🛡, update watcher). Owner: A6.
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../ui/app';
import { TID } from '../../ui/testids';
import { click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

afterEach(() => { document.body.innerHTML = ''; });

describe('左栏（W-02）', () => {
  it('W-02 左栏切换 模型 / 设置 / 帮助', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const fake = fakeApi();
    const app = await createApp(document.getElementById('app')!, fake.api);
    expect(app.route()).toBe('models');
    click($(TID.shell.navSettings));
    await settle();
    expect($(TID.settings.root)).not.toBeNull();
    expect($(TID.shell.navSettings)!.getAttribute('aria-current')).toBe('page');
    click($(TID.shell.navHelp));
    await settle();
    expect($(TID.help.root)).not.toBeNull();
    expect($(TID.settings.root)).toBeNull();
    click($(TID.shell.navModels));
    await settle();
    expect(app.route()).toBe('models');
    click($(TID.shell.security));
    await settle();
    expect($(TID.security.root)).not.toBeNull();
    fake.emit('update', { version: '9.9.9', notes: '' });
    expect($(TID.update.root)).not.toBeNull();
  });
});

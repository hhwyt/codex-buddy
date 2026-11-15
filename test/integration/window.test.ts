// L2: the main window (W-01). Owner: A6. Electron is mocked: we check the options and the hardening.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const made: { opts: Record<string, unknown>; on: Record<string, (...a: unknown[]) => unknown>; once: Record<string, () => void>; openHandler?: () => unknown; loaded?: string; removeMenu: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn> }[] = [];

vi.mock('electron', () => ({
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 900, height: 600 } }) },
  BrowserWindow: class {
    removeMenu = vi.fn();
    show = vi.fn();
    showInactive = vi.fn();
    rec: (typeof made)[number];
    webContents: unknown;
    constructor(opts: Record<string, unknown>) {
      this.rec = { opts, on: {}, once: {}, removeMenu: this.removeMenu, show: this.show };
      made.push(this.rec);
      this.webContents = {
        on: (e: string, fn: (...a: unknown[]) => unknown) => { this.rec.on[e] = fn; },
        setWindowOpenHandler: (fn: () => unknown) => { this.rec.openHandler = fn; },
      };
    }
    once(e: string, fn: () => void) { this.rec.once[e] = fn; }
    loadFile(f: string) { this.rec.loaded = f; }
  },
}));

const { windowOptions, createMainWindow, WINDOW_SIZE } = await import('../../electron/main/window');

beforeEach(() => { made.length = 0; });

describe('窗口（W-01）', () => {
  it('W-01 Mac：没有标题栏，红绿灯嵌在左栏顶上', () => {
    const o = windowOptions('mac');
    expect(o.titleBarStyle).toBe('hiddenInset');
    expect(o.trafficLightPosition).toEqual({ x: 16, y: 18 });
    expect(o.titleBarOverlay).toBeUndefined();
    expect(o.backgroundColor).toBe('#ffffff');
  });

  it('W-01 Windows：没有标题栏，右上角是系统画的三个窗口按钮', () => {
    const o = windowOptions('win');
    expect(o.titleBarStyle).toBe('hidden');
    expect(o.titleBarOverlay).toMatchObject({ height: 40 });
    expect(o.trafficLightPosition).toBeUndefined();
  });

  it('W-01 页面跑在隔离的沙盒里，拿不到 Node', () => {
    const w = windowOptions('mac').webPreferences!;
    expect(w.contextIsolation).toBe(true);
    expect(w.sandbox).toBe(true);
    expect(w.nodeIntegration).toBe(false);
    expect(String(w.preload)).toMatch(/preload\.js$/);
  });

  it('正式包打不开 DevTools；仓库里跑可以', () => {
    expect(windowOptions('mac').webPreferences!.devTools).toBe(true);
    createMainWindow('win', { devTools: false });
    expect((made[0].opts.webPreferences as { devTools: boolean }).devTools).toBe(false);
  });

  it('W-01 小屏幕上窗口不超过屏幕；没有菜单；页面不能跳走、不能开新窗口；准备好才显示', () => {
    createMainWindow('mac');
    const w = made[0];
    expect(w.opts.width).toBe(Math.min(WINDOW_SIZE.width, 900));
    expect(w.opts.height).toBe(560);
    expect(w.removeMenu).toHaveBeenCalled();
    const e = { preventDefault: vi.fn() };
    w.on['will-navigate'](e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(w.openHandler!()).toEqual({ action: 'deny' });
    expect(w.show).not.toHaveBeenCalled();
    w.once['ready-to-show']();
    expect(w.show).toHaveBeenCalled();
    expect(w.loaded).toMatch(/ui[/\\]index\.html$/);
  });

  it('W-01 测试模式：窗口放在屏幕外、显示时不抢焦点、不进任务栏，正式运行照常显示', () => {
    const win = createMainWindow('win', { offscreen: true }) as unknown as { showInactive: ReturnType<typeof vi.fn> };
    const w = made[0];
    expect(w.opts).toMatchObject({ x: -30000, y: -30000, skipTaskbar: true });
    w.once['ready-to-show']();
    expect(win.showInactive).toHaveBeenCalled();
    expect(w.show).not.toHaveBeenCalled();
  });
});

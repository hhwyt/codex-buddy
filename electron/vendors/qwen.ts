// qwen: key capture uses the shared defaults in base.ts. Owner: A4.
// Login is told by Aliyun's login cookie: 百炼's console shows a logged-out visitor the same URL, and Aliyun's login page
// does not move on when already logged in (hwy-pc, 2026-11-13).
// Level-1 console API not set: the ladder starts at level 2 (user clicks「创建」on the official key page, the key is
// caught from the response).
import { providerOf } from '../core/providers';
import { makeVendor } from './base';

export const QWEN_LOGIN_COOKIE = { url: 'https://bailian.console.aliyun.com/', name: 'login_aliyunid_ticket' };
export const qwen = makeVendor(providerOf('qwen'), { loginCookie: QWEN_LOGIN_COOKIE });

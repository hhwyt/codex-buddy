// All vendors by id, in card order. Owner: A4.
import type { BuiltinVendorId } from '../core/types';
import { deepseek } from './deepseek';
import { hunyuan } from './hunyuan';
import { kimi } from './kimi';
import { minimax } from './minimax';
import { openai } from './openai';
import { qwen } from './qwen';
import type { Vendor } from './types';
import { zhipu } from './zhipu';

export const VENDORS: Record<BuiltinVendorId, Vendor> = { deepseek, zhipu, kimi, qwen, minimax, hunyuan, openai };

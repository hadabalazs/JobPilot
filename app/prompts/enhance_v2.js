import * as previous from './enhance_v1.js';
import { RESEARCH_RULES, contextText } from './ats_research_v1.js';
export const VERSION = 'enhance_v2';
export const systemText = () => previous.systemText() + '\n' + RESEARCH_RULES.join('\n');
export const userText = req => previous.userText(req) + contextText(req);
export const render = req => systemText() + '\n\n' + userText(req);

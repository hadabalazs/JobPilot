import * as previous from './batch_v1.js';
import { RESEARCH_RULES } from './ats_research_v1.js';
export const VERSION = 'batch_v2';
export const systemText = opts => previous.systemText(opts) + '\n' + RESEARCH_RULES.join('\n');
export const userText = req => previous.userText(req) + '\n# Recruiter context by job (priorities, not candidate evidence)\n' + JSON.stringify(req.items.map(it => ({ job_id: it.jobId, context: it.applicationContext || '' }))) + '\nKeep contexts separate and use only source CV facts.';
export const render = req => systemText(req.options) + '\n\n' + userText(req);

/** JD cleaning and deterministic metadata extraction. Paste-only intake; no fetching. */
import { JD_BOILERPLATE } from '../config.js';
const PAGE_CHROME = /^(?:\d+ notifications?|skip to main content|home|my network|jobs|messaging|notifications|me|for business|reactivate premium.*|jobs that match your profile|based on your profile and job criteria|date posted|in my network|learn more|\d+\s*[mhd]|\d+\/\d+|job moved to in progress.*)$/i;

export function jobTextWarnings(text) {
  const lines = String(text || '').split('\n');
  const count = lines.filter(l => PAGE_CHROME.test(l.trim())).length;
  return [count ? `${count} navigation/notification lines detected. Review the Job brief before tailoring.` : '', String(text || '').trim().length < 200 ? 'Short job description: paste the full responsibilities and requirements for a useful analysis.' : ''].filter(Boolean);
}

export function cleanJD(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());
  const out = [];
  for (const l of lines) {
    if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    if (JD_BOILERPLATE.some(rx => rx.test(l)) || PAGE_CHROME.test(l)) continue;
    if (l.length > 2000) { out.push(...l.split(/(?<=[.!?])\s+/)); continue; }
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Best-effort title/company/location/salary/deadline. The user corrects in the form. */
export function extractMeta(text) {
  const t = String(text || '');
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const meta = { title: '', company: '', location: '', salaryText: '', deadline: '' };
  const titleRx = /\b(manager|lead|head|director|engineer|analyst|architect|coach|consultant|owner|specialist|officer|scrum master|delivery)\b/i;
  const firstTitle = lines.slice(0, 6).find(l => l.length < 90 && titleRx.test(l) && !/^(about|responsibilities|requirements)/i.test(l));
  if (firstTitle) meta.title = firstTitle.replace(/\s*[-–|·].*$/, '').trim();
  const head = lines.slice(0, 8).join('\n');
  const co = head.match(/\b(?:at|join|with|At|Join|With)\s+([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+){0,3})/) || head.match(/^([A-Z][\w&.'-]+(?:\s+[A-Z][\w&.'-]+){0,3})\s*[-–|·]/m);
  if (co && !/^(C-level|Senior|Junior|Lead|Head)$/.test(co[1])) meta.company = co[1].replace(/[.,]$/, '');
  const cityRx = /\b(Dubai|Abu Dhabi|Sharjah|Riyadh|Doha|Manama|Muscat|London|Budapest|Remote|Hybrid)\b(?:,?\s*(UAE|United Arab Emirates|KSA|Saudi Arabia|Qatar|UK|Hungary))?/i;
  const loc = t.match(cityRx);
  if (loc) meta.location = loc[0];
  const sal = t.match(/(?:AED|USD|EUR|GBP|SAR|\$|€|£)\s?\d[\d,.]*(?:\s?[kK])?(?:\s?(?:-|–|to)\s?(?:AED|USD|EUR|GBP|SAR|\$|€|£)?\s?\d[\d,.]*(?:\s?[kK])?)?(?:\s?(?:per|\/)\s?(?:month|year|annum|mo|yr))?/);
  if (sal) meta.salaryText = sal[0];
  const dl = t.match(/(?:deadline|apply by|closing date|closes)[:\s]+([A-Za-z0-9 ,/-]{6,30})/i);
  if (dl) meta.deadline = dl[1].trim();
  return meta;
}

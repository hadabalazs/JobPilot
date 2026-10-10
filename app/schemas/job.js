/** Job record shape, statuses and legal transitions. */
export const STATUSES = ['inbox', 'scored', 'selected', 'tailored', 'ready', 'applied', 'screening', 'interviewing', 'offer', 'closed_won', 'closed_lost', 'withdrawn', 'archived'];
export const STATUS_LABELS = { inbox: 'Inbox', scored: 'Scored', selected: 'Selected', tailored: 'Tailored', ready: 'Ready', applied: 'Applied', screening: 'Screening', interviewing: 'Interviewing', offer: 'Offer', closed_won: 'Won', closed_lost: 'Lost', withdrawn: 'Withdrawn', archived: 'Archived' };
export const TRANSITIONS = {
  inbox: ['scored', 'selected', 'tailored', 'archived'],
  scored: ['selected', 'tailored', 'archived'],
  selected: ['inbox', 'scored', 'tailored', 'archived'],
  tailored: ['ready', 'applied', 'archived'],
  ready: ['applied', 'archived'],
  applied: ['screening', 'interviewing', 'closed_lost', 'withdrawn', 'archived'],
  screening: ['interviewing', 'closed_lost', 'withdrawn', 'archived'],
  interviewing: ['offer', 'closed_lost', 'withdrawn', 'archived'],
  offer: ['closed_won', 'closed_lost', 'withdrawn', 'archived'],
  closed_won: ['archived'], closed_lost: ['archived'], withdrawn: ['archived'], archived: ['inbox'],
};
export const BOARD_COLUMNS = ['inbox', 'scored', 'selected', 'tailored', 'ready', 'applied', 'screening', 'interviewing', 'offer', 'closed_won', 'closed_lost', 'withdrawn'];
export function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }
export function validateJob(j) {
  const errors = [];
  if (!j || typeof j !== 'object') return { ok: false, errors: ['job must be an object'] };
  if (!j.id) errors.push('id required');
  if (!j.title) errors.push('title required');
  if (!j.jdClean) errors.push('jdClean required');
  if (!STATUSES.includes(j.status)) errors.push(`invalid status ${j.status}`);
  return { ok: errors.length === 0, errors };
}

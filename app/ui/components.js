/** Shared UI primitives (Preact + htm, no build). */
import { h, cloneElement, toChildArray } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import htm from 'htm';
export const html = htm.bind(h);

export const Chip = ({ kind = '', children }) => html`<span class="chip ${kind}">${children}</span>`;
export const ScoreBar = ({ value }) => html`<span class="score-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, value || 0))}%"></i></span>`;
export const Note = ({ kind = 'info', children }) => html`<div class="note ${kind}" role=${kind === 'bad' ? 'alert' : 'status'}>${children}</div>`;

let fieldCounter = 0;
export function Field({ label, hint, children }) {
  const [id] = useState(() => `field-${++fieldCounter}`);
  const controls = toChildArray(children).map(child => child && ['input', 'textarea', 'select'].includes(child.type) ? cloneElement(child, { id: child.props.id || id, 'aria-labelledby': id + '-label', 'aria-describedby': hint ? id + '-hint' : undefined }) : child);
  return html`<div class="field"><label id=${id + '-label'} for=${id}>${label}</label>${controls}${hint ? html`<span id=${id + '-hint'} class="hint">${hint}</span>` : null}</div>`;
}

let toastPush = null;
export function toast(msg, kind = '') { if (toastPush) toastPush({ msg, kind, id: Math.random() }); }
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => { toastPush = t => { setItems(x => [...x, t]); setTimeout(() => setItems(x => x.filter(i => i.id !== t.id)), 3200); }; return () => { toastPush = null; }; }, []);
  return html`<div class="toast-host">${items.map(t => html`<div key=${t.id} class="toast ${t.kind}">${t.msg}</div>`)}</div>`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; }
}
export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function readFileText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
export const fmtDateTime = iso => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
export const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

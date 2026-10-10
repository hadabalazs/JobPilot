/** RenderModel → standalone HTML document (used for preview iframe and print/Save as PDF). */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderCvHtml(m, css, opts = {}) {
  const hl = opts.highlightIds instanceof Set ? opts.highlightIds : new Set(opts.highlightIds || []);
  const notes = opts.notes || {};                       // bulletId -> short reason
  const mark = id => (hl.has(id) ? ' class="tailored"' : '');
  const why = id => (notes[id] ? `<span class="why">${esc(notes[id])}</span>` : '');
  const id = m.identity;
  const contact = [id.location, id.email, id.phone, ...(id.links || []).map(l => l.url)].filter(Boolean);
  const langs = (m.languages || []).map(l => `${l.name}${l.level ? ` (${l.level})` : ''}`).join(', ');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(id.full_name)} — CV</title><style>${css}</style></head><body><div class="page">
<header class="id"><h1>${esc(id.full_name)}</h1><p class="headline">${esc(id.headline)}</p><p class="contact">${contact.map(c => `<span>${esc(c)}</span>`).join('')}</p></header>
${m.summary ? `<h2>Summary</h2><p${opts.highlightSummary ? ' class="tailored"' : ''}>${esc(m.summary)}</p>` : ''}
${m.skills.length ? `<h2>Skills</h2><div class="skills${opts.highlightSkills ? ' tailored' : ''}">${m.skills.map(g => `<p><b>${esc(g.label)}:</b> ${esc((g.items || []).join(', '))}</p>`).join('')}</div>` : ''}
<h2>Work Experience</h2>
${m.experience.map(e => `<div class="role"><div class="head"><div class="role-info"><div><span class="title">${esc(e.title)}</span></div><div class="employer">· ${esc(e.employer)}${e.location ? `, ${esc(e.location)}` : ''}</div></div><div class="dates">${esc(e.dates)}</div></div>${e.context ? `<div class="context">${esc(e.context)}</div>` : ''}<ul>${e.bullets.map(b => `<li${mark(b.id)}>${esc(b.text)}${why(b.id)}</li>`).join('')}</ul></div>`).join('')}
${m.education.length ? `<h2>Education</h2>${m.education.map(e => `<div class="edu"><b>${esc(e.degree)}</b> · ${esc(e.institution)}${e.end ? ` <span class="dates">(${esc(e.start ? e.start + '–' : '')}${esc(e.end)})</span>` : ''}</div>`).join('')}` : ''}
${m.certifications.length ? `<h2>Certifications</h2>${m.certifications.map(c => `<div class="cert">${esc(c.name)}${c.issuer ? ` · ${esc(c.issuer)}` : ''}${c.year ? ` (${esc(c.year)})` : ''}</div>`).join('')}` : ''}
${langs ? `<h2>Languages</h2><p>${esc(langs)}</p>` : ''}
${m.cover ? `<section class="cover${opts.highlightCover ? ' tailored' : ''}"><h1 style="font-size:16pt;margin:0 0 10pt">${esc(id.full_name)}</h1><div class="to">${esc(m.cover.company || '')}${m.cover.title ? ` · ${esc(m.cover.title)}` : ''}</div><p><b>${esc(m.cover.subject)}</b></p><p>Dear Hiring Manager,</p>${m.cover.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}<p>Kind regards,<br>${esc(id.full_name)}</p></section>` : ''}
</div></body></html>`;
}

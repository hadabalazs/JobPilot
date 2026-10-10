/**
 * True one-click PDF generation (a real downloadable file, no print dialog).
 * Lazy-loads the vendored jsPDF UMD build and lays out the CV with real vector
 * text — selectable and ATS-parseable, same as the print/HTML path, just
 * produced as a Blob instead of relying on "Save as PDF" in a print dialog.
 */
let loadPromise = null;
function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // resolve against this module, not the page — the page may not be at the app root
    s.src = new URL('../../vendor/jspdf.umd.min.js', import.meta.url).href;
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF loaded but window.jspdf.jsPDF is missing')));
    s.onerror = () => reject(new Error(`Could not load ${s.src}`));
    document.head.appendChild(s);
  });
  return loadPromise;
}

const PAGE = { w: 595.28, h: 841.89, margin: 46 };
const INK = [17, 17, 17], MUTED = [90, 90, 90], ACCENT = [31, 95, 63], RULE = [200, 200, 200];

/**
 * Keep role metadata and dates in separate lanes. The old inline title + employer
 * layout let a long employer/location string draw underneath the right-aligned
 * dates in a direct jsPDF download.
 */
export function roleHeaderLayout({ title = '', employer = '', location = '', dates = '' }, leftWidth, split) {
  const meta = `· ${employer}${location ? `, ${location}` : ''}`;
  return {
    titleLines: split(String(title), leftWidth),
    metaLines: meta === '· ' ? [] : split(meta, leftWidth),
    dates: String(dates),
  };
}

/** @returns {Promise<Blob>} */
export async function buildPdfBlob(model) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const cw = PAGE.w - PAGE.margin * 2;
  let y = PAGE.margin;

  const newPage = () => { doc.addPage(); y = PAGE.margin; };
  const ensure = need => { if (y + need > PAGE.h - PAGE.margin) newPage(); };
  const setStyle = (size, style = 'normal', color = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
  const para = (text, { size = 9.5, style = 'normal', color = INK, gap = 10, lineGap = 1.32 } = {}) => {
    if (!text) return;
    setStyle(size, style, color);
    const lines = doc.splitTextToSize(text, cw);
    ensure(lines.length * size * lineGap + gap);
    for (const l of lines) { doc.text(l, PAGE.margin, y); y += size * lineGap; }
    y += gap;
  };
  const bullet = (text, { size = 9.5, indent = 12, color = INK, lineGap = 1.32 } = {}) => {
    setStyle(size, 'normal', color);
    const lines = doc.splitTextToSize(text, cw - indent);
    ensure(lines.length * size * lineGap + 3);
    doc.text('•', PAGE.margin, y);
    for (const l of lines) { doc.text(l, PAGE.margin + indent, y); y += size * lineGap; }
    y += 2.5;
  };
  const heading = text => {
    ensure(24);
    y += 6;
    setStyle(10.5, 'bold', ACCENT);
    doc.text(text.toUpperCase(), PAGE.margin, y);
    y += 3;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.6);
    doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
    y += 12;
  };
  const rightCol = (right, { size = 9.5, style = 'normal', color = MUTED } = {}) => {
    setStyle(size, style, color);
    const rw = doc.getTextWidth(right);
    doc.text(right, PAGE.w - PAGE.margin - rw, y);
  };

  // Identity
  const id = model.identity;
  ensure(60);
  setStyle(20, 'bold', INK); doc.text(id.full_name || '', PAGE.margin, y); y += 22;
  if (id.headline) { setStyle(11, 'normal', MUTED); doc.text(id.headline, PAGE.margin, y); y += 15; }
  const contact = [id.location, id.email, id.phone, ...(id.links || []).map(l => l.url)].filter(Boolean).join('   ·   ');
  if (contact) { para(contact, { size: 9, color: MUTED, gap: 6 }); }
  doc.setDrawColor(...INK); doc.setLineWidth(1); doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y); y += 14;

  if (model.summary) { heading('Summary'); para(model.summary); }

  if (model.skills.length) { heading('Skills'); for (const g of model.skills) para(`${g.label}: ${(g.items || []).join(', ')}`, { gap: 4 }); y += 4; }

  if (model.experience.length) {
    heading('Work Experience');
    for (const e of model.experience) {
      // Reserve the right date column before wrapping the left metadata. This
      // makes overflow impossible even for a long company, city or role title.
      setStyle(9.5, 'normal', MUTED);
      const dateWidth = doc.getTextWidth(e.dates || '');
      const leftWidth = Math.max(180, cw - dateWidth - 18);
      const header = roleHeaderLayout(e, leftWidth, (text, width) => doc.splitTextToSize(text, width));
      const headerHeight = Math.max(header.titleLines.length * 12.5 + header.metaLines.length * 11.5, 13);
      ensure(headerHeight + 10);
      setStyle(10.5, 'bold', INK);
      header.titleLines.forEach(line => { doc.text(line, PAGE.margin, y); y += 12.5; });
      // Dates share the first title baseline, but never the left text lane.
      const dateY = y - header.titleLines.length * 12.5;
      const savedY = y; y = dateY; rightCol(header.dates, { size: 9.5 }); y = savedY;
      if (header.metaLines.length) {
        setStyle(9.5, 'normal', MUTED);
        header.metaLines.forEach(line => { doc.text(line, PAGE.margin, y); y += 11.5; });
      }
      y += 2;
      if (e.context) { setStyle(9, 'italic', MUTED); const cl = doc.splitTextToSize(e.context, cw); ensure(cl.length * 12); for (const l of cl) { doc.text(l, PAGE.margin, y); y += 11.5; } y += 2; }
      for (const b of e.bullets) bullet(b.text);
      y += 4;
    }
  }
  if (model.education.length) { heading('Education'); for (const e of model.education) para(`${e.degree}  ·  ${e.institution}${e.end ? `  (${e.start ? e.start + '–' : ''}${e.end})` : ''}`, { gap: 3 }); }
  if (model.certifications.length) { heading('Certifications'); for (const c of model.certifications) para(`${c.name}${c.issuer ? `  ·  ${c.issuer}` : ''}${c.year ? `  (${c.year})` : ''}`, { gap: 3 }); }
  if ((model.languages || []).length) { heading('Languages'); para((model.languages || []).map(l => `${l.name}${l.level ? ` (${l.level})` : ''}`).join(', ')); }

  if (model.cover) {
    newPage();
    setStyle(16, 'bold', INK); doc.text(id.full_name || '', PAGE.margin, y); y += 20;
    setStyle(9.5, 'normal', MUTED); doc.text([model.cover.company, model.cover.title].filter(Boolean).join('  ·  '), PAGE.margin, y); y += 20;
    if (model.cover.subject) para(model.cover.subject, { style: 'bold', gap: 12 });
    para('Dear Hiring Manager,', { gap: 10 });
    for (const p of model.cover.paragraphs) para(p, { gap: 9 });
    para(`Kind regards,\n${id.full_name || ''}`, { gap: 0 });
  }

  return doc.output('blob');
}

/** Build a separate, clean cover-letter PDF with selectable vector text. */
export async function buildCoverLetterPdfBlob(model) {
  if (!model?.cover) throw new Error('This tailoring run does not include a cover letter.');
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
  const cw = PAGE.w - PAGE.margin * 2;
  const id = model.identity || {};
  const cover = model.cover;
  let y = PAGE.margin;

  const newPage = () => { doc.addPage(); y = PAGE.margin; };
  const ensure = need => { if (y + need > PAGE.h - PAGE.margin) newPage(); };
  const setStyle = (size, style = 'normal', color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const para = (text, { size = 10.5, style = 'normal', color = INK, gap = 12, lineGap = 1.45 } = {}) => {
    if (!text) return;
    setStyle(size, style, color);
    const lines = doc.splitTextToSize(String(text), cw);
    ensure(lines.length * size * lineGap + gap);
    for (const line of lines) {
      doc.text(line, PAGE.margin, y);
      y += size * lineGap;
    }
    y += gap;
  };

  setStyle(19, 'bold');
  doc.text(id.full_name || '', PAGE.margin, y);
  y += 22;
  const contact = [id.location, id.email, id.phone].filter(Boolean).join('   ·   ');
  if (contact) para(contact, { size: 9.5, color: MUTED, gap: 7 });
  doc.setDrawColor(...INK);
  doc.setLineWidth(1);
  doc.line(PAGE.margin, y, PAGE.w - PAGE.margin, y);
  y += 28;

  const recipient = [cover.company, cover.title].filter(Boolean).join(' — ');
  if (recipient) para(recipient, { size: 10.5, style: 'bold', gap: 16 });
  if (cover.subject) para(`Subject: ${cover.subject}`, { style: 'bold', gap: 18 });
  para('Dear Hiring Manager,', { gap: 14 });
  for (const paragraph of cover.paragraphs || []) para(paragraph, { gap: 13 });
  para(`Kind regards,\n${id.full_name || ''}`, { gap: 0 });

  return doc.output('blob');
}

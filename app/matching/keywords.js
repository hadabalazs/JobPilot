/** Deterministic keyword extraction from a JD, using the CV's competency vocabulary. */
const STOP = new Set('a an the and or of to in on for with at by from as is are be will you your our we this that these those it its their they them can may must should have has had not no than more most very into over under about across within without per each all any some such other than also etc including includes include ability able strong excellent good great proven experience experienced years year skills skill knowledge working work team teams role roles business company candidate ideal required requirement requirements responsibilities responsibility responsible ensure ensuring support supporting supports manage managing management develop developing development'.split(' '));

export function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9+#./ -]/g, ' ').split(/\s+/).filter(Boolean);
}
function ngrams(tokens, n) { const out = []; for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' ')); return out; }

/** Split JD into requirement-ish sections to weight "must" lines higher. */
export function sectionWeights(jd) {
  const lines = String(jd || '').split('\n');
  let w = 1, out = [];
  for (const l of lines) {
    const h = l.trim().toLowerCase();
    if (/^(requirements?|qualifications?|what you('|’)ll need|must[- ]have|essential|you have|skills? (and|&) experience)/.test(h)) w = 2;
    else if (/^(nice to have|preferred|desirable|bonus|good to have)/.test(h)) w = 1.2;
    else if (/^(responsibilities|what you('|’)ll do|about the role|the role|duties)/.test(h)) w = 1.5;
    else if (/^(about (us|the company)|benefits|what we offer|perks)/.test(h)) w = 0.3;
    out.push({ line: l, weight: w });
  }
  return out;
}

/**
 * @returns {{ terms: Array<{term:string, weight:number, source:'alias'|'skill'|'phrase'}>, competencyHits: Record<string, number> }}
 */
/** Terms that describe a JD rather than a skill; never worth matching on. */
const GENERIC = new Set('role team teams company business client clients customer customers project projects product products service services process processes work working years year new great strong excellent good ability able experience experienced knowledge skills understanding support ensure ensuring deliver delivering delivery drive driving manage managing management lead leading build building work across within using use used including help helping join looking seeking candidate candidates opportunity opportunities environment organisation organization'.split(' '));

export function extractKeywords(jd, cv) {
  const weighted = sectionWeights(jd);
  const termScore = new Map();
  const competencyHits = {};
  const bump = (term, w, source) => {
    const cur = termScore.get(term) || { term, weight: 0, source };
    cur.weight += w; if (source === 'alias') cur.source = 'alias';
    termScore.set(term, cur);
  };
  const aliasMap = [];
  for (const c of cv?.competencies || []) for (const a of [c.label, ...(c.aliases || [])]) aliasMap.push({ alias: a.toLowerCase(), cid: c.id, label: c.label });
  const skillSet = new Set((cv?.skills?.groups || []).flatMap(g => g.items || []).map(s => s.toLowerCase()));
  for (const { line, weight } of weighted) {
    const low = line.toLowerCase();
    for (const { alias, cid } of aliasMap) {
      if (alias.length >= 3 && new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(low)) {
        bump(alias, weight, 'alias'); competencyHits[cid] = (competencyHits[cid] || 0) + weight;
      }
    }
    for (const s of skillSet) if (s.length >= 2 && low.includes(s)) bump(s, weight * 0.8, 'skill');
    const toks = tokenize(line).filter(t => !STOP.has(t) && t.length > 2);
    // Single words carry most technical signal (Spark, Airflow, SQL, underwriting…)
    for (const t of toks) if (!GENERIC.has(t) && t.length > 3) bump(t, weight * 0.5, 'phrase');
    for (const g of ngrams(toks, 2)) { const parts = g.split(' '); if (parts.every(x => !STOP.has(x) && !GENERIC.has(x))) bump(g, weight * 0.35, 'phrase'); }
  }
  const terms = [...termScore.values()].filter(t => t.source !== 'phrase' || t.weight >= 0.6).sort((a, b) => b.weight - a.weight).slice(0, 80);
  return { terms, competencyHits };
}

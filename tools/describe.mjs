// Builds the per-structure text shown in the detail panel, in English and
// Portuguese, from verified sources only:
//   * names      — Wikidata (property P1402 -> FMA), sitelink title or label
//   * paragraphs — Wikipedia lead sections in each language
//   * fallback   — a sentence derived from the FMA hierarchy itself
// Nothing is machine-translated. A structure with no verified Portuguese name
// gets one derived mechanically from the English by tools/pt-derive.mjs, marked
// as derived so the interface can say the name is not verified.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';
import { derivePtName } from './pt-derive.mjs';

const MAX_CHARS = 340;
const MAX_DESC_DIST = 3;   // how far up the is-a tree a paragraph may come from

export function loadSources() {
  const rd = f => (fs.existsSync(path.join(ROOT, 'data', f))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')) : {});
  return { wikidata: rd('wikidata.json'), wikipedia: rd('wikipedia.json') };
}

// Trim a Wikipedia lead to a couple of clean sentences.
export function trimExtract(text) {
  if (!text) return null;
  const t = text
    .replace(/\s*\([^)]*(?:Latin|Greek|IPA|pronoun|listen|from the|do latim|em latim)[^)]*\)/gi, '')
    // Pronunciation and inflection notes: "(; pl.: femora)", "(, plural ...)".
    .replace(/\s*\(\s*[;,][^)]*\)/g, '')
    .replace(/\s*\([^)]*\bpl\.?:[^)]*\)/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (t.length <= MAX_CHARS) return t;
  const cut = t.slice(0, MAX_CHARS);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > 120 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`).trim();
}

const MASCULINE_IN_A = new Set(['sistema', 'problema', 'diafragma', 'estroma', 'plasma']);
function withSide(ptName, side) {
  const head = ptName.trim().split(/\s+/)[0].toLowerCase();
  const feminine = head.endsWith('a') && !MASCULINE_IN_A.has(head);
  return `${ptName} ${side === 'right' ? (feminine ? 'direita' : 'direito')
    : (feminine ? 'esquerda' : 'esquerdo')}`;
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const sideOf = n => (/^left\s+/i.test(n) ? 'left' : /^right\s+/i.test(n) ? 'right' : null);
const stripSide = n => n.replace(/^(left|right)\s+/i, '').trim();
const norm = s => s.toLowerCase().replace(/\s+\((muscle|bone|artery|vein|nerve|anatomy)\)$/, '')
  .replace(/\s+(muscle|bone)$/, '').replace(/[^a-z0-9 ]/g, '').trim();

// First concept in the chain for which `pick` yields something usable.
function findHit(chain, chainNames, wikidata, pick) {
  for (let i = 0; i < chain.length; i++) {
    const e = wikidata[chain[i]];
    const value = e && pick(e);
    if (value) return { i, entry: e, value, name: chainNames[i] ?? null };
  }
  return null;
}

export function describePart(part, { wikidata, wikipedia }, systemInfo) {
  const { chain, chainNames = [], name, system, isaParent, partofParent } = part;
  const side = sideOf(name);
  const bare = norm(stripSide(name));

  // ---- Portuguese name ----
  // Accept a name from an ancestor only when the two differ by side alone;
  // otherwise the ancestor names a different (broader) structure.
  const ptHit = findHit(chain, chainNames, wikidata, e => e.pt || e.ptLabel);
  let namePt = null;
  let namePtDerived = false;
  if (ptHit) {
    const matches = ptHit.i === 0 || (ptHit.name && norm(ptHit.name) === bare)
      || norm(ptHit.entry.enLabel ?? '') === bare || norm(ptHit.entry.en ?? '') === bare;
    if (matches) {
      const base = cap(ptHit.value);
      namePt = side && ptHit.i > 0 ? withSide(base, side) : base;
    }
  }
  // No verified name: derive one from the vocabulary, and say that it is derived.
  if (!namePt) {
    const derived = derivePtName(name);
    if (derived) { namePt = derived.name; namePtDerived = true; }
  }

  // ---- paragraphs ----
  const enHit = findHit(chain, chainNames, wikidata, e => e.en);
  const ptArticle = findHit(chain, chainNames, wikidata, e => e.pt);
  const enText = enHit && enHit.i <= MAX_DESC_DIST ? trimExtract(wikipedia[`en:${enHit.value}`]) : null;
  const ptText = ptArticle && ptArticle.i <= MAX_DESC_DIST ? trimExtract(wikipedia[`pt:${ptArticle.value}`]) : null;

  const structural = isaParent
    ? `${cap(name)} is ${article(isaParent)} ${isaParent}${partofParent ? `, part of the ${partofParent}` : ''}.`
    : null;

  return {
    namePt,
    namePtDerived,
    descEn: enText ?? structural ?? systemInfo.en[system],
    descPt: ptText ?? systemInfo.pt[system],
    srcEn: enText ? { t: enHit.value, exact: enHit.i === 0 } : null,
    srcPt: ptText ? { t: ptArticle.value, exact: ptArticle.i === 0 } : null,
    wd: (ptHit ?? enHit)?.entry.q ?? null,
  };
}

const article = w => (/^[aeiou]/i.test(w) ? 'an' : 'a');

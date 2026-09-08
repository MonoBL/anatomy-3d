// Derives a Portuguese name from a BodyParts3D English one, mechanically.
//
// It is not a translator and does not pretend to be: it knows the vocabulary
// (tools/pt-terms.mjs), it knows that Portuguese puts the noun first and makes
// its adjectives agree, and it refuses the job when too much of the phrase is
// vocabulary it has never seen. Everything it does produce is marked as
// derived in the atlas, so the interface can say the name is not verified.
//
// "Posterior Segmental Branch of Right Hepatic Artery"
//   -> "Ramo segmentar posterior da artéria hepática direita"

import { COMPOUNDS, NOUNS, ADJECTIVES, ORDINALS, KEEP } from './pt-terms.mjs';

const SIDES = { left: 'left', right: 'right' };

// At least this share of a segment's words has to be known vocabulary.
const MIN_KNOWN = 0.7;

const form = (entry, gender) => (Array.isArray(entry) ? entry[gender === 'f' ? 1 : 0] : entry);

// "of the left hepatic artery" -> the contraction Portuguese actually uses.
function contract(gender, plural) {
  if (plural) return gender === 'f' ? 'das' : 'dos';
  return gender === 'f' ? 'da' : 'do';
}

const isPlural = word => /s$/.test(word) && !/^(pâncreas|hálux|fórnix|pénis|ázigos|hemiázigos)$/.test(word);

// Portuguese plurals, for the handful of collective heads ("set of ...").
function pluralize(word) {
  if (/\s/.test(word) || /s$/.test(word)) return word;      // phrases and already-plural
  if (/[rz]$/.test(word)) return `${word}es`;                // palmar -> palmares
  if (/m$/.test(word)) return `${word.slice(0, -1)}ns`;      // comum -> comuns
  if (/al$|el$|ol$|ul$/.test(word)) return `${word.slice(0, -1)}is`;   // cervical -> cervicais
  if (/il$/.test(word)) return `${word.slice(0, -2)}is`;     // grácil -> gráceis is irregular; close enough
  return `${word}s`;
}

// Longest-first so "flexor digitorum" wins over "flexor".
const COMPOUND_KEYS = Object.keys(COMPOUNDS).sort((a, b) => b.length - a.length);

// One segment: a noun phrase with no "of" in it. `extra` holds compounds the
// caller supplies — the verified muscle names, which must win over the
// built-in vocabulary.
function segment(words, extra = null) {
  const lower = words.map(w => w.toLowerCase());
  const phrase = lower.join(' ');
  const sides = [];
  const ordinals = [];
  const adjectives = [];
  let noun = null, gender = 'm', known = 0, total = 0;
  let rest = phrase;

  // Side words are pulled out wherever they appear; in Portuguese they go last.
  for (const side of Object.keys(SIDES)) {
    const re = new RegExp(`\\b${side}\\b`, 'g');
    if (re.test(rest)) {
      sides.push(side);
      rest = rest.replace(re, ' ');
      known++; total++;
    }
  }

  // A caller-supplied name first: it is verified, the vocabulary is not.
  let usedExtra = false;
  if (extra) {
    for (const key of Object.keys(extra).sort((a, b) => b.length - a.length)) {
      if (!rest.includes(key)) continue;
      const [pt, g] = extra[key];
      rest = rest.replace(key, ' ');
      const count = key.split(/\s+/).length;
      known += count; total += count;
      usedExtra = true;
      if (!noun) { noun = pt; gender = g; } else { adjectives.push(pt); }
      break;
    }
  }

  // Then any multi-word term, which may itself be the head noun.
  for (const key of COMPOUND_KEYS) {
    if (!rest.includes(key)) continue;
    const [pt, g] = COMPOUNDS[key];
    rest = rest.replace(key, ' ');
    const count = key.split(/\s+/).length;
    known += count; total += count;
    if (!noun) { noun = pt; gender = g; } else { adjectives.push(pt); }
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  // The head noun is the last word English leaves it on, so scan from the end.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const w = tokens[i];
    total++;
    if (!noun && NOUNS[w]) {
      const [pt, g] = NOUNS[w];
      noun = pt; gender = g; known++;
      tokens.splice(i, 1);
      break;
    }
  }
  // Everything left is a modifier.
  for (const w of tokens) {
    if (ORDINALS[w]) { ordinals.push(w); known++; continue; }
    if (ADJECTIVES[w]) { adjectives.push(w); known++; continue; }
    if (NOUNS[w]) { adjectives.push(NOUNS[w][0]); known++; continue; }
    if (KEEP.has(w)) { adjectives.push(w); known++; continue; }
    adjectives.push(w);          // unknown: kept as it is, and counted against
  }
  total = Math.max(total, lower.length);

  if (!noun) return null;
  const plural = isPlural(noun);
  const out = [noun];
  // English stacks its modifiers outside-in; Portuguese reads them the other
  // way round ("Upper Secondary Canine Tooth" -> "dente canino secundário
  // superior"), so the list is reversed before it is written out.
  for (const a of [...adjectives].reverse()) {
    const entry = ADJECTIVES[a] ?? a;
    let word = form(entry, gender);
    if (plural) word = pluralize(word);
    out.push(word);
  }
  for (const o of ordinals) out.unshift(form(ORDINALS[o], gender));
  for (const s of sides) {
    const word = form(ADJECTIVES[s], gender);
    out.push(plural ? pluralize(word) : word);
  }
  return { text: out.join(' '), gender, plural, known, total, usedExtra };
}

export function derivePtName(englishName, { extra = null } = {}) {
  if (!englishName) return null;
  // "Set of ..." and "... Tree" are collection names in BP3D; they translate
  // like anything else, so nothing special is needed here.
  const parts = englishName.split(/\s+of\s+(?:the\s+)?/i);
  const segments = parts.map(p => segment(p.split(/\s+/), extra));
  if (segments.some(s => !s)) return null;

  let known = 0, total = 0;
  for (const s of segments) { known += s.known; total += s.total; }
  if (total === 0 || known / total < MIN_KNOWN) return null;

  let text = segments[0].text;
  for (let i = 1; i < segments.length; i++) {
    const s = segments[i];
    text += ` ${contract(s.gender, s.plural)} ${s.text}`;
  }
  // One capital at the front, the rest lower case, as anatomical names go.
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return {
    name: text.replace(/\s+/g, ' ').trim(),
    confidence: known / total,
    usedExtra: segments.some(s => s.usedExtra),
  };
}

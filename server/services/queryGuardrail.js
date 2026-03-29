/**
 * queryGuardrail.js — Pre-retrieval query classification and content filtering.
 *
 * Three-tier classification:
 *   "blocked"   — Abusive, vulgar, or dehumanizing language targeting Islam/Muslims.
 *                 Returns an immediate canned response. No API calls are made.
 *   "off_topic" — Query has no apparent connection to Islam, Islamic practice, or
 *                 the topics this app covers. Returns a gentle redirect.
 *   "on_topic"  — Passes through to the normal RAG pipeline.
 *
 * Design notes:
 *   - This is a lightweight heuristic filter, NOT an LLM-based classifier.
 *     It's intentionally conservative: borderline queries pass through and are
 *     handled by the hardened system prompt in generateAnswer().
 *   - "Why do people think Islam promotes violence?" is a LEGITIMATE educational
 *     question and must NOT be blocked. Only clearly abusive content is blocked.
 *   - The off-topic check uses keyword presence, not semantic similarity. It runs
 *     BEFORE any embeddings or Qdrant calls so it costs zero API usage.
 */

'use strict';

// ─── Abusive / hostile patterns ──────────────────────────────────────────────
// Only match genuinely abusive content: slurs, profanity, or dehumanizing
// language directly combined with Islamic terms. Questions about misconceptions
// (even awkwardly phrased) are NOT blocked — the LLM prompt handles those.

const PROFANITY = /\b(f+u+c+k|sh[i1]+t|a+ss+h+o+le|b[i1]+tch|d[i1]+ck|c+u+nt|stfu|wtf|lmao\s*f)\b/i;
const SLURS = /\b(sand\s*n[i1]+gg|rag\s*head|towel\s*head|goat\s*f|camel\s*jock|muzzie|muzz[iy]e?s)\b/i;
const DEHUMANIZE_ISLAM = /\b(muslim|islam|arab|mosque|quran|allah|prophet)\w*\b.*\b(cancer|plague|disease|vermin|cockroach|animal|dog|pig|ape|monkey|subhuman|inbred)\b/i;
const DEHUMANIZE_REVERSE = /\b(cancer|plague|disease|vermin|cockroach|animal|subhuman|inbred)\b.*\b(muslim|islam|arab|mosque|quran|allah|prophet)\w*\b/i;
const THREAT = /\b(kill|bomb|nuke|destroy|eradicate|exterminate|wipe\s*out|eliminate)\b.*\b(muslim|islam|mosque|arab)\w*\b/i;
const THREAT_REVERSE = /\b(muslim|islam|mosque|arab)\w*\b.*\b(kill|bomb|nuke|destroy|eradicate|exterminate|wipe\s*out|eliminate)\b.*\b(all|every|them)\b/i;

const HOSTILE_PATTERNS = [PROFANITY, SLURS, DEHUMANIZE_ISLAM, DEHUMANIZE_REVERSE, THREAT, THREAT_REVERSE];

// ─── Islamic topic keywords ──────────────────────────────────────────────────
// If the query contains at least one of these, it's plausibly on-topic and goes
// straight to the pipeline. Kept broad on purpose — false negatives (letting an
// off-topic query through) are harmless; false positives (blocking a legit
// question) are bad.

const ISLAMIC_KEYWORDS = new Set([
  'islam', 'islamic', 'muslim', 'muslims', 'quran', 'quranic', 'hadith',
  'sunnah', 'prophet', 'muhammad', 'allah', 'salah', 'prayer', 'prayers',
  'zakat', 'fasting', 'fast', 'ramadan', 'eid', 'hajj', 'umrah',
  'mosque', 'masjid', 'imam', 'sheikh', 'shaykh', 'scholar',
  'fatwa', 'halal', 'haram', 'tawheed', 'tawhid', 'aqeedah', 'aqidah',
  'fiqh', 'sharia', 'shariah', 'dua', 'wudu', 'wudhu', 'ablution',
  'jannah', 'jahannam', 'pillar', 'pillars', 'faith', 'hijab', 'niqab',
  'nikah', 'salam', 'dawah', 'daawah', 'jihad', 'ummah',
  'seerah', 'sirah', 'tafsir', 'fitr', 'adha', 'charity',
  'worship', 'deen', 'din', 'hadeeth', 'bidah', 'shirk',
  'tawbah', 'repentance', 'jummah', 'jumuah', 'friday',
  'angels', 'qadr', 'decree', 'afterlife', 'resurrection',
  'companions', 'sahaba', 'salafi', 'salafiyyah', 'sunnah',
  'khutbah', 'sermon', 'ayah', 'surah', 'verse', 'revelation',
  'makkah', 'mecca', 'madinah', 'medina', 'kaaba',
  'tarawih', 'tahajjud', 'dhikr', 'istighfar', 'taqwa',
  'khalifah', 'caliphate', 'shura', 'janazah', 'funeral',
  'ruqyah', 'evil eye', 'sihr', 'jinn', 'qareen',
  'zakah', 'sadaqah', 'fitrah', 'kaffarah', 'expiation',
  'muadhin', 'adhan', 'athan', 'iqamah',
  'haya', 'modesty', 'akhlaq', 'manners', 'adab',
  'nabi', 'rasul', 'messenger', 'prophets',
  'believer', 'believers', 'disbelief', 'kufr', 'munafiq',
  'religion', 'religious', 'god', 'lord', 'creator', 'merciful',
]);

const BLOCKED_RESPONSE = {
  answer: 'This question contains language that is disrespectful or harmful. '
    + 'This platform is dedicated to providing authentic Islamic knowledge in a respectful environment. '
    + 'If you have a sincere question about Islam, please rephrase it respectfully and we will be happy to help.',
  confidence: 0,
  classification: 'blocked',
};

const OFF_TOPIC_RESPONSE = {
  answer: 'This question doesn\'t appear to be related to Islam or Islamic topics. '
    + 'This platform specializes in answering questions about Islamic knowledge, practice, and beliefs '
    + 'based on the Quran and Sunnah from trusted scholarly sources. '
    + 'Try asking something like "What is the meaning of Eid al-Fitr?" or "What are the pillars of Islam?"',
  confidence: 0,
  classification: 'off_topic',
};

/**
 * Classify a query before it enters the RAG pipeline.
 *
 * @param {string} query — raw user query
 * @returns {{ classification: 'on_topic'|'off_topic'|'blocked', response: object|null }}
 *   If classification is "on_topic", response is null — proceed with the pipeline.
 *   Otherwise, response contains { answer, confidence, classification } to return immediately.
 */
function classifyQuery(query) {
  const q = String(query || '').trim();
  if (!q) {
    return { classification: 'off_topic', response: OFF_TOPIC_RESPONSE };
  }

  const lower = q.toLowerCase();

  for (const pattern of HOSTILE_PATTERNS) {
    if (pattern.test(lower)) {
      return { classification: 'blocked', response: BLOCKED_RESPONSE };
    }
  }

  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const hasIslamicKeyword = words.some((w) => ISLAMIC_KEYWORDS.has(w));

  if (hasIslamicKeyword) {
    return { classification: 'on_topic', response: null };
  }

  // Broader check: if the query is a genuine question and is short, it might
  // be implicitly about Islam in the context of this app (e.g., "how to fast").
  // Only flag as off-topic if the query is clearly about something else.
  const CLEARLY_OFF_TOPIC = /\b(weather|stock|bitcoin|crypto|recipe|cook|football|soccer|basketball|nba|nfl|movie|netflix|spotify|tiktok|instagram|snapchat|fortnite|minecraft|taylor swift|python code|javascript code|write me|generate code|homework|math problem|calculus|physics equation)\b/i;

  if (CLEARLY_OFF_TOPIC.test(lower)) {
    return { classification: 'off_topic', response: OFF_TOPIC_RESPONSE };
  }

  // When in doubt, let it through. The prompt + low retrieval scores will
  // handle genuinely off-topic queries that slip past this heuristic.
  return { classification: 'on_topic', response: null };
}

/**
 * Check if retrieval results indicate the query is off-topic.
 * Call this AFTER Qdrant returns results.
 *
 * @param {number[]} scores — similarity scores from Qdrant
 * @param {number} threshold — minimum score to consider relevant (default 0.35)
 * @returns {boolean} true if the query appears off-topic based on retrieval scores
 */
function isLowRelevance(scores, threshold = 0.35) {
  if (!scores || scores.length === 0) return true;
  const maxScore = Math.max(...scores);
  return maxScore < threshold;
}

module.exports = {
  classifyQuery,
  isLowRelevance,
  BLOCKED_RESPONSE,
  OFF_TOPIC_RESPONSE,
};

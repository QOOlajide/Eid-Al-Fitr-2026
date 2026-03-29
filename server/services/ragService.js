const axios = require('axios');
const { RAGSearch } = require('../models');
const { embedText } = require('./embeddingService');
const vectorStore = require('./vectorStore');
const { geminiGenerateText } = require('./geminiRestClient');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { makeQueryId, logRetrievalEvent, logAnswerEvent } = require('./ragEval');
const { classifyQuery, isLowRelevance } = require('./queryGuardrail');

// Model preference order:
// 1) gemini-3-pro-preview
// 2) gemini-3-flash-preview
// 3) gemini-2.5-pro
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-3-pro-preview";
const DEFAULT_FALLBACK_MODELS = ["gemini-3-flash-preview", "gemini-2.5-pro"];

function getFallbackModels() {
  const envList = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return envList.length > 0 ? envList : DEFAULT_FALLBACK_MODELS;
}

// Islamic websites to search
const ISLAMIC_WEBSITES = [
  'abukhadeejah.com',
  'bakkah.net',
  'troid.org',
  'abuiyaad.com',
  'abuhakeem.com',
  'mpubs.org',
  'mtws.posthaven.com'
];

const ALLOWED_URL_DOMAINS = new Set([
  'abukhadeejah.com',
  'abuiyaad.com',
  'troid.org',
  'mpubs.org',
  'bakkah.net',
]);

function normalizeHost(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function isAllowedUrl(u) {
  try {
    const url = new URL(u);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return ALLOWED_URL_DOMAINS.has(normalizeHost(url.hostname));
  } catch {
    return false;
  }
}

function chunkText(text, chunkChars = 1400, overlap = 200) {
  const s = String(text || '');
  const out = [];
  if (!s.trim()) return out;
  let i = 0;
  while (i < s.length) {
    const end = Math.min(i + chunkChars, s.length);
    const chunk = s.slice(i, end).trim();
    if (chunk) out.push(chunk);
    if (end >= s.length) break;
    i = Math.max(0, end - overlap);
  }
  return out;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 2_000_000, // ~2MB
    headers: {
      'User-Agent': 'Eid-RAG-Bot/0.1',
      Accept: 'text/html,application/xhtml+xml',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data || '');
}

function extractText(html) {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || '').trim();
  $('script, style, nav, footer, header, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return { title, text };
}

function sha1(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex');
}

function sha1ToUuid(hex40) {
  const hex = String(hex40 || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  const hex32 = (hex.length >= 32 ? hex.slice(0, 32) : hex.padEnd(32, '0'));
  const bytes = Buffer.from(hex32, 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const b = bytes.toString('hex');
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20, 32)}`;
}

class RAGService {
  constructor() {
    this.searchCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async searchIslamicKnowledge(query, userId = null) {
    const startTime = Date.now();
    const queryId = makeQueryId(query);
    
    try {
      // Pre-retrieval guardrail — block abusive queries, redirect off-topic ones
      const guard = classifyQuery(query);
      if (guard.response) {
        const result = {
          query,
          answer: guard.response.answer,
          sources: [],
          confidence: guard.response.confidence,
          responseTime: Date.now() - startTime,
          classification: guard.classification,
        };
        logAnswerEvent({
          queryId,
          query,
          answer: guard.response.answer,
          totalLatencyMs: result.responseTime,
          endpoint: 'search',
          extraMeta: { guardrail: guard.classification },
        });
        return result;
      }

      const cacheKey = query.toLowerCase().trim();
      if (this.searchCache.has(cacheKey)) {
        const cached = this.searchCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.result;
        }
      }

      const { sources: searchResults, _queryId, _fallbackUsed } = await this.retrieve(query, queryId);
      
      // Post-retrieval check: if vector scores are all very low, the query
      // likely has no relevant content in our index — skip the LLM call.
      const vectorScores = searchResults.map((s) => s.relevance || 0);
      if (!_fallbackUsed && isLowRelevance(vectorScores)) {
        const result = {
          query,
          answer: 'I don\'t have enough relevant information from my trusted sources to answer this question. '
            + 'Try asking about a specific Islamic topic such as prayer, fasting, Eid, Tawheed, or the Sunnah.',
          sources: [],
          confidence: 0.05,
          responseTime: Date.now() - startTime,
          classification: 'low_relevance',
        };
        logAnswerEvent({
          queryId: _queryId || queryId,
          query,
          answer: result.answer,
          totalLatencyMs: result.responseTime,
          endpoint: 'search',
          extraMeta: { guardrail: 'low_relevance', max_score: Math.max(0, ...vectorScores) },
        });
        return result;
      }

      const llmStart = Date.now();
      const answer = await this.generateAnswer(query, searchResults);
      const llmLatencyMs = Date.now() - llmStart;
      
      const confidence = this.calculateConfidence(searchResults, answer);
      
      const result = {
        query,
        answer: answer.content,
        sources: searchResults,
        confidence,
        responseTime: Date.now() - startTime
      };

      const usage = answer.usage || {};
      logAnswerEvent({
        queryId: _queryId || queryId,
        query,
        answer: answer.content,
        model: answer.model || 'unknown',
        contextIds: searchResults.map((s) => s.url || s._pointId || ''),
        numSources: searchResults.length,
        confidence,
        fallbackUsed: _fallbackUsed || false,
        promptTokens: usage.promptTokenCount || null,
        completionTokens: usage.candidatesTokenCount || null,
        totalTokens: usage.totalTokenCount || null,
        llmLatencyMs,
        totalLatencyMs: result.responseTime,
        endpoint: 'search',
      });

      this.searchCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      if (userId) {
        await RAGSearch.create({
          userId,
          query,
          answer: answer.content,
          sources: searchResults,
          confidence,
          responseTime: result.responseTime
        });
      }

      return result;
    } catch (error) {
      logAnswerEvent({
        queryId,
        query,
        status: 'error',
        errorMessage: error.message,
        totalLatencyMs: Date.now() - startTime,
        endpoint: 'search',
      });
      console.error('RAG search error:', error);
      throw new Error('Failed to search Islamic knowledge');
    }
  }

  async answerFromUrls(query, urls, userId = null) {
    const startTime = Date.now();
    const queryId = makeQueryId(query);
    const topK = Number(process.env.RAG_TOP_K || 6);

    const guard = classifyQuery(query);
    if (guard.classification === 'blocked') {
      const result = {
        query,
        answer: guard.response.answer,
        sources: [],
        confidence: 0,
        responseTime: Date.now() - startTime,
        classification: 'blocked',
      };
      logAnswerEvent({
        queryId,
        query,
        answer: guard.response.answer,
        totalLatencyMs: result.responseTime,
        endpoint: 'ask',
        extraMeta: { guardrail: 'blocked' },
      });
      return result;
    }

    try {
      const cleanUrls = (Array.isArray(urls) ? urls : [])
        .map((u) => String(u).trim())
        .filter(Boolean);

      const bad = cleanUrls.filter((u) => !isAllowedUrl(u));
      if (bad.length > 0) {
        throw new Error(`Disallowed URL(s). Allowed domains: ${Array.from(ALLOWED_URL_DOMAINS).join(', ')}`);
      }

      const pages = [];
      for (const u of cleanUrls) {
        const html = await fetchHtml(u);
        const { title, text } = extractText(html);
        if (!text || text.length < 200) continue;
        pages.push({ url: u, title: title || u, domain: normalizeHost(new URL(u).hostname), text });
      }

      if (pages.length === 0) {
        return {
          query,
          answer: 'I could not extract enough readable text from the provided URLs.',
          sources: [],
          confidence: 0.1,
          responseTime: Date.now() - startTime
        };
      }

      const candidates = [];
      for (const p of pages) {
        const chunks = chunkText(p.text);
        for (let i = 0; i < chunks.length; i += 1) {
          candidates.push({
            title: p.title,
            url: p.url,
            domain: p.domain,
            content: chunks[i],
            excerpt: chunks[i].slice(0, 240) + (chunks[i].length > 240 ? '…' : ''),
            chunkIndex: i,
          });
        }
      }

      const ranked = this.rankResults(candidates, query);
      const top = ranked.slice(0, topK);

      logRetrievalEvent({
        queryId,
        query,
        retrievedIds: top.map((s) => s.url || ''),
        scores: top.map((s) => s.relevance || 0),
        numRetrieved: top.length,
        contexts: top.map((s) => s.content || ''),
        retrievalPath: 'url_keyword_rank',
        retrievalTopK: topK,
        extraMeta: { urls_provided: cleanUrls },
      });

      try {
        const qdrant = vectorStore.getQdrantClient();
        if (qdrant && (process.env.RAG_URL_AUTO_UPSERT || 'true') === 'true') {
          for (const s of top) {
            const vec = await embedText(s.content);
            if (!vec || vec.length === 0) continue;
            await vectorStore.ensureCollection(vec.length);
            await vectorStore.upsertPoints([
              {
                id: sha1ToUuid(sha1(`${s.url}#${s.chunkIndex}`)),
                vector: vec,
                payload: {
                  url: s.url,
                  title: s.title,
                  domain: s.domain,
                  chunk_index: s.chunkIndex,
                  text: s.content,
                },
              },
            ]);
          }
        }
      } catch {
        // ignore (Qdrant down / embed quota)
      }

      const llmStart = Date.now();
      const answer = await this.generateAnswer(query, top);
      const llmLatencyMs = Date.now() - llmStart;
      const confidence = this.calculateConfidence(top, answer);

      const result = {
        query,
        answer: answer.content,
        sources: top,
        confidence,
        responseTime: Date.now() - startTime
      };

      const usage = answer.usage || {};
      logAnswerEvent({
        queryId,
        query,
        answer: answer.content,
        model: answer.model || 'unknown',
        contextIds: top.map((s) => s.url || ''),
        numSources: top.length,
        confidence,
        promptTokens: usage.promptTokenCount || null,
        completionTokens: usage.candidatesTokenCount || null,
        totalTokens: usage.totalTokenCount || null,
        llmLatencyMs,
        totalLatencyMs: result.responseTime,
        endpoint: 'ask',
      });

      if (userId) {
        await RAGSearch.create({
          userId,
          query,
          answer: answer.content,
          sources: top,
          confidence,
          responseTime: result.responseTime
        });
      }

      return result;
    } catch (error) {
      logAnswerEvent({
        queryId,
        query,
        status: 'error',
        errorMessage: error.message,
        totalLatencyMs: Date.now() - startTime,
        endpoint: 'ask',
      });
      console.error('RAG ask error:', error);
      throw error;
    }
  }

  async retrieve(query, queryId) {
    const retriever = (process.env.RAG_RETRIEVER || 'vector').toLowerCase();
    const qdrant = vectorStore.getQdrantClient();
    const qid = queryId || makeQueryId(query);
    const topK = Number(process.env.RAG_TOP_K || 6);
    const embedModel = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';

    if (retriever === 'vector' && qdrant) {
      try {
        const embedStart = Date.now();
        const qEmbedding = await embedText(query);
        const embedLatencyMs = Date.now() - embedStart;

        const qdrantStart = Date.now();
        const hits = await vectorStore.search(qEmbedding, topK);
        const qdrantLatencyMs = Date.now() - qdrantStart;

        const sources = (hits || []).map((h) => {
          const p = h.payload || {};
          return {
            title: p.title || 'Source',
            url: p.url,
            domain: p.domain,
            content: p.text,
            excerpt: (p.text || '').slice(0, 240) + ((p.text || '').length > 240 ? '…' : ''),
            relevance: typeof h.score === 'number' ? h.score : 0,
            chunkIndex: p.chunk_index,
            _pointId: h.id,
          };
        }).filter(s => s.content);

        logRetrievalEvent({
          queryId: qid,
          query,
          retrievedIds: sources.map((s) => s._pointId || s.url || ''),
          scores: sources.map((s) => s.relevance),
          numRetrieved: sources.length,
          contexts: sources.map((s) => s.content || ''),
          retrievalPath: 'vector',
          retrievalTopK: topK,
          retrievalModel: embedModel,
          embedLatencyMs,
          qdrantLatencyMs,
        });

        if (sources.length > 0) return { sources, _queryId: qid, _fallbackUsed: false };
      } catch (e) {
        console.log('Vector retrieval unavailable, falling back:', e.message);
        logRetrievalEvent({
          queryId: qid,
          query,
          retrievalPath: 'vector',
          retrievalTopK: topK,
          retrievalModel: embedModel,
          status: 'error',
          errorMessage: e.message,
        });
      }
    }

    const legacySources = await this.searchWebsites(query);

    logRetrievalEvent({
      queryId: qid,
      query,
      retrievedIds: legacySources.map((s) => s.url || ''),
      scores: legacySources.map((s) => s.relevance || 0),
      numRetrieved: legacySources.length,
      contexts: legacySources.map((s) => s.content || ''),
      retrievalPath: 'legacy',
      retrievalTopK: topK,
    });

    return { sources: legacySources, _queryId: qid, _fallbackUsed: true };
  }

  async searchWebsites(query) {
    const searchPromises = ISLAMIC_WEBSITES.map(domain => 
      this.searchDomain(domain, query)
    );

    const results = await Promise.allSettled(searchPromises);
    const successfulResults = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value)
      .flat()
      .filter(result => result && result.content);

    // Sort by relevance and limit to top 10
    return this.rankResults(successfulResults, query).slice(0, 10);
  }

  async searchDomain(domain, query) {
    try {
      // Use Google Custom Search API or web scraping
      const searchUrl = `https://www.google.com/search?q=site:${domain} ${encodeURIComponent(query)}`;
      
      // For demo purposes, we'll simulate results
      // In production, you'd use Google Custom Search API or web scraping
      const mockResults = await this.getMockResults(domain, query);
      
      return (mockResults || []).map(r => ({ ...r, domain }));
    } catch (error) {
      console.error(`Error searching ${domain}:`, error);
      return [];
    }
  }

  async getMockResults(domain, query) {
    // Mock results for demonstration
    // In production, implement actual web scraping or API calls
    const mockData = {
      'abukhadeejah.com': [
        {
          title: 'The Importance of Following the Sunnah',
          url: `https://${domain}/sunnah-importance`,
          content: 'The Sunnah of the Prophet (peace be upon him) is the second source of Islamic legislation after the Quran. It provides guidance on how to implement the teachings of the Quran in daily life.',
          excerpt: 'The Sunnah provides practical guidance for implementing Quranic teachings...'
        }
      ],
      'bakkah.net': [
        {
          title: 'Understanding Islamic Beliefs',
          url: `https://${domain}/islamic-beliefs`,
          content: 'Islamic beliefs are based on the six pillars of faith: belief in Allah, His angels, His books, His messengers, the Day of Judgment, and divine decree.',
          excerpt: 'The six pillars of faith form the foundation of Islamic belief...'
        }
      ],
      'troid.org': [
        {
          title: 'The Fundamentals of Tawheed',
          url: `https://${domain}/tawheed-fundamentals`,
          content: 'Tawheed is the foundation of Islam, meaning the oneness of Allah. It encompasses three categories: Tawheed ar-Ruboobiyyah, Tawheed al-Uloohiyyah, and Tawheed al-Asmaa was-Sifaat.',
          excerpt: 'Tawheed, the oneness of Allah, is the core principle of Islam...'
        }
      ]
    };

    return mockData[domain] || [];
  }

  async generateAnswer(query, sources) {
    try {
      const context = sources.map(source => 
        `Source: ${source.title}\nContent: ${source.content}`
      ).join('\n\n');

      const prompt = `You are an Islamic scholar assistant for a trusted educational platform. You answer questions based ONLY on the provided sources from authentic Salafi Islamic websites.

Question: ${query}

Sources:
${context}

Instructions:
1. Answer based on the provided sources. If the sources cover the topic, give a comprehensive, well-structured answer with proper Islamic terminology.
2. Include relevant Quranic verses or hadith references if mentioned in the sources.
3. If the question addresses a common MISCONCEPTION about Islam (e.g., about violence, extremism, women's rights, or intolerance), respond with dignity and clarity. Correct the misconception using evidence from the sources where possible. Do not be defensive — be educational.
4. If the question is PROVOCATIVE but sincere (e.g., "Why do Muslims do X?"), treat it as a genuine question and provide an informative answer. Assume good faith.
5. If the sources do NOT contain relevant information for this question, say: "I don't have enough information from my trusted sources to answer this question accurately. Please try rephrasing or ask about a specific Islamic topic."
6. NEVER fabricate sources, scholars, hadith references, or Quranic verses. If it is not in the provided sources, do not invent it.
7. Keep the tone respectful, welcoming, and educational — suitable for both Muslims and non-Muslims.

Answer:`;

      // Try requested model first; if it's not available for this key, fall back.
      const candidates = [GEMINI_CHAT_MODEL, ...getFallbackModels().filter(m => m !== GEMINI_CHAT_MODEL)];

      let lastErr = null;
      for (const m of candidates) {
        try {
          const { text, usage } = await geminiGenerateText({ model: m, prompt });
          return { content: text, model: m, usage };
        } catch (e) {
          lastErr = e;
          const status = Number(e?.status);
          const isRetryableForFallback =
            status === 404 || // model not found/unsupported
            status === 429;   // quota/rate limit (try cheaper model)

          if (!isRetryableForFallback) break;
        }
      }

      throw lastErr || new Error('Gemini generateContent failed');
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate answer');
    }
  }

  rankResults(results, query) {
    const queryWords = query.toLowerCase().split(' ');
    
    return results.map(result => {
      let score = 0;
      const title = String(result.title || '').toLowerCase();
      const content = String(result.content || '').toLowerCase();
      
      // Score based on title matches
      queryWords.forEach(word => {
        if (title.includes(word)) score += 3;
        if (content.includes(word)) score += 1;
      });
      
      // Boost score for exact phrase matches
      if (title.includes(query.toLowerCase())) score += 5;
      if (content.includes(query.toLowerCase())) score += 2;
      
      return {
        ...result,
        relevance: score
      };
    }).sort((a, b) => b.relevance - a.relevance);
  }

  calculateConfidence(sources, answer) {
    if (sources.length === 0) return 0.1;
    
    // Base confidence on number of sources and their relevance
    let confidence = Math.min(sources.length * 0.1, 0.8);
    
    // Boost confidence if multiple sources agree
    const avgRelevance = sources.reduce((sum, source) => sum + (source.relevance || 0), 0) / sources.length;
    confidence += Math.min(avgRelevance * 0.05, 0.2);
    
    return Math.min(confidence, 0.95);
  }

  async getRelatedQuestions(topic) {
    try {
      const prompt = `
Generate 5 related Islamic questions about: ${topic}

The questions should be:
1. Relevant to the topic
2. Educational and meaningful
3. Appropriate for Muslims and non-Muslims
4. Cover different aspects of the topic

Return only the questions, one per line, without numbering.`;

      const candidates = [GEMINI_CHAT_MODEL, ...getFallbackModels().filter(m => m !== GEMINI_CHAT_MODEL)];
      let text = '';
      for (const m of candidates) {
        try {
          const result = await geminiGenerateText({ model: m, prompt });
          text = result.text;
          if (text) break;
        } catch (e) {
          const status = Number(e?.status);
          const isRetryableForFallback = status === 404 || status === 429;
          if (!isRetryableForFallback) break;
        }
      }

      const questions = text
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0)
        .slice(0, 5);

      return questions;
    } catch (error) {
      console.error('Error generating related questions:', error);
      return [];
    }
  }

  clearCache() {
    this.searchCache.clear();
  }
}

module.exports = new RAGService();

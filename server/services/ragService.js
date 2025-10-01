const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { RAGSearch } = require('../models');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

class RAGService {
  constructor() {
    this.searchCache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  async searchIslamicKnowledge(query, userId = null) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = query.toLowerCase().trim();
      if (this.searchCache.has(cacheKey)) {
        const cached = this.searchCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.result;
        }
      }

      // Search across Islamic websites
      const searchResults = await this.searchWebsites(query);
      
      // Generate answer using Gemini
      const answer = await this.generateAnswer(query, searchResults);
      
      // Calculate confidence based on source quality and relevance
      const confidence = this.calculateConfidence(searchResults, answer);
      
      const result = {
        query,
        answer: answer.content,
        sources: searchResults,
        confidence,
        responseTime: Date.now() - startTime
      };

      // Cache the result
      this.searchCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      // Save to database if user is authenticated
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
      console.error('RAG search error:', error);
      throw new Error('Failed to search Islamic knowledge');
    }
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
      
      return mockResults;
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

      const prompt = `
You are an Islamic scholar assistant. Answer the following question based on the provided sources from trusted Islamic websites.

Question: ${query}

Sources:
${context}

Instructions:
1. Provide a comprehensive and accurate answer based on the sources
2. Use proper Islamic terminology
3. Include relevant Quranic verses or hadith if mentioned in sources
4. Be respectful and educational
5. If the sources don't contain enough information, say so
6. Keep the answer clear and well-structured

Answer:`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return {
        content: text,
        model: 'gemini-1.5-flash'
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate answer');
    }
  }

  rankResults(results, query) {
    const queryWords = query.toLowerCase().split(' ');
    
    return results.map(result => {
      let score = 0;
      const title = result.title.toLowerCase();
      const content = result.content.toLowerCase();
      
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

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

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

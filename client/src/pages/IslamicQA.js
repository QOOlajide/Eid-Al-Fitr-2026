import React, { useState } from 'react';
import { Search, MessageCircle, Clock, ExternalLink, BookOpen } from 'lucide-react';
import { useRAG } from '../contexts/RAGContext';
import './IslamicQA.css';

const IslamicQA = () => {
  const [query, setQuery] = useState('');
  const [sourceUrls, setSourceUrls] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  const { loading, searchHistory, searchIslamicKnowledge, askFromUrls, getRelatedQuestions, clearHistory } = useRAG();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const urls = sourceUrls
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const result = urls.length > 0
      ? await askFromUrls(query, urls)
      : await searchIslamicKnowledge(query);

    if (result.success) {
      setSearchResults(result.data);
      
      // Get related questions
      const related = await getRelatedQuestions(query);
      if (related.success) {
        setRelatedQuestions(related.data);
      }
    }
  };

  const handleRelatedQuestion = async (question) => {
    setQuery(question);
    const result = await searchIslamicKnowledge(question);
    if (result.success) {
      setSearchResults(result.data);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="islamic-qa">
      <div className="container">
        <div className="qa-header">
          <h1>Islamic Knowledge Q&A</h1>
          <p>
            Ask questions about Islamic teachings, practices, and beliefs. 
            Our system searches through trusted Islamic sources to provide accurate answers.
          </p>
        </div>

        <div className="qa-content">
          <div className="search-section">
            <form onSubmit={handleSearch} className="search-form">
              <div className="search-input-group">
                <Search className="search-icon" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a question about Islam..."
                  className="search-input"
                  disabled={loading}
                />
                <button 
                  type="submit" 
                  className="search-btn"
                  disabled={loading || !query.trim()}
                >
                  {loading ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
                  Optional: paste source URLs (one per line)
                </label>
                <textarea
                  value={sourceUrls}
                  onChange={(e) => setSourceUrls(e.target.value)}
                  placeholder="https://www.troid.org/introduction-to-islam/&#10;https://abukhadeejah.com/..."
                  rows={4}
                  className="search-input"
                  style={{ width: '100%', resize: 'vertical', padding: 10 }}
                  disabled={loading}
                />
              </div>
            </form>

            {relatedQuestions.length > 0 && (
              <div className="related-questions">
                <h3>Related Questions</h3>
                <div className="related-list">
                  {relatedQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => handleRelatedQuestion(question)}
                      className="related-question"
                    >
                      <MessageCircle size={16} />
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {searchResults && (
            <div className="search-results">
              <div className="result-header">
                <h2>Search Results</h2>
                <div className="result-meta">
                  <span>Sources: {searchResults.sources?.length || 0}</span>
                  <span>Confidence: {Math.round((searchResults.confidence || 0) * 100)}%</span>
                </div>
              </div>

              <div className="answer-section">
                <h3>Answer</h3>
                <div className="answer-content">
                  {searchResults.answer}
                </div>
              </div>

              {searchResults.sources && searchResults.sources.length > 0 && (
                <div className="sources-section">
                  <h3>Sources</h3>
                  <div className="sources-list">
                    {searchResults.sources.map((source, index) => (
                      <div key={index} className="source-item">
                        <div className="source-header">
                          <BookOpen size={16} />
                          <span className="source-title">{source.title}</span>
                          <a 
                            href={source.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="source-link"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                        <p className="source-excerpt">{source.excerpt}</p>
                        <div className="source-meta">
                          <span className="source-domain">{source.domain}</span>
                          <span className="source-relevance">
                            Relevance: {Math.round((source.relevance || 0) * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {searchHistory.length > 0 && (
            <div className="search-history">
              <div className="history-header">
                <h3>Recent Searches</h3>
                <button onClick={clearHistory} className="clear-history-btn">
                  Clear History
                </button>
              </div>
              <div className="history-list">
                {searchHistory.map((item, index) => (
                  <div key={index} className="history-item">
                    <div className="history-query">
                      <MessageCircle size={16} />
                      <span>{item.query}</span>
                    </div>
                    <div className="history-meta">
                      <Clock size={14} />
                      <span>{formatTimestamp(item.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="qa-info">
          <h3>About This Q&A System</h3>
          <p>
            This system searches through trusted Islamic websites including:
          </p>
          <ul>
            <li>abukhadeejah.com</li>
            <li>bakkah.net</li>
            <li>troid.org</li>
            <li>abuiyaad.com</li>
            <li>abuhakeem.com</li>
            <li>mpubs.org</li>
            <li>mtws.posthaven.com</li>
          </ul>
          <p>
            All answers are sourced from these reliable Islamic resources to ensure accuracy and authenticity.
          </p>
        </div>
      </div>
    </div>
  );
};

export default IslamicQA;

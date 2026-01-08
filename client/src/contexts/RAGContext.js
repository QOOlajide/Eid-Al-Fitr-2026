import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';

const RAGContext = createContext();

export const useRAG = () => {
  const context = useContext(RAGContext);
  if (!context) {
    throw new Error('useRAG must be used within a RAGProvider');
  }
  return context;
};

export const RAGProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);

  const searchIslamicKnowledge = async (query) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/rag/search', { query });
      const result = response.data?.data;
      
      // Add to search history
      setSearchHistory(prev => [
        { query, result, timestamp: new Date() },
        ...prev.slice(0, 9) // Keep only last 10 searches
      ]);
      
      return { success: true, data: result };
    } catch (error) {
      console.error('RAG search error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Search failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const askFromUrls = async (query, urls) => {
    setLoading(true);
    try {
      const response = await axios.post('/api/rag/ask', { query, urls });
      const result = response.data?.data;

      setSearchHistory(prev => [
        { query, result, timestamp: new Date() },
        ...prev.slice(0, 9)
      ]);

      return { success: true, data: result };
    } catch (error) {
      console.error('RAG ask-from-urls error:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Ask failed'
      };
    } finally {
      setLoading(false);
    }
  };

  const getRelatedQuestions = async (topic) => {
    try {
      const response = await axios.post('/api/rag/related', { topic });
      return { success: true, data: response.data?.data || [] };
    } catch (error) {
      console.error('Related questions error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to get related questions' 
      };
    }
  };

  const clearHistory = () => {
    setSearchHistory([]);
  };

  const value = {
    loading,
    searchHistory,
    searchIslamicKnowledge,
    askFromUrls,
    getRelatedQuestions,
    clearHistory
  };

  return (
    <RAGContext.Provider value={value}>
      {children}
    </RAGContext.Provider>
  );
};

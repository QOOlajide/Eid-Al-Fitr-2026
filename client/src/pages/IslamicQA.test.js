import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import IslamicQA from './IslamicQA';
import { useRAG } from '../contexts/RAGContext';

jest.mock('../contexts/RAGContext', () => ({
  useRAG: jest.fn(),
}));

test('shows a user-friendly error instead of raw API details when search fails', async () => {
  const searchIslamicKnowledge = jest.fn().mockResolvedValue({
    success: false,
    error: 'Internal API key missing',
  });
  useRAG.mockReturnValue({
    loading: false,
    searchHistory: [],
    searchIslamicKnowledge,
    askFromUrls: jest.fn(),
    getRelatedQuestions: jest.fn(),
    clearHistory: jest.fn(),
  });
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<IslamicQA />);
    fireEvent.change(screen.getByPlaceholderText('Ask a question about Islam...'), {
      target: { value: 'What is zakat?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to complete your search. Please try again.');
    expect(alert).not.toHaveTextContent('Internal API key missing');
    expect(searchIslamicKnowledge).toHaveBeenCalledWith('What is zakat?');
    expect(consoleSpy).toHaveBeenCalledWith('[RAG:search]', 'Internal API key missing');
  } finally {
    consoleSpy.mockRestore();
  }
});

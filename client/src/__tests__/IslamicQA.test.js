import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import IslamicQA from '../pages/IslamicQA';

// Mock the RAG context
const mockSearchIslamicKnowledge = jest.fn();
const mockGetRelatedQuestions = jest.fn();

jest.mock('../contexts/RAGContext', () => ({
  useRAG: () => ({
    loading: false,
    searchHistory: [],
    searchIslamicKnowledge: mockSearchIslamicKnowledge,
    getRelatedQuestions: mockGetRelatedQuestions,
    clearHistory: jest.fn()
  })
}));

const IslamicQAWithRouter = () => (
  <BrowserRouter>
    <IslamicQA />
  </BrowserRouter>
);

describe('IslamicQA Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders Islamic Q&A page', () => {
    render(<IslamicQAWithRouter />);
    expect(screen.getByText('Islamic Knowledge Q&A')).toBeInTheDocument();
  });

  test('renders search form', () => {
    render(<IslamicQAWithRouter />);
    expect(screen.getByPlaceholderText('Ask a question about Islam...')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  test('handles search form submission', async () => {
    const mockResult = {
      success: true,
      data: {
        query: 'What is Eid al-Fitr?',
        answer: 'Eid al-Fitr is the festival of breaking the fast...',
        sources: [
          {
            title: 'Understanding Eid al-Fitr',
            url: 'https://example.com',
            excerpt: 'Eid al-Fitr marks the end of Ramadan...',
            domain: 'example.com',
            relevance: 0.95
          }
        ],
        confidence: 0.9
      }
    };

    mockSearchIslamicKnowledge.mockResolvedValue(mockResult);
    mockGetRelatedQuestions.mockResolvedValue({
      success: true,
      data: ['What is Ramadan?', 'How do Muslims celebrate Eid?']
    });

    render(<IslamicQAWithRouter />);
    
    const searchInput = screen.getByPlaceholderText('Ask a question about Islam...');
    const searchButton = screen.getByText('Search');

    fireEvent.change(searchInput, { target: { value: 'What is Eid al-Fitr?' } });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockSearchIslamicKnowledge).toHaveBeenCalledWith('What is Eid al-Fitr?');
    });
  });

  test('displays search results', async () => {
    const mockResult = {
      success: true,
      data: {
        query: 'What is Eid al-Fitr?',
        answer: 'Eid al-Fitr is the festival of breaking the fast...',
        sources: [
          {
            title: 'Understanding Eid al-Fitr',
            url: 'https://example.com',
            excerpt: 'Eid al-Fitr marks the end of Ramadan...',
            domain: 'example.com',
            relevance: 0.95
          }
        ],
        confidence: 0.9
      }
    };

    mockSearchIslamicKnowledge.mockResolvedValue(mockResult);

    render(<IslamicQAWithRouter />);
    
    const searchInput = screen.getByPlaceholderText('Ask a question about Islam...');
    const searchButton = screen.getByText('Search');

    fireEvent.change(searchInput, { target: { value: 'What is Eid al-Fitr?' } });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText('Search Results')).toBeInTheDocument();
      expect(screen.getByText('Answer')).toBeInTheDocument();
      expect(screen.getByText('Sources')).toBeInTheDocument();
    });
  });

  test('shows loading state during search', async () => {
    mockSearchIslamicKnowledge.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ success: true, data: {} }), 100))
    );

    render(<IslamicQAWithRouter />);
    
    const searchInput = screen.getByPlaceholderText('Ask a question about Islam...');
    const searchButton = screen.getByText('Search');

    fireEvent.change(searchInput, { target: { value: 'What is Eid al-Fitr?' } });
    fireEvent.click(searchButton);

    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });
});

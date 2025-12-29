import { useState, useCallback } from 'react';
import { searchTexts, ApiError } from '@/api';
import type { SearchResponse } from '@/types/api';

interface UseSearchState {
  results: SearchResponse | null;
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
}

export interface UseSearchReturn extends UseSearchState {
  search: (query: string, limit?: number) => Promise<void>;
  clearResults: () => void;
}

export function useSearch(): UseSearchReturn {
  const [state, setState] = useState<UseSearchState>({
    results: null,
    isLoading: false,
    error: null,
    hasSearched: false,
  });

  const search = useCallback(async (query: string, limit: number = 10) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const results = await searchTexts(query, limit);
      setState({
        results,
        isLoading: false,
        error: null,
        hasSearched: true,
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body?.message ?? err.message
          : 'An unexpected error occurred';
      setState({
        results: null,  // Clear previous results
        isLoading: false,
        error: message,
        hasSearched: true,
      });
    }
  }, []);

  const clearResults = useCallback(() => {
    setState({
      results: null,
      isLoading: false,
      error: null,
      hasSearched: false,
    });
  }, []);

  return {
    ...state,
    search,
    clearResults,
  };
}

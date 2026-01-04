import { useState, useCallback, useRef, useEffect } from 'react';
import { searchTexts, ApiError, NetworkError } from '@/api';
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

  // Unmount guard to prevent state updates after component unmounts
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;  // Reset to true on every mount (handles StrictMode remounts)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const search = useCallback(async (query: string, limit: number = 10) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const results = await searchTexts(query, limit);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      setState({
        results,
        isLoading: false,
        error: null,
        hasSearched: true,
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      let message: string;

      if (err instanceof NetworkError) {
        // Network errors: DNS failure, connection refused, offline, timeout
        message = 'Network error: Unable to reach the server. Please check your connection.';
      } else if (err instanceof ApiError) {
        // Server errors: 4xx, 5xx responses with structured error info
        message = err.body?.message ?? `Server error: ${err.message}`;
      } else {
        // Unexpected errors (should be rare with proper error handling)
        // Log to console for debugging - in production, send to error tracking service (Sentry, etc.)
        console.error('Unexpected error in search:', err);
        message = 'An unexpected error occurred';
      }

      setState({
        results: null,  // Clear previous results on error - search is stateless
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

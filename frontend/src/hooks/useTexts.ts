import { useState, useCallback, useEffect } from 'react';
import { listTexts, ApiError } from '@/api';
import type { TextListResponse } from '@/types/api';

interface UseTextsState {
  data: TextListResponse | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseTextsReturn extends UseTextsState {
  fetchTexts: (page: number, perPage: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTexts(
  initialPage: number = 1,
  initialPerPage: number = 20
): UseTextsReturn {
  const [state, setState] = useState<UseTextsState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const [lastFetchParams, setLastFetchParams] = useState({
    page: initialPage,
    perPage: initialPerPage,
  });

  const fetchTexts = useCallback(
    async (page: number, perPage: number) => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        const data = await listTexts(page, perPage);
        setState({
          data,
          isLoading: false,
          error: null,
        });
        setLastFetchParams({ page, perPage });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.body?.message ?? err.message
            : 'An unexpected error occurred';
        setState((prev) => ({
          data: prev.data, // Preserve previous data on error
          isLoading: false,
          error: message,
        }));
      }
    },
    [] // No dependencies - all values are parameters
  );

  const refresh = useCallback(() => {
    return fetchTexts(lastFetchParams.page, lastFetchParams.perPage);
  }, [lastFetchParams.page, lastFetchParams.perPage, fetchTexts]);

  // Initial fetch on mount
  useEffect(() => {
    fetchTexts(initialPage, initialPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  return {
    ...state,
    fetchTexts,
    refresh,
  };
}

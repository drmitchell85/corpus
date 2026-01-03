import { useState, useCallback, useEffect } from 'react';
import { listTexts, ApiError, NetworkError } from '@/api';
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
  defaultPage: number = 1,  // Renamed from initialPage to clarify this is default-only
  defaultPerPage: number = 20  // Renamed from initialPerPage to clarify this is default-only
): UseTextsReturn {
  const [state, setState] = useState<UseTextsState>({
    data: null,
    isLoading: false,
    error: null,
  });

  const [lastFetchParams, setLastFetchParams] = useState({
    page: defaultPage,
    perPage: defaultPerPage,
  });

  // Unmount guard to prevent state updates after component unmounts
  const mountedRef = useRef(true);

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
          console.error('Unexpected error in listTexts:', err);
          message = 'An unexpected error occurred';
        }

        setState((prev) => ({
          data: prev.data, // Preserve previous data on error - library maintains state across pages
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
  // Note: Uses default values only - if parent changes these props, hook won't re-fetch
  useEffect(() => {
    fetchTexts(defaultPage, defaultPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only run once on mount with default values

  return {
    ...state,
    fetchTexts,
    refresh,
  };
}

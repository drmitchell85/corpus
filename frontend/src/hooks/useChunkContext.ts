import { useState, useCallback, useRef, useEffect } from 'react';
import { getChunkContext, ApiError, NetworkError } from '@/api';
import type { ChunkContext } from '@/types/api';

interface UseChunkContextState {
  context: ChunkContext | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseChunkContextReturn extends UseChunkContextState {
  fetchContext: (id: number, window?: number) => Promise<void>;
}

export function useChunkContext(): UseChunkContextReturn {
  const [state, setState] = useState<UseChunkContextState>({
    context: null,
    isLoading: false,
    error: null,
  });

  // Unmount guard to prevent state updates after component unmounts
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // Reset to true on every mount (handles StrictMode remounts)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchContext = useCallback(async (id: number, window: number = 1) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const context = await getChunkContext(id, window);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      setState({
        context,
        isLoading: false,
        error: null,
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
        if (err.status === 404) {
          message = 'Chunk not found. It may have been deleted.';
        } else {
          message = err.body?.message ?? `Server error: ${err.message}`;
        }
      } else if (err instanceof Error && err.message.includes('Invalid chunk ID')) {
        // Client-side validation error
        message = err.message;
      } else {
        // Unexpected errors (should be rare with proper error handling)
        // Log to console for debugging - in production, send to error tracking service (Sentry, etc.)
        console.error('Unexpected error in fetchContext:', err);
        message = 'An unexpected error occurred';
      }

      setState({
        context: null,
        isLoading: false,
        error: message,
      });
    }
  }, []);

  return {
    ...state,
    fetchContext,
  };
}

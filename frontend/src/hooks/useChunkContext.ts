import { useState, useCallback, useRef, useEffect } from 'react';
import { getChunkContext, getChunksBefore, getChunksAfter, ApiError, NetworkError } from '@/api';
import type { ChunkContext, ChunkItem } from '@/types/api';

interface UseChunkContextState {
  context: ChunkContext | null;
  isLoading: boolean;
  isLoadingBefore: boolean;
  isLoadingAfter: boolean;
  error: string | null;
}

export interface UseChunkContextReturn extends UseChunkContextState {
  fetchContext: (id: number, window?: number) => Promise<void>;
  loadMoreBefore: (limit?: number) => Promise<void>;
  loadMoreAfter: (limit?: number) => Promise<void>;
}

export function useChunkContext(): UseChunkContextReturn {
  const [state, setState] = useState<UseChunkContextState>({
    context: null,
    isLoading: false,
    isLoadingBefore: false,
    isLoadingAfter: false,
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
        isLoadingBefore: false,
        isLoadingAfter: false,
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
        isLoadingBefore: false,
        isLoadingAfter: false,
        error: message,
      });
    }
  }, []);

  const loadMoreBefore = useCallback(async (limit: number = 3) => {
    // Check guards and get chunk ID from current state
    if (!state.context) {
      return;
    }

    if (state.isLoadingBefore) {
      return;
    }

    if (!state.context.has_more_before) {
      return;
    }

    // Get the earliest chunk we currently have
    const earliestChunk = state.context.before_chunks.length > 0
      ? state.context.before_chunks[0]
      : state.context.current_chunk;

    const earliestChunkId = earliestChunk.id;

    // Set loading state
    setState((prev) => ({
      ...prev,
      isLoadingBefore: true,
    }));

    try {
      // Fetch chunks that come before the earliest chunk
      const newChunks = await getChunksBefore(earliestChunkId, limit);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Prepend new chunks to existing before_chunks
      setState((prev) => {
        if (!prev.context) return prev;

        // Calculate has_more_before: check if the earliest chunk we now have is at index 0
        const earliestChunkIndex = newChunks.length > 0
          ? newChunks[0].chunk_index
          : (prev.context.before_chunks.length > 0 ? prev.context.before_chunks[0].chunk_index : prev.context.current_chunk.chunk_index);

        const hasMoreBefore = earliestChunkIndex > 0;

        return {
          ...prev,
          isLoadingBefore: false,
          context: {
            ...prev.context,
            before_chunks: [...newChunks, ...prev.context.before_chunks],
            // Update has_more_before: if earliest chunk is at index 0, we're at the start
            has_more_before: hasMoreBefore,
          },
        };
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Handle error gracefully - just stop loading, don't clear entire context
      setState((prev) => ({
        ...prev,
        isLoadingBefore: false,
      }));

      // Log error for debugging (in production, send to error tracking service)
      console.error('Error loading more chunks before:', err);
    }
  }, [state]); // Depend on state to access current values

  const loadMoreAfter = useCallback(async (limit: number = 3) => {
    // Check guards and get chunk ID from current state
    if (!state.context) {
      return;
    }

    if (state.isLoadingAfter) {
      return;
    }

    if (!state.context.has_more_after) {
      return;
    }

    // Get the latest chunk we currently have
    const latestChunk = state.context.after_chunks.length > 0
      ? state.context.after_chunks[state.context.after_chunks.length - 1]
      : state.context.current_chunk;

    const latestChunkId = latestChunk.id;

    // Set loading state
    setState((prev) => ({
      ...prev,
      isLoadingAfter: true,
    }));

    try {
      // Fetch chunks that come after the latest chunk
      const newChunks = await getChunksAfter(latestChunkId, limit);

      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Append new chunks to existing after_chunks
      setState((prev) => {
        if (!prev.context) return prev;

        // Calculate has_more_after: check if the latest chunk we now have is the last chunk in the document
        const latestChunkIndex = newChunks.length > 0
          ? newChunks[newChunks.length - 1].chunk_index
          : (prev.context.after_chunks.length > 0
              ? prev.context.after_chunks[prev.context.after_chunks.length - 1].chunk_index
              : prev.context.current_chunk.chunk_index);

        const hasMoreAfter = latestChunkIndex < prev.context.total_chunks - 1;

        return {
          ...prev,
          isLoadingAfter: false,
          context: {
            ...prev.context,
            after_chunks: [...prev.context.after_chunks, ...newChunks],
            // Update has_more_after: if latest chunk is the last in the document, we're at the end
            has_more_after: hasMoreAfter,
          },
        };
      });
    } catch (err) {
      // Prevent state update if component unmounted during fetch
      if (!mountedRef.current) return;

      // Handle error gracefully - just stop loading, don't clear entire context
      setState((prev) => ({
        ...prev,
        isLoadingAfter: false,
      }));

      // Log error for debugging (in production, send to error tracking service)
      console.error('Error loading more chunks after:', err);
    }
  }, [state]); // Depend on state to access current values

  return {
    ...state,
    fetchContext,
    loadMoreBefore,
    loadMoreAfter,
  };
}

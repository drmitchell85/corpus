import { useState, useCallback, useRef, useEffect } from 'react';
import { deleteText, ApiError, NetworkError } from '@/api';
import type { DeleteTextResponse } from '@/types/api';

interface UseDeleteTextState {
  isDeleting: boolean;
  error: string | null;
  lastDeleted: DeleteTextResponse | null;
}

export interface UseDeleteTextReturn extends UseDeleteTextState {
  deleteText: (id: number, onSuccess?: () => void) => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for deleting texts with state management
 *
 * @param id - The text ID to delete (must be a positive integer)
 * @param onSuccess - Optional callback invoked after successful deletion
 *
 * @example
 * const { deleteText, isDeleting, error, clearError } = useDeleteText();
 *
 * const handleDelete = async (id: number) => {
 *   await deleteText(id, () => {
 *     // Refresh the list after successful deletion
 *     refresh();
 *   });
 * };
 */
export function useDeleteText(): UseDeleteTextReturn {
  const [state, setState] = useState<UseDeleteTextState>({
    isDeleting: false,
    error: null,
    lastDeleted: null,
  });

  // Unmount guard to prevent state updates after component unmounts
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;  // Reset to true on every mount (handles StrictMode remounts)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDeleteText = useCallback(
    async (id: number, onSuccess?: () => void) => {
      setState((prev) => ({
        ...prev,
        isDeleting: true,
        error: null,
      }));

      try {
        const result = await deleteText(id);

        // Prevent state update if component unmounted during delete
        if (!mountedRef.current) return;

        // Call onSuccess callback before state update to prevent race condition
        // where component unmounts between setState and callback execution
        if (onSuccess && typeof onSuccess === 'function') {
          onSuccess();
        }

        setState({
          isDeleting: false,
          error: null,
          lastDeleted: result,
        });
      } catch (err) {
        // Prevent state update if component unmounted during delete
        if (!mountedRef.current) return;

        let message: string;

        if (err instanceof NetworkError) {
          // Network errors: DNS failure, connection refused, offline, timeout
          message = 'Network error: Unable to reach the server. Please check your connection.';
        } else if (err instanceof ApiError) {
          // Server errors: 404 (not found), 500 (server error)
          if (err.status === 404) {
            message = 'Text not found. It may have already been deleted.';
          } else {
            message = err.body?.message ?? `Server error: ${err.message}`;
          }
        } else if (err instanceof Error) {
          // Client-side validation error from deleteText()
          message = err.message;
        } else {
          // Unexpected errors (should be rare with proper error handling)
          // Log to console for debugging - in production, send to error tracking service (Sentry, etc.)
          console.error('Unexpected error in deleteText:', err);
          message = 'An unexpected error occurred';
        }

        setState({
          isDeleting: false,
          error: message,
          lastDeleted: null,
        });
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    deleteText: handleDeleteText,
    clearError,
  };
}

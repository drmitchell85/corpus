import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageLayout } from '@/components';
import { useChunkContext } from '@/hooks';
import type { ChunkItem } from '@/types/api';

const INITIAL_WINDOW = 1; // Fetch 1 chunk before and after on initial load

export function ChunkPage() {
  const { id } = useParams<{ id: string }>();
  const { context, isLoading, error, fetchContext } = useChunkContext();

  // Parse ID from URL params
  const chunkId = id ? parseInt(id, 10) : null;

  // Fetch chunk context on mount or when ID changes
  useEffect(() => {
    if (chunkId && Number.isSafeInteger(chunkId) && chunkId > 0) {
      fetchContext(chunkId, INITIAL_WINDOW);
    }
  }, [chunkId, fetchContext]);

  return (
    <PageLayout currentPath="/chunk">
      <div className="chunk-page">
        <nav className="chunk-page__nav">
          <Link to="/" className="link-back">
            ← Back to Search
          </Link>
        </nav>

        {/* Invalid ID */}
        {chunkId === null || !Number.isSafeInteger(chunkId) || chunkId <= 0 ? (
          <div className="status status--error" role="alert">
            Invalid chunk ID. Please provide a valid numeric ID.
          </div>
        ) : null}

        {/* Loading state */}
        {isLoading && (
          <p className="loading" aria-live="polite">
            Loading chunk
          </p>
        )}

        {/* Error state */}
        {error && (
          <div className="status status--error" role="alert">
            {error}
          </div>
        )}

        {/* Success state - show metadata header and chunks */}
        {!isLoading && !error && context && (
          <>
            <ChunkMetadataHeader context={context} />
            <ChunkList context={context} />
          </>
        )}
      </div>
    </PageLayout>
  );
}

interface ChunkMetadataHeaderProps {
  context: NonNullable<ReturnType<typeof useChunkContext>['context']>;
}

/**
 * Display metadata header showing title, author, year, and position
 */
function ChunkMetadataHeader({ context }: ChunkMetadataHeaderProps) {
  const { title, author, year, current_index, total_chunks } = context;

  // Position text: "Chunk 5 of 120"
  const position = `Chunk ${current_index + 1} of ${total_chunks}`;

  return (
    <header className="chunk-metadata">
      <div className="chunk-metadata__position text-muted text-small">
        {position}
      </div>

      {title && <h1 className="chunk-metadata__title">{title}</h1>}

      {(author || year) && (
        <div className="chunk-metadata__byline">
          {author && <span className="chunk-metadata__author">{author}</span>}
          {year && <span className="chunk-metadata__year">({year})</span>}
        </div>
      )}
    </header>
  );
}

interface ChunkListProps {
  context: NonNullable<ReturnType<typeof useChunkContext>['context']>;
}

/**
 * Display list of chunks with current chunk highlighted
 */
function ChunkList({ context }: ChunkListProps) {
  const { current_chunk, before_chunks, after_chunks } = context;

  // Combine all chunks in order: before, current, after
  // API guarantees: before_chunks in ascending order, after_chunks in ascending order
  const allChunks = [...before_chunks, current_chunk, ...after_chunks];

  return (
    <div className="chunk-list">
      {allChunks.map((chunk) => (
        <ChunkBlock
          key={chunk.id}
          chunk={chunk}
          isCurrent={chunk.id === current_chunk.id}
        />
      ))}
    </div>
  );
}

interface ChunkBlockProps {
  chunk: ChunkItem;
  isCurrent: boolean;
}

/**
 * Display a single chunk block (paragraph)
 */
function ChunkBlock({ chunk, isCurrent }: ChunkBlockProps) {
  return (
    <article
      className={`chunk-block${isCurrent ? ' chunk-block--current' : ''}`}
      aria-label={isCurrent ? `Current chunk (${chunk.chunk_index + 1})` : `Chunk ${chunk.chunk_index + 1}`}
    >
      <blockquote className="chunk-block__text">
        {chunk.text}
      </blockquote>
    </article>
  );
}

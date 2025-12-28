import type { TextItem } from '@/types/api';

export interface TextCardProps {
  text: TextItem;
}

/**
 * Validates that a URL uses a safe protocol (http/https only)
 * to prevent XSS attacks via javascript: or data: URLs
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Determine source type from URL or just show "PDF" for PDF sources
 */
function getSourceType(url: string): string {
  if (url.startsWith('/uploads/') || url.endsWith('.pdf')) {
    return 'PDF';
  }
  if (url.includes('gutenberg.org')) {
    return 'Project Gutenberg';
  }
  return 'URL';
}

/**
 * TextCard displays a single text item from the library
 * with metadata and chunk count information.
 */
export function TextCard({ text }: TextCardProps) {
  const { title, author, year, genre, chunk_count, source_url } = text;

  const sourceType = getSourceType(source_url);
  const showExternalLink = source_url && !source_url.startsWith('/uploads/') && isSafeUrl(source_url);

  return (
    <article className="card text-card">
      <div className="text-card__header">
        <h3 className="card__title text-card__title">
          {title || <em className="text-muted">Untitled</em>}
        </h3>
        {author && (
          <p className="card__meta text-card__author">
            by {author}
            {year && <span className="text-card__year"> ({year})</span>}
          </p>
        )}
      </div>

      <div className="text-card__details">
        {genre && (
          <span className="text-card__detail">
            <strong>Genre:</strong> {genre}
          </span>
        )}
        <span className="text-card__detail">
          <strong>Source:</strong> {sourceType}
        </span>
        <span className="text-card__detail">
          <strong>Chunks:</strong> {chunk_count?.toLocaleString() ?? 0}
        </span>
      </div>

      {showExternalLink && (
        <div className="text-card__source">
          <a
            href={source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-card__source-link"
          >
            View original source ↗
          </a>
        </div>
      )}
    </article>
  );
}

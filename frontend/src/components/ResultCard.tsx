import { Link, useSearchParams } from 'react-router-dom';
import type { SearchResult } from '@/types/api';

export interface ResultCardProps {
  result: SearchResult;
  rank: number;
}

/**
 * ResultCard displays a single search result with passage text,
 * metadata, and similarity score. Clicking navigates to the chunk detail page.
 */
export function ResultCard({ result, rank }: ResultCardProps) {
  const { id, text, score, title, author, year, genre } = result;
  const [searchParams] = useSearchParams();

  // Format score as percentage (0.85 -> 85%)
  const scorePercent = Math.round(score * 100);

  // Preserve search query when navigating to chunk page
  const query = searchParams.get('q');
  const chunkUrl = query ? `/chunk/${id}?from=${encodeURIComponent(query)}` : `/chunk/${id}`;

  return (
    <article className="result-card" aria-label={`Search result ${rank}`}>
      <header className="result-card__header">
        <div className="result-card__rank" aria-label="Result rank">
          {rank}
        </div>
        <div className="result-card__meta">
          {title && <cite className="result-card__title">{title}</cite>}
          {author && <span className="result-card__author">{author}</span>}
          {year && <span className="result-card__year">({year})</span>}
          {genre && <span className="result-card__genre">{genre}</span>}
        </div>
        <div className="result-card__score" aria-label={`Similarity score: ${scorePercent}%`}>
          <span className="result-card__score-value">{scorePercent}%</span>
          <span className="result-card__score-label">match</span>
        </div>
      </header>

      <Link
        to={chunkUrl}
        className="result-card__link"
        aria-label={`View full context for result ${rank}`}
      >
        <blockquote className="result-card__text">
          {text}
        </blockquote>
      </Link>
    </article>
  );
}

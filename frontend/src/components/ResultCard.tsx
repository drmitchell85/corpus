import type { SearchResult } from '@/types/api';

export interface ResultCardProps {
  result: SearchResult;
  rank: number;
}

/**
 * ResultCard displays a single search result with passage text,
 * metadata, and similarity score.
 */
export function ResultCard({ result, rank }: ResultCardProps) {
  const { text, score, title, author, year, genre } = result;

  // Format score as percentage (0.85 -> 85%)
  const scorePercent = Math.round(score * 100);

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

      <blockquote className="result-card__text">
        {text}
      </blockquote>
    </article>
  );
}

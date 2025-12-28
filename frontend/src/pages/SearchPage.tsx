import { useState, useEffect } from 'react';
import { PageLayout, ResultCard, Pagination } from '@/components';
import { SearchInput } from '@/components/SearchInput';
import { useSearch } from '@/hooks';
import type { SearchResult } from '@/types/api';

const RESULTS_PER_PAGE = 10;
// Fetch more results for client-side pagination (100 results max)
const API_FETCH_LIMIT = 100;

export function SearchPage() {
  const { results, isLoading, error, hasSearched, search } = useSearch();
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 if current page is out of bounds (when results change)
  useEffect(() => {
    if (results && results.total > 0) {
      const maxPage = Math.ceil(results.results.length / RESULTS_PER_PAGE);
      if (currentPage > maxPage) {
        setCurrentPage(1);
      }
    }
  }, [results]); // Only depend on results, not currentPage to avoid infinite loop

  const handleSearch = (query: string) => {
    setCurrentPage(1); // Reset to first page on new search
    search(query, API_FETCH_LIMIT);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of results on page change
    // Respect user's motion preferences for accessibility
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <PageLayout currentPath="/">
      <h1>Search the Corpus</h1>
      <p>
        Search across ingested texts using semantic similarity. Enter a passage,
        phrase, or concept to find related content from the library.
      </p>

      <SearchInput onSearch={handleSearch} isLoading={isLoading} />

      {error && (
        <div className="status status--error" role="alert">
          {error}
        </div>
      )}

      {isLoading && (
        <p className="loading" aria-live="polite">
          Searching
        </p>
      )}

      {hasSearched && !isLoading && !error && results && results.total > 0 && (
        <SearchResults
          query={results.query}
          results={results.results}
          total={results.total}
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
      )}

      {hasSearched && !isLoading && !error && results?.total === 0 && (
        <p className="text-muted">
          No results found for &ldquo;{results.query}&rdquo;. Try a different query.
        </p>
      )}
    </PageLayout>
  );
}

interface SearchResultsProps {
  query: string;
  results: SearchResult[];
  total: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

function SearchResults({
  query,
  results,
  total,
  currentPage,
  onPageChange,
}: SearchResultsProps) {
  if (total === 0) return null;

  // Calculate pagination
  const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIndex = startIndex + RESULTS_PER_PAGE;
  const paginatedResults = results.slice(startIndex, endIndex);

  return (
    <div className="search-results">
      <p className="search-results__summary">
        Found <strong>{total}</strong> result{total !== 1 ? 's' : ''} for
        &ldquo;{query}&rdquo;
        {results.length < total && (
          <span className="text-muted text-small">
            {' '}(showing top {results.length})
          </span>
        )}
      </p>

      <ul className="search-results__list" role="list">
        {paginatedResults.map((result, index) => {
          const rank = startIndex + index + 1;
          return (
            <li key={result.id}>
              <ResultCard result={result} rank={rank} />
            </li>
          );
        })}
      </ul>

      <Pagination
        currentPage={currentPage}
        totalItems={results.length}
        itemsPerPage={RESULTS_PER_PAGE}
        onPageChange={onPageChange}
      />
    </div>
  );
}

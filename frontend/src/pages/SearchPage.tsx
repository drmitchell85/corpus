import { PageLayout } from '@/components';
import { SearchInput } from '@/components/SearchInput';
import { useSearch } from '@/hooks';

export function SearchPage() {
  const { results, isLoading, error, hasSearched, search } = useSearch();

  return (
    <PageLayout currentPath="/">
      <h1>Search the Corpus</h1>
      <p>
        Search across ingested texts using semantic similarity. Enter a passage,
        phrase, or concept to find related content from the library.
      </p>

      <SearchInput onSearch={search} isLoading={isLoading} />

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
        <SearchResults query={results.query} total={results.total} />
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
  total: number;
}

function SearchResults({ query, total }: SearchResultsProps) {
  if (total === 0) return null;

  return (
    <div className="search-results">
      <p className="search-results__summary">
        Found <strong>{total}</strong> result{total !== 1 ? 's' : ''} for
        &ldquo;{query}&rdquo;
      </p>
      <p className="text-muted text-small">
        <em>Result cards coming in Phase 4.4</em>
      </p>
    </div>
  );
}

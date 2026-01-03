import { useState, type FormEvent, type ChangeEvent } from 'react';

export interface SearchInputProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  initialValue?: string;
}

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;

export function SearchInput({
  onSearch,
  isLoading = false,
  placeholder = 'Enter a passage or concept to search...',
  initialValue = '',
}: SearchInputProps) {
  const [query, setQuery] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();

    // Validate query length
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setError(`Search query must be at least ${MIN_QUERY_LENGTH} characters`);
      return;
    }
    if (trimmed.length > MAX_QUERY_LENGTH) {
      setError(`Search query must not exceed ${MAX_QUERY_LENGTH} characters`);
      return;
    }

    setError(null);
    onSearch(trimmed);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  const trimmedLength = query.trim().length;
  const isQueryValid = trimmedLength >= MIN_QUERY_LENGTH && trimmedLength <= MAX_QUERY_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <div className="search-form__row">
        <label htmlFor="search-input" className="visually-hidden">
          Search query
        </label>
        <input
          id="search-input"
          type="search"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={isLoading}
          aria-describedby={error ? 'search-error' : 'search-help'}
          aria-invalid={!!error}
          className="search-form__input"
        />
        <button
          type="submit"
          disabled={isLoading || !isQueryValid}
          aria-busy={isLoading}
          className="search-form__button"
        >
          {isLoading ? 'Searching' : 'Search'}
        </button>
      </div>
      {error && (
        <p id="search-error" className="form-error" role="alert">
          {error}
        </p>
      )}
      {!error && (
        <p id="search-help" className="form-help">
          Search finds passages semantically similar to your query across all ingested texts.
        </p>
      )}
    </form>
  );
}

import { useState, type FormEvent, type ChangeEvent } from 'react';

export interface SearchInputProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  initialValue?: string;
}

export function SearchInput({
  onSearch,
  isLoading = false,
  placeholder = 'Enter a passage or concept to search...',
  initialValue = '',
}: SearchInputProps) {
  const [query, setQuery] = useState(initialValue);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

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
          aria-describedby="search-help"
          className="search-form__input"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="search-form__button"
        >
          {isLoading ? 'Searching' : 'Search'}
        </button>
      </div>
      <p id="search-help" className="form-help">
        Search finds passages semantically similar to your query across all ingested texts.
      </p>
    </form>
  );
}

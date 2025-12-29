export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

/**
 * Pagination component for navigating through paginated results.
 * Displays current page info and prev/next buttons.
 */
export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const handlePrevious = () => {
    if (hasPrevious) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onPageChange(currentPage + 1);
    }
  };

  // Don't render if there's only one page or no items
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label="Results pagination">
      <button
        className="pagination__button btn"
        onClick={handlePrevious}
        disabled={!hasPrevious}
        aria-label="Previous page"
      >
        ← Previous
      </button>

      <div className="pagination__info" aria-live="polite" aria-atomic="true">
        <span className="pagination__range">
          {startItem}–{endItem}
        </span>
        {' of '}
        <span className="pagination__total">{totalItems}</span>
      </div>

      <button
        className="pagination__button btn"
        onClick={handleNext}
        disabled={!hasNext}
        aria-label="Next page"
      >
        Next →
      </button>
    </nav>
  );
}

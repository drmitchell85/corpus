import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout, TextCard, Pagination } from '@/components';
import { useTexts } from '@/hooks';

const TEXTS_PER_PAGE = 20;

export function LibraryPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const { data, isLoading, error, fetchTexts } = useTexts(currentPage, TEXTS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchTexts(page, TEXTS_PER_PAGE);
    // Scroll to top on page change
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <PageLayout currentPath="/library">
      <h1>Text Library</h1>
      <p>
        Browse all texts that have been ingested into the corpus. Each text has been
        chunked and embedded for semantic search.
      </p>

      {error && (
        <div className="status status--error" role="alert">
          {error}
        </div>
      )}

      {isLoading && (
        <p className="loading" aria-live="polite">
          Loading library
        </p>
      )}

      {!isLoading && !error && data && (
        <>
          {data.total > 0 ? (
            <div className="library-view">
              <p className="library-summary">
                Showing <strong>{data.texts.length}</strong> of{' '}
                <strong>{data.total}</strong> text{data.total !== 1 ? 's' : ''}
              </p>

              <ul className="library-list" role="list">
                {data.texts.map((text) => (
                  <li key={text.id}>
                    <TextCard text={text} />
                  </li>
                ))}
              </ul>

              {data.total_pages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalItems={data.total}
                  itemsPerPage={TEXTS_PER_PAGE}
                  onPageChange={handlePageChange}
                />
              )}
            </div>
          ) : (
            <div className="library-list__empty">
              <p>No texts in the library yet.</p>
              <p>
                <Link to="/ingest">Ingest some texts</Link> to get started.
              </p>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

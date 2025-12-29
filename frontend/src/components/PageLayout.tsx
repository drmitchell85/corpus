import type { ReactNode } from 'react';
import { NavHeader } from './NavHeader';

const NAV_LINKS = [
  { label: 'Search', href: '/' },
  { label: 'Library', href: '/library' },
  { label: 'Ingest', href: '/ingest' },
  { label: 'Upload', href: '/upload' },
];

interface PageLayoutProps {
  children: ReactNode;
  currentPath?: string;
  narrow?: boolean;
}

export function PageLayout({
  children,
  currentPath = '/',
  narrow = false,
}: PageLayoutProps) {
  return (
    <div className="page-layout">
      <NavHeader
        title="Corpus"
        links={NAV_LINKS}
        currentPath={currentPath}
      />
      <main className={`page-content${narrow ? ' page-content--narrow' : ''}`}>
        {children}
      </main>
      <footer className="page-footer">
        <p className="mb-0">
          Corpus &mdash; A text search and ingestion system
        </p>
      </footer>
    </div>
  );
}

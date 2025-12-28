import { PageLayout } from '@/components';

function App() {
  return (
    <PageLayout currentPath="/">
      <h1>Search the Corpus</h1>
      <p>
        Search across ingested texts using semantic similarity. Enter a passage,
        phrase, or concept to find related content from the library.
      </p>
      <hr />
      <p className="text-muted text-small">
        <em>Search interface coming in Phase 4.3</em>
      </p>
    </PageLayout>
  );
}

export default App;

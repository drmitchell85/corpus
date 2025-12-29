import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SearchPage, LibraryPage, IngestPage } from '@/pages';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/ingest" element={<IngestPage />} />
        {/* Redirect unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

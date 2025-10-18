import React, { useState } from 'react';

// Base URL for backend API. When deploying, define VITE_API_URL in your build environment
// so that API calls go to your Render backend. During local dev, this defaults to an empty string,
// which proxies to the same origin when using `vite dev`.
const API_BASE: string = (import.meta as any).env?.VITE_API_URL || '';

export default function App() {
  // state to hold user input and fetched data
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ symbol: string; price: number; pe: number; forwardPE: number; score: number } | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const resp = await fetch(`${API_BASE}/api/quote?symbol=${encodeURIComponent(query.trim())}`);
      if (!resp.ok) {
        const msg = await resp.json();
        throw new Error(msg.error || 'Request failed');
      }
      const result = await resp.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-8 gap-6">
      <header className="w-full max-w-4xl text-center">
        <img src="valora-logo.svg" alt="Valora logo" className="mx-auto w-16 h-16 mb-4" />
        <h1 className="text-4xl font-bold mb-2">Valora</h1>
        <p className="text-gray-500 dark:text-gray-400">Transparent Smart Score for your favorite stocks</p>
      </header>
      <main className="w-full max-w-4xl space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Enter ticker symbol (e.g., AAPL)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-md">
            {error}
          </div>
        )}
        {data && (
          <div className="border border-gray-300 dark:border-gray-600 p-4 rounded-md bg-white dark:bg-gray-800">
            <h2 className="text-xl font-semibold mb-2">{data.symbol} Smart Score</h2>
            <p className="mb-1">Price: ${data.price}</p>
            <p className="mb-1">Trailing P/E: {data.pe ?? 'N/A'}</p>
            <p className="mb-1">Forward P/E: {data.forwardPE ?? 'N/A'}</p>
            <p className="font-bold">Smart Score: {Math.round(data.score)}</p>
          </div>
        )}
      </main>
    </div>
  );
}
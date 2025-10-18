import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-8 gap-6">
      <header className="w-full max-w-4xl text-center">
        <img src="/valora-logo.svg" alt="Valora logo" className="mx-auto w-16 h-16 mb-4" />
        <h1 className="text-4xl font-bold mb-2">Valora</h1>
        <p className="text-gray-500 dark:text-gray-400">Transparent Smart Score for your favorite stocks</p>
      </header>
      <main className="w-full max-w-4xl">
        {/* TODO: Implement ticker search, cards and charts */}
        <div className="p-4 border border-dashed border-gray-400 dark:border-gray-600 rounded-lg text-center">
          Coming soon: search for a ticker to view its Smart Score.
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { SeedTrack, GeneratedPlaylist } from '@/lib/types';

interface GenerateButtonProps {
  seeds: SeedTrack[];
  canGenerate: boolean;
  onResult: (playlist: GeneratedPlaylist) => void;
}

export default function GenerateButton({ seeds, canGenerate, onResult }: GenerateButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      });

      if (!res.ok) {
        const data = await res.json();
        const parts = [data.error, data.detail].filter(Boolean);
        throw new Error(parts.length ? parts.join(': ') : 'Generation failed');
      }

      const playlist = await res.json();
      onResult(playlist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || isLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#1DB954] px-6 py-4 text-lg font-semibold text-black transition-all hover:bg-[#1ed760] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#1DB954]"
      >
        {isLoading ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            Building your playlist...
          </>
        ) : (
          'Generate Forward Playlist'
        )}
      </button>
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

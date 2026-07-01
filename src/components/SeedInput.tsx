'use client';

import { useState, useRef, useEffect } from 'react';
import { SeedTrack } from '@/lib/types';
import SeedCard from './SeedCard';
import Image from 'next/image';

interface SeedInputProps {
  seeds: SeedTrack[];
  onAddSeed: (track: SeedTrack) => void;
  onRemoveSeed: (id: string) => void;
  locked?: boolean;
}

export default function SeedInput({ seeds, onAddSeed, onRemoveSeed, locked }: SeedInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SeedTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowDropdown(true);
        }
      } catch {
        console.error('Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelect = (track: SeedTrack) => {
    onAddSeed(track);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  const isFull = seeds.length >= 5;

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={isFull ? 'Remove a seed to add a new one' : 'Search for a song...'}
          disabled={locked || isFull}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 outline-none transition-colors focus:border-[#1DB954] disabled:opacity-50"
        />
        {isSearching && (
          <div className="absolute right-3 top-3.5">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#1DB954]" />
          </div>
        )}

        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl">
            {results.map((track) => {
              const isSelected = seeds.some((s) => s.id === track.id);
              return (
                <button
                  key={track.id}
                  onClick={() => !isSelected && handleSelect(track)}
                  disabled={isSelected}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  {track.albumArt && (
                    <Image
                      src={track.albumArt}
                      alt={track.album}
                      width={40}
                      height={40}
                      className="rounded"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{track.name}</p>
                    <p className="truncate text-xs text-gray-400">{track.artist} &middot; {track.album}</p>
                  </div>
                  {isSelected && (
                    <span className="text-xs text-[#1DB954]">Added</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {seeds.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            {seeds.length}/5 seeds selected
            {seeds.length < 3 && ` — need at least ${3 - seeds.length} more`}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {seeds.map((seed) => (
              <SeedCard key={seed.id} seed={seed} onRemove={onRemoveSeed} locked={locked} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

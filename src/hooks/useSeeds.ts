'use client';

import { useState } from 'react';
import { SeedTrack } from '@/lib/types';

export function useSeeds() {
  const [seeds, setSeeds] = useState<SeedTrack[]>([]);

  const addSeed = (track: SeedTrack) => {
    setSeeds((prev) => {
      if (prev.length >= 5) return prev;
      if (prev.some((s) => s.id === track.id)) return prev;
      return [...prev, track];
    });
  };

  const removeSeed = (id: string) => {
    setSeeds((prev) => prev.filter((s) => s.id !== id));
  };

  const clearSeeds = () => setSeeds([]);

  const canGenerate = seeds.length >= 3 && seeds.length <= 5;

  return { seeds, addSeed, removeSeed, canGenerate, clearSeeds };
}

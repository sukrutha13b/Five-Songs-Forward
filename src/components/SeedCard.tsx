'use client';

import Image from 'next/image';
import { SeedTrack } from '@/lib/types';

interface SeedCardProps {
  seed: SeedTrack;
  onRemove: (id: string) => void;
  locked?: boolean;
}

export default function SeedCard({ seed, onRemove, locked }: SeedCardProps) {
  return (
    <div className="relative flex items-center gap-3 rounded-xl bg-white/5 p-3 transition-colors hover:bg-white/10">
      {seed.albumArt && (
        <Image
          src={seed.albumArt}
          alt={seed.album}
          width={64}
          height={64}
          className="rounded-lg"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{seed.name}</p>
        <p className="truncate text-sm text-gray-400">{seed.artist}</p>
      </div>
      {!locked && (
        <button
          onClick={() => onRemove(seed.id)}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-gray-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
          aria-label={`Remove ${seed.name}`}
        >
          &times;
        </button>
      )}
    </div>
  );
}

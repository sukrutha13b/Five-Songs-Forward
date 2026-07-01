'use client';

import Image from 'next/image';
import { CandidateTrack } from '@/lib/types';

const sourceBadge = {
  catalogue: { label: 'New Find', color: 'bg-blue-500/20 text-blue-400' },
  'related-artist': { label: 'Related', color: 'bg-purple-500/20 text-purple-400' },
  'rescued-library': { label: 'From Your Library', color: 'bg-green-500/20 text-green-400' },
};

export default function TrackCard({ track }: { track: CandidateTrack }) {
  const badge = sourceBadge[track.source];

  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3 transition-colors hover:bg-white/10">
      {track.albumArt && (
        <Image
          src={track.albumArt}
          alt={track.album}
          width={48}
          height={48}
          className="rounded-lg"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{track.name}</p>
            <p className="truncate text-sm text-gray-400">{track.artist}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        {track.explanation && (
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{track.explanation}</p>
        )}
      </div>
    </div>
  );
}

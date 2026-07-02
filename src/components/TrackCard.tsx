'use client';

import Image from 'next/image';
import { CandidateTrack } from '@/lib/types';

const sourceBadge: Record<CandidateTrack['source'], { label: string; color: string }> = {
  'named-artist': { label: 'Adjacent Artist', color: 'bg-purple-500/20 text-purple-400' },
  discovery: { label: 'Discovery', color: 'bg-[#1DB954]/20 text-[#1DB954]' },
};

const SPOTIFY_ICON_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';

export default function TrackCard({ track }: { track: CandidateTrack }) {
  const badge = sourceBadge[track.source];
  const openUrl = `https://open.spotify.com/track/${track.id}`;

  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3 transition-colors hover:bg-white/10">
      {track.albumArt && (
        <Image
          src={track.albumArt}
          alt={track.album}
          width={56}
          height={56}
          className="rounded-lg"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{track.name}</p>
            <p className="truncate text-sm text-gray-400">{track.artist}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3">
          {track.previewUrl ? (
            <audio
              controls
              preload="none"
              src={track.previewUrl}
              className="h-8 max-w-[240px] flex-1"
            />
          ) : (
            <span className="text-xs text-gray-600">No preview available</span>
          )}

          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#1DB954] px-3 py-1 text-xs font-semibold text-black transition-colors hover:bg-[#1ed760]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d={SPOTIFY_ICON_PATH} />
            </svg>
            Open on Spotify
          </a>
        </div>
      </div>
    </div>
  );
}

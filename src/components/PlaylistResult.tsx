'use client';

import { GeneratedPlaylist } from '@/lib/types';
import TrackCard from './TrackCard';

interface PlaylistResultProps {
  playlist: GeneratedPlaylist;
  onStartOver: () => void;
}

export default function PlaylistResult({ playlist, onStartOver }: PlaylistResultProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mb-2 text-4xl">🎧</div>
        <h2 className="text-2xl font-bold text-white">Your Forward Playlist is Ready</h2>
        <p className="mx-auto mt-2 max-w-xl text-gray-400">{playlist.directionSummary}</p>
      </div>

      {(playlist.keywords.length > 0 || playlist.artists.length > 0) && (
        <div className="mx-auto max-w-2xl space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {playlist.keywords.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Keywords
              </p>
              <div className="flex flex-wrap gap-1.5">
                {playlist.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-[#1DB954]/15 px-2.5 py-0.5 text-xs text-[#1DB954]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {playlist.artists.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Adjacent artists
              </p>
              <div className="flex flex-wrap gap-1.5">
                {playlist.artists.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs text-purple-300"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={onStartOver}
          className="rounded-full border border-white/20 px-6 py-3 font-medium text-white transition-colors hover:bg-white/5"
        >
          Start Over
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">{playlist.tracks.length} Tracks</h3>
        <div className="space-y-2">
          {playlist.tracks.map((track, index) => (
            <TrackCard key={`${track.id}-${index}`} track={track} />
          ))}
        </div>
      </div>

      <p className="pt-4 text-center text-xs text-gray-600">Data from Spotify</p>
    </div>
  );
}

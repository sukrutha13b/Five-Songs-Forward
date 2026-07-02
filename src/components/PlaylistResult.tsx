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

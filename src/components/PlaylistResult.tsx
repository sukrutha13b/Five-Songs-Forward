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
        <p className="mt-2 text-gray-400">{playlist.seedSummary}</p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <a
          href={playlist.spotifyPlaylistUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-3 font-semibold text-black transition-all hover:bg-[#1ed760] hover:scale-105"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Open in Spotify
        </a>
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
    </div>
  );
}

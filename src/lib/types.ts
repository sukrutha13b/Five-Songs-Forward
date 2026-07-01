export interface SeedTrack {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  album: string;
  albumArt: string;
  previewUrl: string | null;
  uri: string;
}

export type CandidateSource = 'catalogue' | 'artist-suggestion' | 'recently-played';

export interface CandidateTrack extends SeedTrack {
  source: CandidateSource;
  score: number;
  explanation?: string;
}

export interface GeneratedPlaylist {
  spotifyPlaylistId: string;
  spotifyPlaylistUrl: string;
  tracks: CandidateTrack[];
  seedSummary: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  email: string | null;
  imageUrl: string | null;
}

export interface LLMInterpretation {
  directionSummary: string;
  searchQueries: string[];
  artistSuggestions: string[];
  genreKeywords: string[];
}

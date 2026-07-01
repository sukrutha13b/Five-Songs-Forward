export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

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

export interface AudioFeatures {
  energy: number;
  acousticness: number;
  valence: number;
  tempo: number;
  instrumentalness: number;
  danceability: number;
  liveness: number;
}

export interface SeedWithFeatures extends SeedTrack {
  features: AudioFeatures | null;
}

export interface CandidateTrack extends SeedTrack {
  features: AudioFeatures | null;
  source: 'catalogue' | 'related-artist' | 'rescued-library';
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
  email: string;
  imageUrl: string | null;
}

export interface LLMInterpretation {
  directionSummary: string;
  searchQueries: string[];
  targetFeatures: {
    energy: { min: number; max: number };
    acousticness: { min: number; max: number };
    valence: { min: number; max: number };
    tempo: { min: number; max: number };
  };
  genreKeywords: string[];
}

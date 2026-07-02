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

export type CandidateSource = 'named-artist' | 'discovery';

export interface CandidateTrack extends SeedTrack {
  source: CandidateSource;
  score: number;
}

export interface GeneratedPlaylist {
  directionSummary: string;
  artists: string[];
  keywords: string[];
  tracks: CandidateTrack[];
}

export interface LLMInterpretation {
  directionSummary: string;
  artists: string[];
  keywords: string[];
}

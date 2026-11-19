type ArtistCredit = {
  url?: string;
  artist: string;
  title?: string;
  primaryArtist?: string;
  featuredArtist?: string;
  overrides?: { artist?: string };
  lyrics?: { artist: string } | null;
  originalMetadata?: { title: string };
};
export function primaryArtistFor(track: ArtistCredit): string;
export function featuredArtistFor(track: ArtistCredit): string;

export type ArtistRow = {
  id: string;
  name: string;
  photo_url: string | null;
  source: "database" | "socialcrawl" | "google_cse" | "brave" | "deezer" | "manual" | "none";
  created_at: string;
};

export type EventRow = {
  id: string;
  event_date: string;
  artist_name_raw: string;
  artist_id: string | null;
  venue: string;
  city: string;
  utility_line: string | null;
  status: "pending" | "photo_missing" | "generating" | "done" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PosterRow = {
  id: string;
  event_id: string;
  image_url: string;
  variant: "masthead" | "light" | "flyer" | "halo";
  created_at: string;
};

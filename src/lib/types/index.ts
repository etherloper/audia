export interface Book {
  id: number;
  title: string;
  author: string;
  narrator: string | null;
  cover_art: string | null;
  description: string | null;
  folder_path: string;
  total_duration_secs: number;
  is_favourite: number;
  series: string | null;
  series_index: number | null;
  /** One genre per line (see utils/tags.ts) */
  genres: string | null;
  /** The user's own tags, one per line */
  tags: string | null;
  /** Unused since online lookups became manual ("Find online"); the column stays in the schema */
  cover_fetch_attempted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: number;
  book_id: number;
  chapter_index: number;
  title: string;
  file_path: string;
  duration_secs: number;
  start_offset_secs: number;
}

export interface Progress {
  book_id: number;
  chapter_index: number;
  position_secs: number;
  playback_rate: number;
  /** Position measured from the start of the book (position_secs is per chapter) */
  book_position_secs: number;
  finished_at: string | null;
  listened_secs: number;
  updated_at: string;
}

export interface Bookmark {
  id: number;
  book_id: number;
  chapter_index: number;
  position_secs: number;
  label: string | null;
  created_at: string;
}

export interface AudioFileMeta {
  title: string;
  author: string;
  album: string;
  narrator: string | null;
  description: string | null;
  file_path: string;
  duration_secs: number;
  track_number: number | null;
  start_offset_secs: number;
  series: string | null;
  series_index: number | null;
  cover_art: string | null;
}

export interface ScannedBook {
  title: string;
  author: string;
  narrator: string | null;
  description: string | null;
  cover_art: string | null;
  folder_path: string;
  series: string | null;
  series_index: number | null;
  /** Raw genre tag from the files */
  genre: string | null;
  files: AudioFileMeta[];
}

export type ViewName = "home" | "library" | "book" | "settings" | "stats";
export type SortOption = "title" | "author" | "recent" | "added" | "length" | "progress";
export type GroupByOption = "none" | "author" | "series" | "genre";
export type FilterOption = "all" | "in-progress" | "not-started" | "finished" | "favourites";
export type ThemeMode = "dark" | "light" | "system";

export interface BookGroup {
  label: string;
  books: Book[];
}

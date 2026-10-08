import type { Book } from "../types";
import { libraryState } from "../state/library.svelte";
import { playerState } from "../state/player.svelte";
import { uiState } from "../state/ui.svelte";

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  action: () => void;
}

/**
 * The actions for a book, shared by its card, its list row and its page.
 * `onEdit` opens the metadata editor; `onBookPage` leaves out "View Details".
 */
export function bookMenuItems(book: Book, options: { onEdit: () => void; onBookPage?: boolean }): MenuItem[] {
  const progress = libraryState.progressMap.get(book.id);
  const items: MenuItem[] = [{ label: "Play", icon: "play", action: () => playerState.openBook(book.id) }];
  if (!options.onBookPage) {
    items.push({ label: "View Details", icon: "details", action: () => uiState.navigateToBook(book.id) });
  }
  items.push(
    { label: "Edit Details", icon: "edit", action: options.onEdit },
    {
      label: book.is_favourite ? "Remove from Favourites" : "Add to Favourites",
      icon: book.is_favourite ? "heart-filled" : "heart",
      action: () => libraryState.toggleFavourite(book.id),
    },
  );
  if (!progress?.finished_at) {
    items.push({ label: "Mark as Finished", icon: "check", action: () => libraryState.markAsFinished(book.id) });
  }
  if (progress) {
    items.push({ label: "Clear Progress", icon: "reset", action: () => libraryState.clearProgress(book.id) });
  }
  items.push({ label: "Remove from Library", icon: "trash", danger: true, action: () => libraryState.removeBook(book.id) });
  return items;
}

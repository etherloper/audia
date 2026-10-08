/**
 * Svelte action: move an element to <body>.
 *
 * Use it for menus and dialogs rendered inside components such as book cards.
 * Ancestors with `content-visibility`, `contain`, `transform` or `filter` become
 * the containing block for `position: fixed` children (and may clip them), so
 * a menu at the cursor would otherwise be offset or cut off.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}

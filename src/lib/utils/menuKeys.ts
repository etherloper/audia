/**
 * Svelte action for menus: ↑/↓ (wrapping), Home and End move focus between the
 * menu's items, and Escape calls `onescape`. Items are elements with a
 * role starting with "menuitem".
 */
export function menuKeys(node: HTMLElement, onescape: () => void) {
  let escape = onescape;
  const items = () => [...node.querySelectorAll<HTMLElement>("[role^='menuitem']:not([disabled])")];

  function onKeydown(e: KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = list[(i + 1) % list.length];
    else if (e.key === "ArrowUp") next = list[(i - 1 + list.length) % list.length];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      escape();
      return;
    } else return;
    e.preventDefault();
    next?.focus();
  }

  node.addEventListener("keydown", onKeydown);
  return {
    update(fn: () => void) {
      escape = fn;
    },
    destroy() {
      node.removeEventListener("keydown", onKeydown);
    },
  };
}

/** Focus the checked item if there is one, otherwise the first. */
export function focusMenu(node: HTMLElement | undefined) {
  const target =
    node?.querySelector<HTMLElement>("[role^='menuitem'][aria-checked='true']") ??
    node?.querySelector<HTMLElement>("[role^='menuitem']");
  target?.focus();
}

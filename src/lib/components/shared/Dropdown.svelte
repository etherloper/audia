<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { focusMenu, menuKeys } from "../../utils/menuKeys";

  /**
   * A button that opens a menu below it, styled like the right-click menu.
   * Closes on a choice, a click outside or Esc; arrow keys move between items.
   * The menu content gets a `close` function to call after a choice.
   */
  let {
    trigger,
    children,
    label,
    active = false,
    menuClass = "min-w-[180px]",
  }: {
    trigger: Snippet<[boolean]>;
    children: Snippet<[() => void]>;
    label: string;
    /** Highlight the button (a non-default choice is in effect) */
    active?: boolean;
    menuClass?: string;
  } = $props();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let buttonEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  function close(refocus = false) {
    open = false;
    if (refocus) buttonEl?.focus();
  }

  async function toggle(e: MouseEvent) {
    open = !open;
    if (!open) return;
    await tick();
    // Opened from the keyboard (Enter/Space on the button): put focus in the menu
    if (e.detail === 0) focusMenu(menuEl);
  }

  function onButtonKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      open = true;
      tick().then(() => focusMenu(menuEl));
    }
  }

  onMount(() => {
    function onDown(e: MouseEvent) {
      if (open && rootEl && !rootEl.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      // Esc while the mouse opened it (focus still on the button)
      if (open && e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<div class="relative" bind:this={rootEl}>
  <button
    bind:this={buttonEl}
    onclick={toggle}
    onkeydown={onButtonKeydown}
    aria-haspopup="menu"
    aria-expanded={open}
    class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all duration-200
      {active || open
        ? 'bg-warm-100/80 text-warm-700 dark:bg-white/[0.07] dark:text-neutral-300'
        : 'text-warm-400 hover:bg-warm-100/60 hover:text-warm-600 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300'}"
  >
    {@render trigger(open)}
    <svg class="h-3 w-3 shrink-0 transition-transform duration-150 {open ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div
      bind:this={menuEl}
      use:menuKeys={() => close(true)}
      role="menu"
      aria-label={label}
      class="menu-surface animate-scaleIn absolute right-0 top-full z-30 mt-1.5 max-h-[60vh] overflow-y-auto rounded-xl border py-1 shadow-xl shadow-black/10 dark:shadow-black/40 {menuClass}"
    >
      {@render children(() => close())}
    </div>
  {/if}
</div>

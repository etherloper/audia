<script lang="ts">
  /**
   * A list of values as removable chips, with a text box to add more. Enter or a
   * comma adds what's typed; Backspace in an empty box removes the last chip.
   * Suggestions (existing genres/tags) appear as you type.
   */
  let {
    values = $bindable(),
    suggestions = [],
    id,
    placeholder = "",
  }: {
    values: string[];
    suggestions?: string[];
    id?: string;
    placeholder?: string;
  } = $props();

  let text = $state("");
  let focused = $state(false);
  let highlighted = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();
  const listId = `tag-suggestions-${Math.random().toString(36).slice(2, 8)}`;

  const fold = (s: string) => s.toLocaleLowerCase();

  let matches = $derived.by(() => {
    const q = fold(text.trim());
    if (!q) return [];
    const taken = new Set(values.map(fold));
    return suggestions.filter((s) => !taken.has(fold(s)) && fold(s).includes(q)).slice(0, 6);
  });

  $effect(() => {
    matches;
    highlighted = 0;
  });

  function add(value: string) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean && !values.some((v) => fold(v) === fold(clean))) values = [...values, clean];
    text = "";
  }

  function remove(i: number) {
    values = values.filter((_, j) => j !== i);
    inputEl?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      if (!text.trim() && e.key === "Enter") return;
      e.preventDefault();
      add(matches.length && e.key === "Enter" && fold(matches[highlighted]).startsWith(fold(text.trim())) ? matches[highlighted] : text);
    } else if (e.key === "Backspace" && !text && values.length) {
      remove(values.length - 1);
    } else if (e.key === "ArrowDown" && matches.length) {
      e.preventDefault();
      highlighted = (highlighted + 1) % matches.length;
    } else if (e.key === "ArrowUp" && matches.length) {
      e.preventDefault();
      highlighted = (highlighted - 1 + matches.length) % matches.length;
    } else if (e.key === "Escape" && text) {
      // Clear the text rather than closing the dialog
      e.stopPropagation();
      text = "";
    }
  }

  function onPaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData("text") ?? "";
    if (!/[,;\n]/.test(pasted)) return;
    e.preventDefault();
    for (const part of pasted.split(/[,;\n]+/)) add(part);
  }
</script>

<div class="relative">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={() => inputEl?.focus()}
    class="mt-1.5 flex min-h-[38px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition-colors dark:bg-neutral-950
      {focused ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-warm-200 hover:border-warm-300 dark:border-neutral-700 dark:hover:border-neutral-600'}"
  >
    {#each values as value, i (value)}
      <span class="inline-flex items-center gap-1 rounded-md bg-warm-100 py-0.5 pl-2 pr-1 text-[12px] font-medium text-warm-800 dark:bg-white/[0.08] dark:text-neutral-200">
        {value}
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); remove(i); }}
          class="flex h-4 w-4 items-center justify-center rounded text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-800 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="Remove {value}"
        >
          <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
      </span>
    {/each}
    <input
      {id}
      bind:this={inputEl}
      bind:value={text}
      onkeydown={onKeydown}
      onpaste={onPaste}
      onfocus={() => (focused = true)}
      onblur={() => {
        focused = false;
        // Keep whatever was typed rather than silently dropping it
        if (text.trim()) add(text);
      }}
      placeholder={values.length ? "" : placeholder}
      role="combobox"
      aria-expanded={focused && matches.length > 0}
      aria-controls={listId}
      aria-autocomplete="list"
      class="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-warm-900 outline-none placeholder:text-warm-300 dark:text-neutral-100 dark:placeholder:text-neutral-600"
    />
  </div>

  {#if focused && matches.length > 0}
    <div id={listId} role="listbox" class="menu-surface absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border py-1 shadow-lg shadow-black/10 dark:shadow-black/40">
      {#each matches as match, i}
        <button
          type="button"
          role="option"
          aria-selected={i === highlighted}
          onmousedown={(e) => { e.preventDefault(); add(match); }}
          class="block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors
            {i === highlighted ? 'bg-warm-100 text-warm-900 dark:bg-white/[0.07] dark:text-white' : 'text-warm-700 dark:text-neutral-300'}"
        >
          {match}
        </button>
      {/each}
    </div>
  {/if}
</div>

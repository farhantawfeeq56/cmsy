"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { renamePage, savePageBlocks } from "../../../actions";
import {
  AFTER_BLOCK,
  componentBlock,
  componentFields,
  defaultValues,
  esc,
  parseValues,
  sanitize,
} from "./doc";

type ComponentOption = { id: string; name: string };
type SelectedBlock = {
  id: string;
  componentId: string;
  name: string;
  values: Record<string, string>;
};
type Format = { block: string; bold: boolean; italic: boolean; list: string };

const BLOCK_STYLES = [
  { value: "p", label: "Paragraph" },
  { value: "h1", label: "Title" },
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
  { value: "blockquote", label: "Quote" },
];

const NO_FORMAT: Format = { block: "p", bold: false, italic: false, list: "" };

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `b${Math.random().toString(36).slice(2)}`;

const findIsland = (root: HTMLElement, id: string) =>
  [...root.querySelectorAll<HTMLElement>("[data-block-id]")].find(
    (node) => node.getAttribute("data-block-id") === id,
  ) ?? null;

export function PageEditor({
  space,
  page,
  components,
}: {
  space: { slug: string; name: string };
  page: { id: string; title: string; html: string };
  components: ComponentOption[];
}) {
  // Frozen: the canvas is the source of truth once it is mounted, so a refresh
  // of the surrounding server tree must never write over what is being typed.
  const [initial] = useState(page.html);
  const [title, setTitle] = useState(page.title);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [format, setFormat] = useState<Format>(NO_FORMAT);
  const [selected, setSelected] = useState<SelectedBlock | null>(null);

  const root = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const savedTitle = useRef(page.title);
  const menu = useRef<HTMLDetailsElement | null>(null);

  /**
   * Autosave. Next dispatches Server Functions from one client in order, so a
   * later save can never be overtaken by an earlier one still in flight.
   */
  const save = useCallback(async () => {
    const canvas = root.current;
    if (!canvas) return;
    dirty.current = false;
    setStatus("saving");
    await savePageBlocks(page.id, sanitize(canvas.innerHTML));
    setStatus(dirty.current ? "dirty" : "saved");
  }, [page.id]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }, [save]);

  // A tab closed inside the debounce window still gets its last keystrokes out.
  useEffect(() => {
    const flush = () => {
      if (dirty.current) void save();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [save]);

  /** Puts the caret back where it was, for commands fired from the toolbar. */
  const focusCanvas = useCallback(() => {
    const canvas = root.current;
    const selection = document.getSelection();
    if (!canvas || !selection) return;
    canvas.focus();
    if (selection.anchorNode && canvas.contains(selection.anchorNode)) return;

    const range = savedRange.current;
    if (range && canvas.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    const end = document.createRange();
    end.selectNodeContents(canvas);
    end.collapse(false);
    selection.removeAllRanges();
    selection.addRange(end);
  }, []);

  const refreshFormat = useCallback(() => {
    const canvas = root.current;
    const selection = document.getSelection();
    if (!canvas || !selection?.anchorNode || !canvas.contains(selection.anchorNode)) return;
    savedRange.current = selection.getRangeAt(0).cloneRange();

    const block = (document.queryCommandValue("formatBlock") || "p").toLowerCase();
    const next: Format = {
      block: ["h1", "h2", "h3", "blockquote"].includes(block) ? block : "p",
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      list: document.queryCommandState("insertUnorderedList")
        ? "ul"
        : document.queryCommandState("insertOrderedList")
          ? "ol"
          : "",
    };
    setFormat((current) =>
      current.block === next.block &&
      current.bold === next.bold &&
      current.italic === next.italic &&
      current.list === next.list
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshFormat);
    return () => document.removeEventListener("selectionchange", refreshFormat);
  }, [refreshFormat]);

  /** The stored document becomes DOM exactly once, here. */
  const attachCanvas = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      if (node && !node.dataset.ready) {
        node.dataset.ready = "1";
        node.innerHTML = sanitize(initial);
      }
    },
    [initial],
  );

  // Browsers default to <div> for a new block; <p> is what the stored document
  // should read as, for anyone opening `pages.blocks` later.
  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "p");
  }, []);

  const run = (command: string, value?: string) => {
    focusCanvas();
    document.execCommand(command, false, value);
    markDirty();
    refreshFormat();
  };

  /** Every path into the canvas goes through here, and so through `sanitize`. */
  const insertHtml = (html: string) => {
    focusCanvas();
    document.execCommand("insertHTML", false, sanitize(html));
    markDirty();
    refreshFormat();
  };

  /**
   * Pastes and drops come from anywhere, so they are never handed to the
   * browser's own insertion: the markup is rebuilt through the allowlist first.
   */
  const insertPasted = (data: DataTransfer) => {
    const html = data.getData("text/html");
    const text = data.getData("text/plain");
    if (!html && !text) return;
    insertHtml(html || esc(text).replace(/\r?\n/g, "<br>"));
  };

  const insertComponent = (component: ComponentOption) => {
    const id = uid();
    insertHtml(
      componentBlock(id, component.id, component.name, defaultValues(component.name)) + AFTER_BLOCK,
    );
    menu.current?.removeAttribute("open");
  };

  const clearSelection = () => {
    root.current
      ?.querySelectorAll(".comp-block.is-selected")
      .forEach((node) => node.classList.remove("is-selected"));
    setSelected(null);
  };

  const selectIslandAt = (target: EventTarget | null) => {
    const canvas = root.current;
    if (!canvas) return;

    const island =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-block='component']")
        : null;
    if (!island) {
      clearSelection();
      return;
    }
    canvas
      .querySelectorAll(".comp-block.is-selected")
      .forEach((node) => node.classList.remove("is-selected"));
    island.classList.add("is-selected");
    setSelected({
      id: island.getAttribute("data-block-id") ?? "",
      componentId: island.getAttribute("data-component-id") ?? "",
      name: island.getAttribute("data-name") ?? "Component",
      values: parseValues(island.getAttribute("data-values")) ?? {},
    });
  };

  /** Redraws one island from its values, leaving the rest of the document alone. */
  const redrawBlock = (block: SelectedBlock, values: Record<string, string>) => {
    const canvas = root.current;
    const island = canvas ? findIsland(canvas, block.id) : null;
    if (!canvas || !island) return;
    island.outerHTML = sanitize(componentBlock(block.id, block.componentId, block.name, values));
    findIsland(canvas, block.id)?.classList.add("is-selected");
    markDirty();
  };

  const editField = (key: string, value: string) => {
    if (!selected) return;
    const values = { ...selected.values, [key]: value };
    setSelected({ ...selected, values });
    redrawBlock(selected, values);
  };

  const removeBlock = () => {
    const canvas = root.current;
    if (!canvas || !selected) return;
    findIsland(canvas, selected.id)?.remove();
    clearSelection();
    markDirty();
  };

  /** Renaming is its own save: it is rare, and it shows up on the space page. */
  const commitTitle = (value: string) => {
    const next = value.trim();
    if (!next) {
      setTitle(savedTitle.current);
      return;
    }
    if (next === savedTitle.current) return;
    savedTitle.current = next;
    const data = new FormData();
    data.set("id", page.id);
    data.set("title", next);
    void renamePage(data);
  };

  const statusLabel =
    status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : "Saved";

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[46rem] flex-wrap items-center gap-x-2 gap-y-2 px-6 py-3">
          <Link href={`/dashboard/${space.slug}`} className="btn-quiet -ml-2 shrink-0 rounded-md">
            ← {space.name}
          </Link>

          <span aria-hidden className="tool-sep" />

          <select
            className="tool tool-select"
            aria-label="Text style"
            value={format.block}
            onChange={(event) => run("formatBlock", `<${event.target.value}>`)}
          >
            {BLOCK_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>

          <Tool label="B" title="Bold (Ctrl+B)" active={format.bold} onClick={() => run("bold")} />
          <Tool
            label="I"
            title="Italic (Ctrl+I)"
            active={format.italic}
            onClick={() => run("italic")}
          />
          <Tool label="U" title="Underline (Ctrl+U)" onClick={() => run("underline")} />

          <span aria-hidden className="tool-sep" />

          <Tool
            label="• List"
            title="Bulleted list"
            active={format.list === "ul"}
            onClick={() => run("insertUnorderedList")}
          />
          <Tool
            label="1. List"
            title="Numbered list"
            active={format.list === "ol"}
            onClick={() => run("insertOrderedList")}
          />

          <span aria-hidden className="tool-sep" />

          <Tool
            label="Link"
            title="Add a link"
            onClick={() => {
              const url = window.prompt("Link URL", "https://");
              if (url) run("createLink", url);
            }}
          />
          <Tool
            label="Image"
            title="Add an image by URL"
            onClick={() => {
              const url = window.prompt("Image URL", "https://");
              if (url) run("insertImage", url);
            }}
          />

          <span aria-hidden className="tool-sep" />

          <Tool label="↶" title="Undo (Ctrl+Z)" onClick={() => run("undo")} />
          <Tool label="↷" title="Redo (Ctrl+Shift+Z)" onClick={() => run("redo")} />

          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-smoke" aria-live="polite">
              {statusLabel}
            </span>

            {/* Native <details>, like the rest of the dashboard. */}
            <details className="relative" ref={menu}>
              <summary className="btn cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                ＋ Component
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-64 max-w-[80vw] rounded-xl border border-line bg-white p-1 shadow-[0_6px_12px_#11111114]">
                {components.length === 0 ? (
                  <p className="px-3 py-2 text-xs leading-relaxed text-smoke">
                    No components in this space yet. Build one in Design first.
                  </p>
                ) : (
                  components.map((component) => (
                    <button
                      key={component.id}
                      type="button"
                      onClick={() => insertComponent(component)}
                      className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-[#1111110a]"
                    >
                      {component.name}
                    </button>
                  ))
                )}
                <Link
                  href={`/dashboard/${space.slug}?view=design#components`}
                  className="mt-1 block border-t border-line px-3 py-2 text-xs text-smoke hover:text-ink"
                >
                  Edit components in Design →
                </Link>
              </div>
            </details>
          </span>
        </div>
      </header>

      <div className="doc-page">
        <input
          className="doc-title"
          value={title}
          maxLength={120}
          aria-label="Page title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={(event) => commitTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />

        <div
          ref={attachCanvas}
          className="doc"
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Page body"
          onInput={markDirty}
          onPaste={(event) => {
            event.preventDefault();
            insertPasted(event.clipboardData);
          }}
          onDrop={(event) => {
            event.preventDefault();
            insertPasted(event.dataTransfer);
          }}
          onClick={(event) => selectIslandAt(event.target)}
        />
      </div>

      {selected && (
        <aside
          aria-label={`${selected.name} block`}
          className="fixed right-6 bottom-6 z-30 w-72 rounded-xl border border-line bg-card p-4 shadow-[0_6px_12px_#11111114]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="badge">{selected.name}</span>
            <button type="button" className="btn-quiet rounded-md" onClick={clearSelection}>
              Done
            </button>
          </div>

          <div className="mt-3 grid gap-3">
            {componentFields(selected.name).map((field) => (
              <label key={field.key} className="grid gap-1">
                <span className="label">{field.label}</span>
                <input
                  className="input"
                  value={selected.values[field.key] ?? field.fallback}
                  maxLength={300}
                  onChange={(event) => editField(field.key, event.target.value)}
                />
              </label>
            ))}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-smoke">
            The page sets this component&apos;s content. How it looks comes from the design
            system —{" "}
            <Link href={`/dashboard/${space.slug}?view=design#components`} className="underline">
              edit it in Design
            </Link>
            .
          </p>

          <button
            type="button"
            className="btn-quiet mt-2 w-full justify-center rounded-md"
            onClick={removeBlock}
          >
            Remove from page
          </button>
        </aside>
      )}
    </main>
  );
}

/** Toolbar buttons keep the selection: the canvas must never lose focus to them. */
function Tool({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-active={active ? "" : undefined}
      className="tool"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

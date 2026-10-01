"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentRow } from "@/db";
import { componentProblems, parseProps, renderComponent, type Prop } from "@/db/component-template";

/** A component shows itself: its own template, filled with its own fallbacks. */
function Preview({
  props,
  template,
  wide = false,
}: {
  props: Prop[];
  template: string;
  wide?: boolean;
}) {
  const problems = componentProblems(props, template);
  const html = renderComponent(props, template);

  if (!html) {
    return (
      <p className={`${wide ? "max-w-md" : "max-w-55"} text-center text-xs leading-relaxed text-smoke`}>
        {problems.length
          ? problems[0]
          : template
            ? "This template declares no props, so it has nothing to draw."
            : "No template yet. Declare its props and template below to see it here."}
      </p>
    );
  }

  return (
    <div
      className={`doc comp-preview w-full ${wide ? "max-w-md" : "max-w-55"}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** The props a component declares, as the table the overlay reads. */
function PropsTable({ props }: { props: Prop[] }) {
  if (props.length === 0) {
    return <p className="text-sm text-smoke">This component declares no props.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-line">
          <th className="label py-2 font-semibold">Key</th>
          <th className="label py-2 font-semibold">Label</th>
          <th className="label py-2 font-semibold">Default</th>
        </tr>
      </thead>
      <tbody>
        {props.map((prop) => (
          <tr key={prop.key} className="border-b border-line last:border-0">
            <td className="py-2 pr-3 align-top">
              <code className="rounded bg-[#1111110a] px-1 py-0.5 text-xs">{prop.key}</code>
            </td>
            <td className="py-2 pr-3 align-top">{prop.label}</td>
            <td className="py-2 align-top text-smoke">
              {prop.fallback ? prop.fallback : <span className="italic">empty</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ComponentCard({ component }: { component: ComponentRow }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const props = parseProps(component.props);

  useEffect(() => {
    if (!open) return;

    // Lock the page behind the overlay and put focus inside the dialog on the
    // first focusable, so Tab and Shift+Tab both stay trapped from the first key.
    const dialog = dialogRef.current;
    const card = cardRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The portal root is a direct child of body; everything else is behind the
    // modal, so hide it from assistive tech for the duration.
    const background = [...document.body.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== dialog,
    );
    const previousInert = background.map((el) => el.inert);
    background.forEach((el) => (el.inert = true));

    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    (focusable?.[0] ?? dialog)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      background.forEach((el, index) => (el.inert = previousInert[index]));
      document.body.style.overflow = previousOverflow;
      // Return focus to the card that opened the dialog.
      card?.focus();
    };
  }, [open]);

  return (
    <>
      <li className="overflow-hidden rounded-xl border border-line bg-card transition-shadow hover:shadow-[0_8px_24px_#1111110d]">
        <button
          ref={cardRef}
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <div
            className="pointer-events-none flex min-h-44 items-center justify-center border-b border-line p-6"
            style={{
              backgroundColor: "#ffffff",
              backgroundImage: "radial-gradient(#1111110f 1px, transparent 1px)",
              backgroundSize: "14px 14px",
            }}
          >
            <Preview props={props} template={component.template} />
          </div>

          <div className="flex flex-1 flex-col gap-2 p-5">
            <h3 className="truncate text-base font-semibold tracking-tight">{component.name}</h3>

            {component.description && (
              <p className="text-sm leading-relaxed text-smoke">{component.description}</p>
            )}

            <p className="mt-auto pt-1">
              {component.origin_space_name ? (
                <span className="badge">
                  Imported · {component.origin_name} from {component.origin_space_name}
                </span>
              ) : (
                <span className="badge badge-quiet">Local</span>
              )}
            </p>
          </div>
        </button>
      </li>

      {open &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={component.name}
            tabIndex={-1}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          >
            <div
              className="absolute inset-0 bg-[#11111133]"
              onClick={() => setOpen(false)}
            />
            <div
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_#11111126]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-line p-5">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold tracking-tight">
                    {component.name}
                  </h3>
                  <p className="mt-1 text-xs text-smoke">
                    {props.length} {props.length === 1 ? "prop" : "props"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-smoke transition-colors hover:bg-[#1111110d] hover:text-ink"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto p-5">
                <div
                  className="flex min-h-64 items-center justify-center rounded-xl border border-line p-10"
                  style={{
                    backgroundColor: "#ffffff",
                    backgroundImage: "radial-gradient(#1111110f 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                  }}
                >
                  <Preview props={props} template={component.template} wide />
                </div>

                {component.description && (
                  <p className="mt-4 text-sm leading-relaxed text-smoke">{component.description}</p>
                )}

                <h4 className="label mt-5 font-semibold">Props</h4>
                <div className="mt-3">
                  <PropsTable props={props} />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

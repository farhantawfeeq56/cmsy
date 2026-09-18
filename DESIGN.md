---
name: CMSy
description: CMSy — code-connected Components Editor and No-Code Editor on a warm paper canvas with Nohemi type
colors:
  primary: "#111111"
  secondary: "#272625"
  tertiary: "#B7EFB2"
  neutral: "#F6F5F3"
  surface: "#FBFAF9"
  on-primary: "#FFFFFF"
  muted: "#5E5C5A"
  border: "#1111110D"
  accent-orange: "#E8400D"
  accent-mint: "#B7EFB2"
  accent-yellow: "#FFEF99"
  accent-violet: "#E2DDFD"
typography:
  display:
    fontFamily: Nohemi
    fontSize: 3.5rem
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -2.8px
  h1:
    fontFamily: Nohemi
    fontSize: 2.75rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -1.76px
  h2:
    fontFamily: Nohemi
    fontSize: 1.75rem
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.48px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.3
  label:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 28px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
  section-muted:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.xl}"
    padding: 40px
  input:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  caption:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: 8px
  badge-mint:
    backgroundColor: "{colors.accent-mint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 8px
  badge-yellow:
    backgroundColor: "{colors.accent-yellow}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 8px
  badge-violet:
    backgroundColor: "{colors.accent-violet}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: 8px
  divider:
    backgroundColor: "{colors.border}"
    rounded: "{rounded.sm}"
    height: 1px
  signal-mint:
    backgroundColor: "{colors.tertiary}"
    rounded: "{rounded.pill}"
    size: 12px
  signal-orange:
    backgroundColor: "{colors.accent-orange}"
    rounded: "{rounded.pill}"
    size: 12px
---

## Overview

CMSy sits between a codebase and a visual editing interface: a Components
Editor for AI-assisted building and a No-Code Editor for structured content
like posts and landing copy. The UI pairs a warm paper canvas with
near-black ink headlines set in Nohemi, plus soft pastel signals for
status and categorization. The feel is a calm workbench — quiet surfaces,
one strong dark button, no gradients on core UI.

## Colors

Single ink anchors everything; mint drives action, orange signals alerts.

- **Primary (#111111):** Near-black ink. Headlines, body text, primary buttons.
- **Secondary (#272625):** Warm charcoal. Dark surfaces and emphasis text.
- **Tertiary (#B7EFB2):** Mint action color. Buttons, signal dots, and interaction highlights — always with ink text.
- **Neutral (#F6F5F3):** Warm paper editor background, softer than pure white.
- **Surface (#FBFAF9):** Editor cards, instruction blocks, and nav fills on top of Neutral.
- **On-primary (#FFFFFF):** Text on dark fills.
- **Muted (#5E5C5A):** Secondary copy, timestamps, and captions on light fills.
- **Border (#1111110D):** Hairline dividers between editor panes, ~5% ink on light.
- **Accent-orange (#E8400D):** Needs-attention signal dot, never behind text.
- **Accent-mint (#B7EFB2) / Accent-yellow (#FFEF99) / Accent-violet (#E2DDFD):** Pastel badges for content state (draft / review / published), always with ink text.

## Typography

Nohemi (variable, `--font-nohemi`) for display and headings; Plus Jakarta
Sans (`--font-secondary`) for body copy and all UI chrome — nav, buttons,
labels, badges. Tight tracking on Nohemi headlines, relaxed on Jakarta
body. Geist and Source Sans are retired — do not use them.

- **Display (Nohemi, 3.5rem / 1.0 / -2.8px):** Hero statements, one per viewport.
- **H1 (Nohemi, 2.75rem / 1.1):** Page and editor titles.
- **H2 (Nohemi, 1.75rem / 1.1):** Section and panel titles.
- **Body-md (Jakarta, 1rem / 1.3):** Paragraphs and agent instructions, max ~35rem measure.
- **Label (Jakarta, 0.875rem / medium):** Buttons, nav links, pills, code tags.

## Layout

Centered column, max content ~58rem, generous vertical rhythm.
Section padding 5.25rem top on desktop; editor card grids use
0.75–1.5rem gaps. Instruction and copy blocks center with auto margins.
Nav is a floating pill bar over the canvas, not a full-bleed strip.

## Elevation & Depth

Almost flat. Depth comes from layering paper tones, not shadows.
Buttons lift on hover with a soft inset highlight plus a diffuse outer
shadow (`0 1px 1px + 0 6px 12px` at ~5–10% ink). Editor cards sit on
Surface with a hairline border and no shadow. Dark panels invert: light
text on Primary with white hairlines.

## Shapes

Small radii on UI, large on content cards. Buttons 8px, inputs 8px,
status badges and signal dots fully pill (28px), editor cards 12–16px.
Divider ticks 2px. Never square buttons, never over-round cards into
bubbles.

## Components

- **Primary button:** mint fill, ink label, 8px radius, `0.75rem 1rem`
  padding, flex with 0.5rem gap. Hover dims to 90% opacity.
- **Secondary button:** paper fill at ~75% opacity with blur over dark,
  ink label, same radius.
- **Card:** Surface fill, ink text, 12px radius, 24px padding, hairline
  border. Used for editor panels and agent-instruction blocks.
- **Muted section:** Neutral fill, ink text, 16px radius, 40px padding.
- **Input:** white fill, ink text, 8px radius. Used for content fields
  in the No-Code Editor.
- **Badges:** pastel fill (mint / yellow / violet), ink text, pill
  radius. Used for content state.
- **Divider:** border-ink 1px line. **Signal dots:** 12px pills in
  mint or phoenix orange for agent/sync status, decorative only.

## Do's and Don'ts

- Do set headlines in Nohemi with negative tracking and body/UI in Plus
  Jakarta Sans; don't reintroduce Geist or a system serif.
- Do keep editor copy on Neutral/Surface with ink text; don't put body
  copy on blue, orange, or pastel fills.
- Do use white text only on ink/charcoal; don't place white text on
  product blue or phoenix orange (fails contrast).
- Do use pastels with ink text for content-state badges; don't use them
  for buttons.
- Do hover primary buttons to 90% opacity; don't add gradients to buttons.

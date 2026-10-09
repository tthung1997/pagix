---
name: Pagix
description: A light-table PDF page organizer. Split. Merge. Shuffle. In your browser.
colors:
  ground: "oklch(0.955 0.004 255)"
  surface: "oklch(0.985 0.003 255)"
  surface-sunken: "oklch(0.925 0.006 255)"
  line: "oklch(0.85 0.008 255)"
  line-strong: "oklch(0.72 0.012 255)"
  ink: "oklch(0.21 0.025 265)"
  ink-muted: "oklch(0.42 0.02 265)"
  cut: "oklch(0.54 0.2 33)"
  cut-deep: "oklch(0.48 0.2 33)"
  cut-soft: "oklch(0.95 0.035 33)"
  ok: "oklch(0.42 0.11 155)"
  ok-soft: "oklch(0.95 0.035 155)"
  ok-line: "oklch(0.82 0.06 155)"
  cut-line: "oklch(0.8 0.09 33)"
  ink-hover: "oklch(0.3 0.03 265)"
  ink-disabled: "oklch(0.55 0.015 265)"
  ink-disabled-strong: "oklch(0.5 0.015 265)"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(28px, 4vw, 40px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  brand:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  overlay:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  summary:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  ui-large:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  ui:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.04em"
  meta:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  icon: "6px"
  control: "8px"
  card: "10px"
  panel: "12px"
  sheet: "14px"
  overlay: "16px"
  round: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  cut-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.cut}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.cut-deep}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "38px"
  page-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "6px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Pagix

## Overview

**Creative North Star: "The Light Table."** Pagix is an Operate-mode tool. The page sequence is the interface: white page tiles sit on a cool pale-grey table, and a split is a vermilion dashed cut line drawn in the gap between two pages. Chrome is quiet so the user's own documents carry the colour.

Restrained colour strategy: cool neutrals plus one accent (vermilion). The accent is reserved for two meanings only: the primary action and anything related to cutting (cut lines, part chips, active cut buttons). Light theme, chosen for a document-handling scene in daylight offices and on phones. System font stack; no web fonts are loaded.

## Colors

- **Ground / Surface / Surface-sunken:** a three-step cool grey ladder. Ground is the table, surface is cards and panels, sunken is the well behind each page thumbnail.
- **Ink / Ink-muted:** body and secondary text; both clear 4.5:1 on ground and surface.
- **Cut (vermilion):** primary button, cut lines, active scissors, part chips, progress. Never decorative.
- **Ok / Cut-soft:** tinted message backgrounds for success and error. Error uses the cut hue family.

## Typography

System UI stack throughout, tabular numerals enabled globally so page numbers and counts align. Hierarchy comes from weight and size, not family: display 700 with tight tracking for the empty-state headline, 15px body, 13px bold uppercase tracked panel headings, 12px meta text on page cards.

## Layout

A two-column shell: a fluid stage (toolbar, messages, page grid) and a 320px sticky sidebar (export, workspace usage). The page grid is `auto-fill` columns of at least 168px with a 40px column gap that doubles as the cut slot. Below 900px the sidebar dissolves: the export panel becomes a sticky bottom bar and workspace details flow after the grid.

## Elevation & Depth

Page thumbnails lift off the sunken well with an offset soft shadow (`0 8px 18px -10px`). A dragged card gains a deeper lift shadow and a 1.5° tilt. Panels and cards use borders, not shadows. Mobile export bar casts an upward shadow.

## Shapes

Controls 8px, page cards 10px, panels 12px, cut and icon controls fully round or 6px. Page thumbnails keep a square-ish 2px paper edge from the canvas itself.

## Components

- **Page card:** position number, optional part chip, grip handle, thumbnail, source name and original page, move earlier/later/remove actions.
- **Cut slot:** a circular scissors toggle centred in the gap between adjacent cards. Hover or focus previews the dashed line; active draws it in solid-weight vermilion with a one-time exponential ease-out reveal.
- **Buttons:** primary (vermilion), default (outlined), quiet (text), danger-confirm (ink). Icon buttons are 32px, 40px on coarse pointers.
- **Messages:** inline banners above the grid, not toasts; success and info auto-dismiss, errors persist with per-file details.

## Do's and Don'ts

- Do keep vermilion for cutting and the single primary action.
- Do keep every drag interaction reachable by buttons and keyboard.
- Don't add decorative gradients, glass, or coloured side-borders.
- Don't introduce web fonts or any remote asset.
- Don't use modals; confirmation is inline.

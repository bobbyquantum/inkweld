---
id: canvas
title: Canvas
description: A freeform infinite canvas for maps, diagrams, and visual worldbuilding — with layers, drawing tools, and image placement.
sidebar_position: 5
---

import ThemedImage from '@site/src/components/ThemedImage';

# Canvas

The Canvas element type gives you a freeform infinite canvas for visual worldbuilding. Draw maps, create diagrams, add images, drop pins on locations, annotate with text — all organized into named layers.

<ThemedImage
  src="/img/features/canvas-tab-overview"
  alt="A canvas element open in the editor showing the sidebar, toolbar, and drawing stage"
/>

## Creating a Canvas

1. Right-click in the **Project Tree** sidebar (or click the **+** button)
2. Select **New Canvas**
3. Give it a name (e.g., "World Map", "Battle Plan", "City Layout")

The canvas opens immediately in its own project tab.

## The Interface

| Area               | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| **Sidebar** (left) | Layers panel and objects list for the active layer |
| **Toolbar** (top)  | Tool selection, zoom controls, and export          |
| **Stage** (center) | The infinite drawing surface                       |

The sidebar can be collapsed to give the stage more room. Click the **collapse** button in the sidebar header, or use the **expand** button on the left strip to bring it back.

<ThemedImage
  src="/img/features/canvas-tab-sidebar"
  alt="The canvas sidebar showing two named layers and the objects list"
/>

## Layers

Layers let you organize objects independently, similar to illustration software. Objects on higher layers appear in front of objects on lower layers.

### Managing Layers

| Action                | How                                                   |
| --------------------- | ----------------------------------------------------- |
| **Add a layer**       | Click the **+** button in the Layers header           |
| **Select a layer**    | Click its row in the layers list                      |
| **Rename a layer**    | Click **⋮** → **Rename**                              |
| **Duplicate a layer** | Click **⋮** → **Duplicate**                           |
| **Delete a layer**    | Click **⋮** → **Delete** (requires at least 2 layers) |

### Layer Visibility & Lock

Each layer row has two quick-toggle buttons:

- **Eye** (👁) — hide or show all objects on that layer
- **Lock** (🔒) — prevent accidental edits to objects on that layer

Objects on hidden layers are not exported.

## Toolbar

<ThemedImage
  src="/img/features/canvas-tab-toolbar"
  alt="The canvas toolbar showing navigation tools, creation tools, palette, and zoom controls"
/>

### Navigation Tools

| Tool                 | Shortcut | Description                         |
| -------------------- | -------- | ----------------------------------- |
| **Select**           | `V`      | Click to select and move objects    |
| **Rectangle Select** | `R`      | Drag to select multiple objects     |
| **Pan**              | `H`      | Click and drag to scroll the canvas |

### Creation Tools

Creation tools are enabled when a layer is active. Objects are added to whichever layer is currently selected.

| Tool              | Shortcut | Description                                                               |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| **Pin**           | `P`      | Drop a location marker on the canvas                                      |
| **Image**         | —        | Open the media library to place an image                                  |
| **Text**          | `T`      | Click on the canvas to add a text label                                   |
| **Freehand Draw** | `D`      | Draw freely with the pointer                                              |
| **Eraser**        | `E`      | Drag across strokes and objects to remove them                            |
| **Line**          | `L`      | Click and drag to draw a straight line                                    |
| **Shape**         | `S`      | Draw a shape — click the arrow to pick Rectangle, Ellipse, Arrow, or Line |

Drawing tools work on top of whatever is already on the canvas, so you can
annotate directly over a placed map without selecting it by mistake.

### Modifier Keys

| Modifier             | Effect                                                       |
| -------------------- | ------------------------------------------------------------ |
| **Shift** + line     | Snap the line to 15° increments                              |
| **Shift** + shape    | Constrain to a perfect square or circle                      |
| **Alt** + shape      | Draw the shape outward from the point you started at         |
| **Space** (held)     | Pan the canvas without leaving the current tool              |
| **Esc**              | Cancel the stroke in progress and return to the Select tool  |

### Brush Settings

Three toolbar controls set what the next stroke or shape will look like. Your
choices are remembered between sessions.

| Control          | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| **Stroke color** | Colour of lines, outlines, and freehand ink                                     |
| **Fill color**   | Interior colour for shapes, with a **No fill** toggle for outline-only shapes   |
| **Stroke width** | Six presets plus a slider — `[` and `]` step through the presets while you draw |
| **Brush options**| Pressure, smoothing, opacity, and eraser size                                   |

With an object selected, picking a colour recolours it immediately — no dialog
needed.

**Pressure & speed** makes freehand strokes vary in width: a stylus uses real
pen pressure, and a mouse or trackpad uses drawing speed, so quick strokes taper
the way ink does. Turn it off for a uniform line. **Smoothing** rounds off the
corners in a hand-drawn line; **opacity** is useful for highlighter-style
annotation over a map.

### Other Controls

| Control           | Description                                            |
| ----------------- | ------------------------------------------------------ |
| **Palette**       | Edit the fill and stroke colors of the selected object |
| **Undo / Redo**   | Step backwards and forwards through your edits         |
| **Zoom In / Out** | Step the zoom level up or down                         |
| **Fit All**       | Zoom to show all objects on the canvas                 |
| **Export**        | Export the canvas as PNG or SVG                        |
| **Zoom label**    | Shows the current zoom percentage                      |

### Navigating the Stage

| Gesture                          | Result                        |
| -------------------------------- | ----------------------------- |
| Scroll / two-finger swipe        | Pan the canvas                |
| **Shift** + scroll               | Pan horizontally              |
| **Ctrl**/**⌘** + scroll, or pinch| Zoom around the pointer       |
| Hold **Space** and drag          | Pan from any tool             |

On a tablet, pinch to zoom and drag with two fingers to pan. While a stylus is
in use, resting your hand on the screen won't start a second stroke.

## Objects Panel

The **Objects** section in the sidebar lists all objects on the active layer. Click an object row to select it on the stage.

When a layer has no objects, a hint tells you how to add your first one.

## Working with Images

The **Image** tool opens your project's media library so you can place reference art, maps, or textures directly on the canvas. Once placed, images can be moved, resized, and sent to different layers like any other object.

Common uses:

- Drop a hand-drawn map as a background layer, then annotate on a layer above
- Place character portraits next to location sketches
- Add reference images for architecture, terrain, or props

Images placed on the canvas are references to your media library — they don't duplicate the file.

## Pins

The **Pin** tool (`P`) drops a location marker on the canvas. Pins are useful for:

- Marking points of interest on a map
- Annotating specific areas with a visual indicator
- Creating a numbered set of landmarks for reference

Pins render as small teardrop markers and can be repositioned by dragging.

## Context Menu

Right-click anywhere on the canvas (or on a selected object) to open the context menu:

| Action            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| **Cut**           | Remove the selected object and copy it to the clipboard |
| **Copy**          | Copy the selected object                                |
| **Paste**         | Place a copy of the clipboard object                    |
| **Duplicate**     | Duplicate the selected object in place                  |
| **Delete**        | Remove the selected object                              |
| **Send to Layer** | Move the selected object to a different layer           |

Standard keyboard shortcuts also work: `Ctrl+C` / `Cmd+C` to copy, `Ctrl+X` / `Cmd+X` to cut, `Ctrl+V` / `Cmd+V` to paste, `Ctrl+D` / `Cmd+D` to duplicate, and `Delete` to remove.

## Undo & Redo

`Ctrl+Z` / `Cmd+Z` steps back through your canvas edits, and `Ctrl+Shift+Z` /
`Cmd+Shift+Z` (or `Ctrl+Y`) steps forward again. The toolbar has buttons for
both. A continuous gesture — dragging an object, sweeping the eraser across
several strokes — counts as a single step, so one undo takes back the whole
action rather than unpicking it piece by piece.

## Exporting

Export the visible canvas at any time:

1. Click the **download** button in the sidebar header (or the collapsed sidebar strip)
2. Choose an export format:
   - **Export as PNG** — standard 2× resolution raster image
   - **Export as PNG (High-res)** — 3× resolution for print or high-DPI displays
   - **Export as SVG** — scalable vector format; ideal for further editing in tools like Inkscape or Illustrator (raster images on the canvas are replaced with a placeholder)

Only visible layers are included in the export.

## Tips

- **Start with one layer** and add more only when you need to separate elements (e.g., put terrain on one layer and annotations on another)
- **Lock finished layers** to avoid accidentally moving objects you're happy with
- **Hide layers during export** to produce cleaner output — e.g., hide a grid or reference layer before exporting
- **Use Pan mode (`H`)** to navigate the canvas without risk of accidentally moving objects
- **Freehand draw** feels best with a stylus, which drives stroke width from real pen pressure; for crisp lines use the **Line** tool instead
- **Turn fill off** when drawing shapes over a map so the artwork underneath stays visible
- **Lower the opacity** and pick a bright stroke colour for highlighter-style annotation
- The canvas is saved automatically as you work — no explicit save step is needed

---

**Previous:** [Relationship Charts](./relationship-charts) — Visualize connections as interactive graphs.
**Next:** [Timeline](./timeline) — Plot events, eras, and arcs against flexible time systems.

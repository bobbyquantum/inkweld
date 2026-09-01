---
id: interactive-maps
title: Interactive Maps
description: Turn a canvas into a clickable map — background images, pins and regions linked to your elements, and a read-only view mode.
sidebar_position: 6
---

# Interactive Maps

An interactive map is a [Canvas](./canvas) with three ingredients: one or more **background images**, **pins** and **regions** linked to your worldbuilding elements, and **view mode** so readers can click around without editing. Everything here works on any canvas; the **Map** preset just sets it up for you.

## Creating a Map

1. Right-click in the **Project Tree** (or click **+**)
2. Under **Visualization**, choose **Map**
3. Name it and click **Create**

The new element opens with a map icon and a single layer called "Base map". It is a regular canvas — every drawing tool, layer, and frame feature is available.

## Background Images

A background is any canvas image flagged as a backdrop. Backgrounds ignore the pointer, so you can draw, place pins, and trace regions directly over them without selecting or dragging the map by mistake, and they always sit beneath the other objects on their layer.

To add one:

- Click **⋮** on a layer → **Add background image…** and pick from the media library, or
- Place an image with the **Image** tool, then right-click it → **Set as background**

Use **Detach from background** to make it an ordinary, movable image again.

You can have several backgrounds on one layer — useful for tiling a very large map from several scans — and several layers with different backgrounds. Combine that with layer visibility and opacity to switch between, say, a political map and a terrain map of the same region, or to fade one over the other.

## Location Pins

Press `P` and click the map to drop a pin. The pin dialog asks for:

- **Label** — shown under the marker
- **Pin Color**
- **Link to Element** — pick any document or worldbuilding element

A linked pin opens its element when double-clicked (single-clicked in [view mode](#view-mode)). Behind the scenes the link is a `canvas-pin` relationship, so the element's **Relationships** tab shows which maps it appears on, and the link is cleaned up automatically if either side is deleted.

Pins live on an overlay above every layer. Hiding or deleting a layer never hides its pins, and the eraser skips them. The sidebar's **Pins** section lists them all; right-click a pin for **Edit pin…**, **Open linked element**, or **Unlink element**.

## Linked Regions

Where a pin marks a point, a region marks an area. Any shape — a rectangle, an ellipse, or a polygon traced with the [region pen](./canvas#using-the-region-pen) — can be linked to an element:

1. Select the shape
2. Right-click → **Link to element…**
3. Pick the element

Linked shapes get a pointer cursor and show the element's name when you hover; double-click (or single-click in view mode) to open it. **Unlink element** removes the link, and **Open linked element** is available from the context menu too.

Regions are `canvas-area` relationships, listed on the element alongside pin links. To represent territory that isn't one contiguous shape — an island chain, a scattered diaspora — link several shapes to the same element; together they form one region.

Because regions are ordinary shapes, they follow their layer: hide the layer and the region disappears, unlike pins. Keep regions on a dedicated layer if you want to toggle them independently of the artwork.

## View Mode

The toolbar's mode toggle switches into **View mode**: drawing and editing controls disappear, dragging on the stage pans, and a **single click** on any linked pin or region opens its element. Zoom, fit-all, and layer visibility remain available, so a reader can still switch between map layers.

The mode is remembered per browser, so a collaborator who only reads the map stays in view mode next time they open it.

## Exporting Maps

Maps export like any canvas — see [Exporting](./canvas#exporting). Two things are map-specific:

- Visible pins are always included, even when their layer is hidden
- Add a **canvas size** or **crop frames** to export the same map at several crops (the whole continent, a single province) without redrawing

## Tips

- **One layer per map style** (political, terrain, parchment) with its own background makes switching styles a single click
- **Keep regions on their own layer** so you can hide the overlays while still using the pins
- **Use view mode** whenever you're navigating rather than drawing — it prevents accidental nudges and makes links single-click
- **Link, don't label**: a pin linked to a location element stays correct when the location is renamed; a text label doesn't
- **Check the Relationships tab** of an element to see every map it appears on

---

**Previous:** [Canvas](./canvas) — Layers, drawing tools, frames, and export.
**Next:** [Timeline](./timeline) — Plot events, eras, and arcs against flexible time systems.

---
id: relationship-charts
title: Relationship Charts
description: Visualize connections between story elements as interactive graphs.
sidebar_position: 4
---

import ThemedImage from '@site/src/components/ThemedImage';

# Relationship Charts

Relationship charts let you visualize the connections between your story elements as an interactive graph. See how characters relate to each other, which locations connect, and how your story world fits together at a glance.

## Creating a Chart

1. Right-click in the **project tree** sidebar (or use the **+** button)
2. Choose **New Element**, then pick **Relationship Chart** in the **Create New** dialog
3. Give it a name (e.g., "Character Web", "Family Tree", "Faction Map") and click **Create Relationship Chart**

The new chart appears in the project tree alongside your documents and elements.

<ThemedImage
  src="/img/features/relationship-chart-overview"
  alt="A relationship chart showing characters and locations connected by labeled edges"
/>

## Display Modes

Charts support two population modes, configurable in the sidebar:

### All Mode

Shows **every element** in your project that has at least one relationship. This is great for getting an overview of your entire story world.

### Curated Mode

Lets you hand-pick which elements appear on the chart. Use this to build focused visualizations like:

- **Family trees** — select only characters related by familial bonds
- **Faction maps** — select faction members and their allegiances
- **Location networks** — map out spatial relationships between places

To add elements in curated mode, click the **Add** button (➕) in the Elements section of the sidebar and select the elements you want to include.

## The Sidebar

The sidebar contains all chart configuration options. Collapse it with the close button to give the graph more space, and expand it again with the panel button on the left edge.

### Layout

Choose how nodes are arranged using the row of layout buttons. The buttons show only icons, so hover over one to see its name:

| Layout (tooltip)                                 | Best For                                              |
| ------------------------------------------------ | ----------------------------------------------------- |
| **Force-directed layout**                        | Organic graphs where clusters form naturally          |
| **Hierarchical (tree) layout**                   | Hierarchical relationships (org charts, family trees) |
| **Circular layout**                              | Evenly spaced arrangements, good for small groups     |
| **Grid layout**                                  | Dense graphs, comparing many elements                 |
| **Concentric layout (most connected at center)** | Centrality-based, most connected nodes at center      |

### Mode

Switch between **Curated** and **All** population modes (described above).

### Elements (Curated Mode)

When in curated mode, this section lists the elements currently on the chart. You can:

- **Add elements** — click the ➕ button to open the element picker
- **Remove elements** — hover over an element and click the ✕ button

### Options and Schemas (All mode)

In **All** mode the sidebar also offers:

- **Show isolated elements** — a checkbox that includes elements with no relationships (hidden by default)
- **Schemas** — one chip per template (Character, Location, …). Click chips to show only those kinds of element; click the filter-off button to **Show all schemas** again

### Focus and filters

**Focus** narrows a busy chart to one element's neighbourhood:

1. **Click a node** on the graph. The chart now shows only that element and the elements connected to it, and the sidebar's **Focus** section reads _Showing 1 hop from …_.
2. Use the **Depth** slider (1 to 5) to widen or narrow the view: depth 2 includes the neighbours of neighbours, and so on.
3. To leave focus mode, click the focused node again or click the **Clear focus** (✕) button in the Focus section.

### Display

The **Display** section has a single labels button that cycles through **Labels: Auto**, **Labels: On** and **Labels: Off** each time you click it. Auto shows labels only when there's room.

### Relationship Types

Filter which relationship types appear on the chart. Click a type chip to toggle it:

- **Highlighted** chips are active — those relationship types are shown
- **Muted** chips are filtered out
- Click the **clear filter** button to show all types again

<ThemedImage
  src="/img/features/relationship-chart-sidebar"
  alt="The relationship chart sidebar showing layout, mode, elements, and relationship type filters"
/>

## Interacting with the Graph

### Navigation

- **Zoom** — scroll wheel or pinch
- **Pan** — click and drag the background
- **Focus** — click a node to focus on it and its connected elements (see [Focus and filters](#focus-and-filters))

### Nodes

Each node represents an element:

- **Color** indicates the element type. Characters, Locations, Documents, Factions, Events and Notes each have their own colour; every other type is shown in grey
- **Size** reflects the number of connections
- **Images** appear on nodes whose element has an identity image (set in the worldbuilding editor)
- **Drag** any node to reposition it

All Characters share one colour, all Locations another, and so on, which makes clusters of related element types easy to spot. Elements of types without their own colour appear grey.

When an element has an identity image (set via the worldbuilding editor), the node displays that image as a circular thumbnail instead of the default colored circle. This is especially useful for character-heavy charts where faces help identify nodes quickly.

### Edges

Lines between nodes represent relationships:

- **Color** matches the relationship type
- **Labels** show the relationship name
- **Hover** over an edge to see full details in a tooltip

### Collapsed Sidebar

When you collapse the sidebar (via the close button in its header), a thin **strip** remains on the left edge. The strip provides quick access to:

- **Expand** the sidebar back to full width
- **Download** the chart as an image

This gives the graph maximum canvas space while keeping essential controls reachable.

## Exporting

Export your chart as an image for use outside Inkweld:

1. Click the **download** button (in the sidebar header or collapsed strip)
2. Choose **Export as PNG** for a standard image or **Export as PNG (High-res)** for a larger, sharper version

## When to Use Charts

Relationship charts shine in several scenarios:

- **Family trees** — curated mode with only familial relationship types filtered on
- **Faction maps** — see who belongs to which organization and how groups interact
- **Location networks** — map spatial relationships (Located In, Adjacent To) between places
- **Plot webs** — visualize how characters, items, and events interconnect across your story
- **Consistency checks** — spot orphaned elements or unexpected connections at a glance

## Tips

- **Start with "All" mode** to see the big picture, then switch to curated mode to focus on specific clusters
- **Use relationship type filters** to isolate categories — e.g., show only familial relationships to see a family tree
- **Set identity images** on key elements so nodes show recognizable thumbnails
- **The demo project** includes a pre-built "Character Web" chart you can explore right away
- Charts are **lightweight** — they read from your existing elements and relationships, so there's no data duplication
- The sidebar collapsed/expanded state **persists** across sessions
- **Export high-res PNGs** for sharing or including in reference documents

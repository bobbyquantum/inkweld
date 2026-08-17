---
id: elements
title: Elements & Templates
description: Create structured worldbuilding entries using customizable templates.
sidebar_position: 1
---

import ThemedImage from '@site/src/components/ThemedImage';

# Elements & Templates

Inkweld's worldbuilding system is built around **elements**—structured entries that you create to represent anything in your story world. Characters, locations, factions, items, creatures, magic systems—they're all elements, and you define their structure using **templates**.

New projects start with a set of built-in templates covering 29 common element types. See [Element Types](./element-types) for the full list — or clone and customize them, or design your own from scratch.

## What Are Elements?

Elements are worldbuilding entries with structured data. Unlike free-form documents, elements have:

- **Fields** organized into tabs
- **Consistent structure** defined by a template
- **Relationships** to other elements
- **Backlinks** showing where they're referenced

Think of elements as database entries for your story world, but with the flexibility to define exactly what data you want to track.

## What Are Templates?

Templates define the structure of elements:

- What **fields** to capture (name, description, stats, etc.)
- How to **organize** fields into tabs
- What **field types** to use (text, selection, number, etc.)

Every element uses a template. You can create as many templates as your story needs.

## Quick Start

### Creating an Element

1. **Right-click** on a folder in your project tree
2. Select **"New Worldbuilding Entry"**
3. Choose a template (or create a new one)
4. Enter the element's name
5. Click **Create**

The element opens with structured fields to fill in.

### Creating a Template

There are two ways to create a new template:

#### Option 1: Create from Scratch

1. Open your project
2. Go to **Project Settings** → **Element Templates**
3. Click the **"Create Template"** button
4. The template editor opens with a blank starter template
5. Define your fields and tabs
6. Changes save automatically as you go

<ThemedImage
  src="/img/features/templates-create-button"
  alt="Create Template button in the Templates tab"
/>

#### Option 2: Clone an Existing Template

If you want to start from an existing template (like the built-in Character or Location templates):

1. Go to **Project Settings** → **Element Templates**
2. Find the template you want to base yours on
3. Click the **three-dot menu** (⋮) on that template's card
4. Select **"Clone"**
5. A copy is created that you can rename and customize

<ThemedImage
  src="/img/features/templates-clone-menu"
  alt="Clone option in template card menu"
/>

:::tip
Cloning is great when you want to create a variation of an existing template. For completely new element types, use **Create Template**.
:::

## Understanding Templates

### The Templates Tab

The Element Templates tab in Project Settings shows all your templates at a glance. Each template card displays:

- **Name** and **icon** (visual identifier)
- **Type badge**: Built-in (ships with Inkweld) or Custom (your creations)
- **Action menu** (⋮) for editing, cloning, or deleting

<ThemedImage
  src="/img/features/templates-overview"
  alt="Element Templates tab showing template cards"
/>

### Template Components

A template consists of:

| Component  | Description                                        |
| ---------- | -------------------------------------------------- |
| **Name**   | What this element type is called (e.g., "Faction") |
| **Icon**   | Visual identifier in the project tree              |
| **Tabs**   | Sections to organize fields                        |
| **Fields** | Individual data points to capture                  |

### Field Types

| Type             | Use For                          | Example                    |
| ---------------- | -------------------------------- | -------------------------- |
| **Short Text**   | Names, titles, brief info        | "Elena Blackwood"          |
| **Long Text**    | Plain text descriptions          | Backstory summary          |
| **Rich Text**    | Formatted content with @mentions | Detailed history           |
| **Selection**    | Pick from options                | "Faction Type: Guild"      |
| **Multi-Select** | Pick multiple options            | "Abilities: Flight, Magic" |
| **Number**       | Numeric values                   | "Level: 5"                 |
| **Date**         | Timeline entries                 | "Founded: 1242"            |
| **Toggle**       | Yes/No values                    | "Active: ✓"                |

### The Template Editor

When you create or edit a template, the **Template Editor** opens as a live,
interactive preview of the template. It's not a separate form — you edit the
template directly in the same editor you use to fill in elements, so you can see
exactly how the fields will look as you build them.

The editor is organised into sections down the left-hand navigation (or as
stacked panels on narrow screens):

- **Schema Details** (the top section) — the template's **name**, **icon**, and
  **description**
- **Tabs** — one section per tab, where you manage that tab's fields
- **Identity, Relationships, Media, Styling** — the fixed sections every element
  has

In each tab you can:

- **Add fields** with the "Add field" button
- **Edit a field** inline — click the field's edit control to change its label,
  type, placeholder, options, and more
- **Remove or reorder fields** with the controls on each field
- **Rename the tab and pick its icon** from the fields at the top of the tab
- **Add or remove tabs** from the navigation

Under **Schema Details** you set the template's name, icon, and description. Under
**Styling** you can set a default appearance (backgrounds) and default image that
new elements of this type get.

Changes save automatically as you edit — there's no separate Save step. You can
also create and restore **template snapshots** from the snapshot button to
protect your work while designing.

<ThemedImage
  src="/img/features/templates-create-dialog"
  alt="Template Editor"
/>

<ThemedImage
  src="/img/features/templates-editor-tab"
  alt="A template tab showing the tab name/icon editor and the tab's fields"
/>

## Template Examples

Here are examples of templates you might create. Remember, these are just suggestions—design templates that fit your story's needs.

### Character Template

Track people in your story:

**Tab: Basic**

- Name (short text)
- Aliases (short text)
- Age (short text)
- Role (selection: Protagonist, Antagonist, Supporting)

**Tab: Description**

- Appearance (rich text)
- Personality (rich text)
- Motivations (long text)

**Tab: Background**

- Backstory (rich text)
- Skills (long text)
- Relationships (rich text with @mentions)

### Location Template

Track places in your world:

**Tab: Overview**

- Name (short text)
- Type (selection: City, Town, Wilderness, Building)
- Region (short text)

**Tab: Details**

- Description (rich text)
- History (rich text)
- Notable Features (long text)

### Faction Template

Track organizations and groups:

**Tab: Overview**

- Name (short text)
- Type (selection: Guild, Government, Religious, Criminal)
- Motto (short text)

**Tab: Structure**

- Leadership (rich text with @mentions)
- Hierarchy (rich text)
- Membership Size (number)

**Tab: Goals**

- Objectives (rich text)
- Allies (rich text with @mentions)
- Enemies (rich text with @mentions)

### Item Template

Track objects and artifacts:

**Tab: Basic**

- Name (short text)
- Type (selection: Weapon, Armor, Tool, Artifact)
- Rarity (selection: Common, Rare, Legendary)

**Tab: Properties**

- Appearance (rich text)
- Magical Effects (rich text)
- Limitations (long text)

**Tab: History**

- Creation (rich text)
- Notable Owners (rich text with @mentions)

## Managing Templates

### Editing Templates

1. Go to **Project Settings** → **Element Templates**
2. Click the **three-dot menu** (⋮) on the template card
3. Select **"Edit"** to open the Template Editor
4. Add, remove, or reorder fields and tabs
5. Changes save automatically — just close the editor when you're done

<ThemedImage
  src="/img/features/templates-card-menu"
  alt="Template card with action menu"
/>

:::warning
Deleting a field removes that data from all existing elements using this template.
:::

### Cloning Templates

To create a variation of an existing template:

1. Find the template in the **Element Templates** tab
2. Click the **three-dot menu** (⋮)
3. Select **"Clone"**
4. A copy is created with "(Copy)" appended to the name
5. Edit the cloned template to customize it

### Deleting Templates

1. Click the **three-dot menu** (⋮) on the template card
2. Select **"Delete"**
3. Confirm the deletion

:::danger
Deleting a template **does not** delete elements that use it, but those elements will lose their structured data and become orphaned.
:::

### Organizing Fields

- **Reorder fields** within a tab using the up/down arrows on each field
- **Move fields between tabs** by removing them from one tab and adding them to another
- **Reorder tabs** by removing and re-adding them in the order you want

## Working with Elements

### Where to Store Elements

Organize elements however makes sense for your project:

- By type: **People/**, **Places/**, **Factions/**
- By story section: **Act 1/**, **Act 2/**
- By relationship: **The Kingdom/**, **The Rebellion/**

### Connecting Elements

Elements become powerful when connected:

- **@mentions**: Reference elements in prose with `@ElementName`
- **Relationships**: Define semantic connections (parent, ally, located-in)
- **Backlinks**: See everywhere an element is referenced

See [Element References](./element-references) and [Relationships](./relationships) for details.

## The Worldbuilding Editor

When you open an element, the worldbuilding editor provides a structured workspace for editing its data. The editor adapts its layout based on your screen size.

### Desktop Layout (Sidenav)

On screens wider than 760px, the editor uses a **sidenav layout** with a navigation rail on the left and a content area on the right.

<ThemedImage
  src="/img/features/worldbuilding-editor-overview"
  alt="The worldbuilding editor in desktop sidenav mode showing the navigation rail and identity section"
/>

| Area                    | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| **Sidenav** (left)      | Navigation rail with section links and element thumbnail |
| **Content** (right)     | The active section's fields and panels                   |
| **Status bar** (bottom) | Tags, document snapshots, and sync status                |

The sidenav shows:

- **Element thumbnail** — click to view the full-size identity image
- **Identity** — name, description, and image
- **Schema tabs** — one entry per tab defined in the template (e.g., Basic Info, Appearance)
- **Relationships** — connections and backlinks
- **Media** — images and files tagged to this element

### Identity Panel

The Identity section holds the element's core identity:

- **Name** — displayed at the top (read-only; use the rename button to change it)
- **Image** — upload, crop, or generate an AI image for the element
- **Description** — a free-text summary of the element
- **Tags** — visual labels for organizing and filtering

<ThemedImage
  src="/img/features/worldbuilding-editor-sidenav"
  alt="The sidenav navigation showing Identity, schema tabs, Relationships, and Media links"
/>

### Custom Backgrounds

The Identity tab includes an **Appearance** panel that lets you give the editor's two regions — the left-hand menu (sidenav) and the right-hand content area — their own background. This is a per-element setting, so each character, location, or item can have a distinct look.

For each region you can:

- **Enable** the custom background with the toggle.
- Choose a **type**: solid colour, gradient, or an image from your media library.
- Choose a **theme mode**:
  - **Auto** — a single value that the editor adjusts for the active light/dark theme (images are automatically brightened or darkened so overlaid text stays readable).
  - **Manual** — separate values for the light theme and the dark theme.

![Solid colour menu background](/img/features/worldbuilding-backgrounds/worldbuilding-background-menu-solid.png)

_A solid colour applied to the left-hand menu._

![Gradient content background](/img/features/worldbuilding-backgrounds/worldbuilding-background-content-gradient.png)

_A gradient applied to the content area._

![Custom menu and content backgrounds in dark mode](/img/features/worldbuilding-backgrounds/worldbuilding-background-both-dark.png)

_Both regions use custom backgrounds in dark mode._

Backgrounds are stored with the element and sync to collaborators in real time, like the rest of the identity data.

### Schema Tab Fields

Each template tab renders its fields as a form. Field types include text inputs, textareas, selects, multi-selects, numbers, dates, checkboxes, and arrays.

<ThemedImage
  src="/img/features/worldbuilding-editor-fields"
  alt="The Basic Info tab showing form fields like Full Name, Age, Gender, and Species"
/>

Fields are laid out in a responsive grid. Each field's `span` (set in the template editor) controls how many columns it occupies — a span of 12 is full-width, 6 is half-width.

### Relationships Section

The Relationships section shows all connections for the element — both outgoing relationships you've created and incoming backlinks from documents and other elements.

<ThemedImage
  src="/img/features/worldbuilding-editor-relationships"
  alt="The Relationships section showing relationship type groups and backlinks"
/>

See [Relationships](./relationships) for details on creating and managing connections.

### Media Panel

The Media panel lists all media items tagged to this element. Add images from your media library or remove tags you no longer need.

<ThemedImage
  src="/img/features/worldbuilding-editor-media"
  alt="The Media panel showing tagged images for the element"
/>

### Status Bar

The status bar at the bottom of the editor shows:

| Control            | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| **Tags**           | View and manage element tags (click to open the tag editor)    |
| **Snapshots**      | Open the document snapshots dialog to save or restore versions |
| **Sync indicator** | Shows the real-time sync state (synced, syncing, or offline)   |

<ThemedImage
  src="/img/features/worldbuilding-editor-statusbar"
  alt="The editor status bar showing tags, snapshots button, and sync status"
/>

### Mobile Layout (Accordion)

On screens narrower than 760px, the sidenav is replaced with an **accordion layout**. All sections — Identity & Details, schema tabs, Relationships, and Media — are rendered as collapsible panels stacked vertically.

![The worldbuilding editor in mobile accordion mode showing collapsible sections](/img/features/mobile/worldbuilding-accordion-iPhone14Pro.png)

The Identity & Details panel is expanded by default. Tap any panel header to expand or collapse it. The accordion layout provides the same editing capabilities as the desktop sidenav, optimized for touch interaction.

---

**Next:** [Element Types](./element-types) - Explore the 29 built-in element types and what each one is for.

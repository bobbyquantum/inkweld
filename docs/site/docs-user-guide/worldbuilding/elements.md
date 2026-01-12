---
id: elements
title: Elements & Templates
description: Create structured worldbuilding entries using customizable templates.
sidebar_position: 1
---

import ThemedImage from '@site/src/components/ThemedImage';

# Elements & Templates

Inkweld's worldbuilding system is built around **elements**—structured entries that you create to represent anything in your story world. Characters, locations, factions, items, creatures, magic systems—they're all elements, and you define their structure using **templates**.

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
6. Click **Save**

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

| Component | Description |
|-----------|-------------|
| **Name** | What this element type is called (e.g., "Faction") |
| **Icon** | Visual identifier in the project tree |
| **Tabs** | Sections to organize fields |
| **Fields** | Individual data points to capture |

### Field Types

| Type | Use For | Example |
|------|---------|---------|
| **Short Text** | Names, titles, brief info | "Elena Blackwood" |
| **Long Text** | Plain text descriptions | Backstory summary |
| **Rich Text** | Formatted content with @mentions | Detailed history |
| **Selection** | Pick from options | "Faction Type: Guild" |
| **Multi-Select** | Pick multiple options | "Abilities: Flight, Magic" |
| **Number** | Numeric values | "Level: 5" |
| **Date** | Timeline entries | "Founded: 1242" |
| **Toggle** | Yes/No values | "Active: ✓" |

### The Template Editor

When you create or edit a template, the Template Editor dialog opens. Here you can:

- **Set the name and icon** for the template
- **Add a description** explaining what this template is for
- **Manage tabs** to organize fields into logical sections
- **Add and configure fields** within each tab

<ThemedImage
  src="/img/features/templates-create-dialog"
  alt="Template Editor dialog"
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
4. Add, remove, or reorder fields
5. Click **Save**

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

- **Drag fields** to reorder within tabs
- **Drag tabs** to reorder the tab bar
- **Move fields** between tabs as needed

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

### Element Profile View

When you open an element, you see:

- **Tabs** with structured fields
- **Relationships Panel** showing connections
- **References** showing where it's mentioned

---

**Next:** [Element References](./element-references) - Link your elements with @mentions.

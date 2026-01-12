---
id: relationships
title: Relationships
description: Define and visualize semantic connections between story elements.
sidebar_position: 3
---

import ThemedImage from '@site/src/components/ThemedImage';

# Relationships

Relationships define meaningful connections between your story elements—family ties, alliances, ownership, or spatial connections. [Element references](./element-references) are also relationships, automatically created when you mention an element in a document.

## Manual vs. Automatic Relationships

| Feature | Element References (@mentions) | Manual Relationships |
|---------|-------------------------------|----------------------|
| **Creation** | Automatic when typing `@` | Explicit via dialog |
| **Display** | Inline links in text | Listed in side panel |
| **Backlinks** | Yes, in References tab | Yes, with inverse label |
| **Types** | Generic "references" | Familial, Social, Spatial, etc. |

## Quick Start

1. Open any worldbuilding element
2. Click the **panel toggle** button in the toolbar to show the meta panel
3. Click **"Add Relationship"** at the top of the panel
4. Select a relationship type (e.g., "Parent", "Sibling", "Located In")
5. Search and select the target element
6. Click **Create**

<ThemedImage
  src="/img/features/add-relationship-dialog"
  alt="The Add Relationship dialog"
/>

## The Relationships Panel

When you open a worldbuilding element, the relationships panel shows all connections for that element.

<ThemedImage
  src="/img/features/character-relationships-overview"
  alt="Character with relationships shown in the panel"
/>

### Panel Structure

- **Add Relationship** button at the top
- **Relationship type sections** (e.g., "Parent", "Child of", "Sibling")
  - Each type expands/collapses independently
  - Shows count of relationships in that category
  - Lists all relationships of that type

### Relationship Cards

Each relationship displays as a card showing:
- **Element icon** based on the element's template
- **Element name** as a clickable link
- **Delete button** to remove the relationship

Click any relationship card to navigate directly to that element.

## Bidirectional Nature

When you create a relationship, it appears on **both** elements:

- **Outgoing**: Shows on the source element with the primary label
- **Incoming (Backlink)**: Shows on the target element with the inverse label

**Example**: If you mark "Marcus" as the **Parent** of "Elena":

On Marcus's page, you see the outgoing relationship:

<ThemedImage
  src="/img/features/character-parent-relationship"
  alt="Parent relationship shown on the parent character"
/>

On Elena's page, you see the incoming backlink:

<ThemedImage
  src="/img/features/character-child-relationship"
  alt="Child of relationship shown on the child character"
/>

## Relationship Types

All relationship types are custom—you define them in Project Settings. Demo templates may include pre-configured types to help you get started.

<ThemedImage
  src="/img/features/relationships-tab-overview"
  alt="Relationship types in Project Settings"
/>

### Creating Relationship Types

1. Go to **Project Settings** → **Relationship Types**
2. Click **"New Type"**
3. Enter the primary label (e.g., "Parent")
4. Enter the inverse label (e.g., "Child of")
5. The new type is saved automatically

Common relationship patterns include:

| Category | Primary → Inverse |
|----------|-------------------|
| Family | Parent ↔ Child of, Sibling ↔ Sibling of, Spouse ↔ Spouse of |
| Social | Friend ↔ Friend of, Mentor ↔ Student of, Employer ↔ Employee of |
| Spatial | Located In ↔ Contains, Adjacent To ↔ Adjacent To |
| Ownership | Owns ↔ Owned By, Member Of ↔ Has Member, Created By ↔ Creator of |

## Multiple Relationships

An element can have many relationships of different types:

<ThemedImage
  src="/img/features/character-multiple-relationships"
  alt="Character with multiple relationship types"
/>

## Managing Relationships

### Deleting Relationships

To remove a relationship:
1. Find the relationship card in the panel
2. Click the **Delete** (trash) button
3. Confirm the deletion

The relationship is removed from both elements.

### Editing Relationships

To change a relationship:
1. Delete the existing relationship
2. Create a new one with the correct type/target

---

**Next:** [Real-Time Collaboration](../collaboration/real-time) - Write together with co-authors simultaneously.

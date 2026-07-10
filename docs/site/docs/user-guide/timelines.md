---
sidebar_position: 1
title: Timelines
description: Create chronological timelines and auto-build events from worldbuilding element date fields.
---

# Timelines

Timelines let you visualise the chronological flow of your story world. Each timeline is an element in the project tree,anchored to a **time system** (e.g. Gregorian, Relative Years, or a custom fantasy calendar).

## Creating a Timeline

1. Click **Create** in the project sidebar, then select **Timeline**.
2. Name your timeline and click **Create**.
3. On first open, you'll be prompted to **choose a time system**. This locks in for the timeline's lifetime&#8212;create a separate timeline if you need a different calendar.
4. To install a time system, go to **Settings &#8594; Time Systems** and install a template (e.g. Gregorian).

## Adding Events Manually

- Click **Add event** in the toolbar to open the event dialog.
- Set a title, pick a track, and enter a start date (and optional end date for ranged events).
- Events can optionally link to a worldbuilding element via **Linked Element**.

## Auto-Build from Elements

The **Auto-build from elements** button scans every worldbuilding element in your project, reads each schema field of type `date`, and generates a timeline event for each populated date value.

![Timeline toolbar with Auto-build button](/img/generated/timeline-auto-build-toolbar.png)

After clicking Auto-build, events appear on the timeline linked to their source elements:

![Timeline with auto-built events](/img/generated/timeline-auto-build-events.png)

### How to Use

1. Ensure your worldbuilding elements have **date fields** with values filled in (e.g. a Character with a `dateOfBirth` field set to `1198-5-12`).
2. Open your timeline and make sure a time system is committed.
3. Click **Auto-build from elements** in the toolbar.
4. Events are generated and the timeline fits to show them.

### What Gets Generated

- One event per populated date field on each worldbuilding element.
- The event title follows the format `Element Name: Field Label` (e.g. `Elara Nightwhisper: Date of Birth`).
- Each event is linked back to its source element via `linkedElementId`.
- Events are placed on the first track.

### Idempotent Re-runs

Auto-build is designed to be run repeatedly without creating duplicates:

- **Existing auto-built events are updated in place** when the source date value changes.
- **Manually-authored events are always preserved.**
- **Stale auto-built events are removed** when the source date field is cleared or the element is deleted.

### Date Format Compatibility

The date field value (from the worldbuilding editor's date picker, typically `YYYY-MM-DD`) is parsed using the timeline's active time system. For the Gregorian system, `YYYY-MM-DD` maps directly to Year-Month-Day. For other systems, the value must match that system's `parseSeparator` and unit count.

### Limitations

- Only `date` type fields in worldbuilding schemas are scanned. Other field types (text, number, etc.) are ignored.
- All auto-built events are placed on the first track. You can move them to other tracks manually afterward.
- The source field key (e.g. `background.dateOfBirth`) is stored on each auto-built event for idempotency tracking.
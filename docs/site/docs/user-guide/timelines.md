---
sidebar_position: 1
title: Timelines
description: Create chronological timelines and auto-build events from worldbuilding element date fields.
---

# Timelines

Timelines let you visualise the chronological flow of your story world. Each timeline is an element in the project tree, anchored to a **time system** (e.g. Gregorian, Relative Years, or a custom fantasy calendar).

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

The **Auto-build from elements** button scans every worldbuilding element in your project for date-type schema fields with populated values, then presents a selection dialog where you choose which ones to add as timeline events.

### How to Use

1. Ensure your worldbuilding elements have **date fields** with values filled in (e.g. a Character with a `dateOfBirth` field set to `1198-5-12`).
2. Open your timeline and make sure a time system is committed.
3. Click **Auto-build from elements** in the toolbar.
4. A dialog appears listing all candidate elements with date fields. Each row shows the element name, the field label, and the raw date value.
5. Candidates are pre-checked by default (except those already on the timeline). Uncheck any you don't want to add.
6. Click **Add N events** to generate the selected events on the timeline.

### What Gets Generated

- One event per selected date field.
- The event title follows the format `Element Name: Field Label` (e.g. `Elara Nightwhisper: Date of Birth`).
- Each event is linked back to its source element via `linkedElementId`.
- Events are placed on the first track.

### Idempotent Re-runs

When you re-open the auto-build dialog, candidates already on the timeline are shown with a checkmark icon and unchecked by default. You can:

- **Update** existing auto events by re-checking them (the date value is re-parsed from the element).
- **Remove** auto events by leaving them unchecked — unchecked auto events are removed from the timeline when you confirm.
- **Preserve** manually-authored events (they are never touched by auto-build).

### Limitations

- Only `date` type fields in worldbuilding schemas are scanned. Other field types (text, number, etc.) are ignored.
- All auto-built events are placed on the first track. You can move them to other tracks manually afterward.
- The source field key (e.g. `background.dateOfBirth`) is stored on each auto-built event for idempotency tracking.
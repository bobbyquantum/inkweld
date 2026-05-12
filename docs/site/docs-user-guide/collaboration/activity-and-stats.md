---
id: activity-and-stats
title: Activity & Writing Statistics
description: Track per-project activity and view your writing statistics across all your projects.
sidebar_position: 3
---

# Activity & Writing Statistics

Inkweld keeps a running log of meaningful actions inside each project, and aggregates your daily word counts so you can see how your writing has progressed over time.

:::info Online-only feature
Activity and writing statistics are recorded server-side and are only available when you are signed in to a hosted Inkweld instance. They are **not available in local-only mode** — the profile-page widget and the project Activity tab are hidden when no server is configured.
:::

## Writing Statistics Widget

A summary card appears on your own user profile page (visit `/<your-username>`, e.g. by clicking your avatar). It shows, for the last 30 days:

- **Words** — net positive words written across every project you contribute to
- **Active days** — the number of distinct days that recorded any writing
- **Projects** — how many projects you actively contributed to in the window
- **Recent activity** — the three most recent events from any of your projects, each linking to the relevant project

A small sparkline previews your daily output across the window.

![Writing-stats widget](/img/generated/writing-stats-widget-light.png)

If the statistics endpoint is unreachable the widget hides itself rather than showing a broken state, so the rest of the profile page remains usable. The widget is only shown on your own profile — visiting another user's profile does not display their personal statistics.

## Project Activity Tab

Inside each project the sidebar has an **Activity** entry. Selecting it opens an append-only feed of every meaningful change made to that project, newest first.

The feed records:

| Event                     | Description                                 |
| ------------------------- | ------------------------------------------- |
| Document edit             | Any net-positive edit to a document         |
| Snapshot created          | A versioned snapshot was saved              |
| Comment thread            | A new comment thread was opened             |
| Comment reply             | A reply was added to an existing thread     |
| File published            | A document was exported / published         |
| Element created           | A new worldbuilding element was added       |
| Element renamed           | An existing element was renamed             |
| Element deleted           | An element was removed                      |
| Collaborator invited      | An invitation was sent                      |
| Collaborator joined       | An invitation was accepted                  |
| Collaborator role changed | A collaborator's permissions changed        |
| Collaborator removed      | A collaborator was removed from the project |

Each entry shows the actor, the affected entity, and a human-readable timestamp (with the exact time in a tooltip). Older entries can be loaded on demand via the **Load more** button at the bottom of the feed.

### Refreshing the feed

The activity feed is fetched once when you open the tab. Use the refresh button in the tab header to pull the latest events without leaving the page.

### Error handling

If the activity API is briefly unreachable an inline error message and a **Retry** button appear. Activity events are stored permanently — retrying once the connection recovers will load the full backlog.

## Privacy

- Activity events are scoped to the project. Only people who can already access the project (the owner and approved collaborators) can see its activity feed.
- The cross-project profile widget only ever shows your own projects and projects you collaborate on.
- Events include your displayed username at the time of the action; renaming your account does not rewrite history.
- There is currently no way to delete individual activity events. Deleting a project removes its activity log entirely.

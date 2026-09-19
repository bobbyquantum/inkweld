---
id: generators
title: Random Generators
description: Roll character names, place names and writing prompts from generators you define yourself.
sidebar_position: 7
---

# Random Generators

A generator produces text on demand — a character name, a tavern, a "what if" prompt — so you never have to stall on naming a minor NPC. Generators live in the project, sync to your collaborators, and travel with project exports.

## What you start with

Projects created from either worldbuilding template ship with five generators, ready to roll:

| Generator          | Rolls                                     | Bound to           |
| ------------------ | ----------------------------------------- | ------------------ |
| Character names    | A given name plus a surname or a byname   | Character          |
| Settlement names   | Villages, towns and cities                | Settlement         |
| Tavern & inn names | Painted signs for inns and other premises | Building           |
| Wilds & landmarks  | Mountains, marshes and other named places | Geographic Feature |
| Story prompts      | A premise, a turn and a complication      | —                  |

The four bound ones give you a dice beside the name field as soon as you create an element of that type, and beside the matching text field in the editor. Story prompts is unbound — roll it from any dice button's generator picker.

They are ordinary generators, not fixed content: edit their word lists, rebind them, or delete the ones you do not want.

## Creating a generator

1. Open the project **Settings** tab
2. Choose **Generators** in the sidebar
3. Click **Create generator**

A generator has a **template** and a set of **rules**. Rolling expands the template, replacing every `#rule#` with a random entry from that rule:

```
Template:  #first# #last#

Rule "first":  Aldric
               Brynn
               Cera

Rule "last":   Stonehelm
               of #place#

Rule "place":  Riverwyn
               Ashford
```

That rolls names like _Brynn Stonehelm_ and _Cera of Riverwyn_. Rules can reference other rules, as `last` does above, nested as deeply as the expansion limit allows — a reference that would recurse past it is left as plain text instead.

A plain word list is just a generator with one rule — set the template to `#word#` and put your list in a rule named `word`.

The **Preview** panel re-rolls as you type, so you can see the effect of every change immediately. Press **Roll again** for a fresh set.

### Weighting entries

Add `| <number>` to an entry to make it more likely than its neighbours:

```
Aldric | 5
Brynn
Cera
```

Here _Aldric_ comes up five times as often as the other two. Entries without a weight count as `1`.

### Modifiers

A reference can transform what it expands to, with one or more dot-separated modifiers:

| Modifier      | Effect                                 | Example                             |
| ------------- | -------------------------------------- | ----------------------------------- |
| `.capitalize` | Upper-cases the first letter           | `#word.capitalize#` → _Tower_       |
| `.upper`      | Upper-cases everything                 | `#word.upper#` → _TOWER_            |
| `.lower`      | Lower-cases everything                 | `#word.lower#` → _tower_            |
| `.title`      | Upper-cases each word                  | `#phrase.title#` → _The Grey Tower_ |
| `.a`          | Prefixes _a_ or _an_ as the word needs | `#word.a#` → _an inn_               |
| `.s`          | Pluralises                             | `#word.s#` → _towers_               |
| `.trim`       | Collapses runs of whitespace           |                                     |

Modifiers chain left to right: `#word.a.capitalize#` gives _An inn_.

### When something is wrong

The editor flags problems as you type and blocks saving until they are fixed:

- a `#reference#` that matches no rule
- a rule with no entries
- two rules with the same name
- a rule that can only ever refer back to itself, so it would never finish expanding

Unknown modifiers are only a warning — they are ignored when rolling.

## Rolling from a generator

Anywhere a dice button appears, clicking it opens a menu of suggestions. Pick one to fill the field, or press the refresh icon to roll a fresh set. Nothing is written until you choose a suggestion, so you can browse freely.

If the field is not bound to a particular generator, the menu lists every generator in the project and rolls whichever one you hover.

## Binding a generator to a template

Generators are most useful attached to the worldbuilding templates that need them.

**For element names** — open the template in the **Templates** settings section, and under **Schema Details** pick a **Name generator**. A dice button then appears beside the name field whenever you create an element of that type, and it skips names already used in the project.

**For a field** — edit any text or multi-line text field in the template and choose a **Generator**. That field gets its own dice button in the element editor.

Deleting a generator that a template points at is safe: the dice button simply stops appearing.

## Sharing generators

Generators are stored per project, alongside your templates and tags:

- collaborators see your generators in real time
- they work offline and sync when you reconnect
- they are included in project exports and imports

To reuse a generator in another project, export the project and import it there, or copy the rules across by hand.

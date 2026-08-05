---
id: element-types
title: Element Types
description: The built-in worldbuilding element types (character, species, deity, magic system, and more) and what each one is for.
sidebar_position: 2
---

# Element Types

Inkweld ships with **29 built-in element types** in the _Worldbuilding (Empty)_ and _Worldbuilding (Demo)_ project templates. Each type is a ready-made template with tabs and fields tuned to its purpose — and every one of them can be cloned and customized, or ignored entirely if you prefer to design your own from scratch.

:::tip Which type should I use?
There is no wrong answer — the types exist to give you a head start. If an entry doesn't fit any type, the generic **Item** type or a custom template of your own works fine.
:::

## People & Groups

| Type             | Icon              | Use for                                                                                                                                                                                   |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Character**    | `person`          | People, gods-as-characters, pets, and any individual with agency. Tabs: Basic Info, Appearance, Personality, Background, Abilities, plus an optional **Deity** tab for divine characters. |
| **Organization** | `account_balance` | Countries, governments, religions, pantheons, cults, guilds, companies, clans, universities, adventuring parties. Tabs: Basic Info, Leadership, Structure, Holdings, Goals, History.      |
| **Deity**        | `ac_unit`         | Gods and goddesses as their own entries. Tabs: Basic Info (domains, portfolio, rank), Worship, Relations (divine family, allies, enemies), History.                                       |
| **Ethnicity**    | `face`            | Cultures and ethnicities — a people sharing ancestry or customs, regardless of borders. Tabs: Basic Info, Culture (dress, values, customs, cuisine, arts), History.                       |
| **Profession**   | `work`            | Jobs and trades unique to your world (dragon rider, moonsmith, memory tailor). Tabs: Basic Info, Duties & Skills, Training, Notable Practitioners.                                        |
| **Title**        | `military_tech`   | Ranks and honours held by characters (Chief of Engineering, Guardian of the Wood). Tabs: Basic Info, Privileges & Obligations, History.                                                   |

## Places

| Type                   | Icon            | Use for                                                                                                                           |
| ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Location**           | `place`         | A general-purpose place when no specific type fits. Tabs: Overview, Description, Culture & Society, History.                      |
| **Building**           | `home_work`     | Specific structures: houses, palaces, temples, taverns, forges, castles. Tabs: Basic Info, Description, Occupants, History.       |
| **Settlement**         | `location_city` | Cities, towns, villages, outposts, colonies, space stations. Tabs: Basic Info, Geography, Society, History.                       |
| **Geographic Feature** | `terrain`       | Mountains, rivers, oceans, canyons, forests, deserts, volcanoes, caves. Tabs: Basic Info, Description, Significance.              |
| **Region**             | `map`           | Continents, provinces, and territories — areas bigger than a single settlement. Tabs: Basic Info, Description, Politics, History. |
| **Country**            | `flag`          | Nations with their own government and identity. Tabs: Basic Info, Geography, Society, Politics, History.                          |
| **Landmark**           | `location_on`   | Notable monuments, statues, bridges, ruins, and natural landmarks. Tabs: Basic Info, Description, History.                        |
| **Planet**             | `public`        | Planets, moons, and other world bodies in space. Tabs: Basic Info, Description, Astronomy.                                        |
| **Plane**              | `blur_on`       | Planes of existence, dimensions, and parallel worlds. Tabs: Basic Info, Nature, Inhabitants, Portals & Travel.                    |

## Creatures & Life

| Type        | Icon   | Use for                                                                                                                 |
| ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Species** | `pets` | Plants, animals, sapient races, and other living species. Tabs: Basic Info, Appearance, Behaviour & Culture, Relations. |

## Magic, Science & Knowledge

| Type             | Icon           | Use for                                                                                                                                                         |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Magic System** | `flash_on`     | How magic works in your world — its source, rules, costs, and limits (the "Natural Law" of magic). Tabs: Basic Info, Rules & Mechanics, Practitioners, History. |
| **Spell**        | `auto_awesome` | Individual spells and rituals. Tabs: Basic Info (school, level, casting time), Effect, Requirements.                                                            |
| **Technology**   | `router`       | How a technology works, who invented it, and its impact. Tabs: Basic Info, Principles, Applications, History.                                                   |
| **Language**     | `forum`        | Spoken, written, or constructed languages (conlangs). Tabs: Basic Info, Phonology, Grammar, Vocabulary.                                                         |
| **Material**     | `science`      | Raw materials and substances unique to your world (mithril, unobtanium). Tabs: Basic Info, Properties, Uses, Sources.                                           |
| **Lore**         | `menu_book`    | In-world documents: books, scrolls, inscriptions, recordings. Tabs: Basic Info, Content, Significance.                                                          |

## Events & Stories

| Type          | Icon           | Use for                                                                                                                       |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Conflict**  | `gavel`        | Wars, battles, sieges, feuds, rebellions — and even debates. Tabs: Basic Info, Causes & Parties, Course of Events, Aftermath. |
| **Event**     | `event`        | Coronations, disasters, treaties, discoveries — any significant historical moment. Tabs: Basic Info, Details, Significance.   |
| **Myth**      | `auto_stories` | Myths, legends, prophecies, and folk tales told within your world. Tabs: Basic Info, Narrative, Significance.                 |
| **Tradition** | `today`        | Festivals, ceremonies, rituals, games, sports, and social customs. Tabs: Basic Info, Practice, History.                       |

## Objects & Conveyances

| Type          | Icon             | Use for                                                                                                                                                                                                                |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Item**      | `category`       | Objects, artifacts, weapons, armour, tools, clothing, food, currency, treasure. The most flexible type — also serves as the general-purpose fallback. Tabs: Properties, Origin & History, Uses & Properties, Variants. |
| **Condition** | `sick`           | Diseases, curses, mutations, transformations, and magical afflictions. Tabs: Basic Info, Effects, Causes & Transmission, History.                                                                                      |
| **Vehicle**   | `directions_car` | Carriages, ships, airships, spaceships, and anything that moves. Tabs: Basic Info, Details, History.                                                                                                                   |

## Tips

- **Deities as characters?** If you prefer that model, use a **Character** and fill in its optional _Deity_ tab instead of creating a separate Deity element.
- **A space station** might be a Settlement or a Building; a spaceship is a Vehicle.
- **A magic system** is a Magic System entry; the spells it enables are Spell entries; the school that teaches it is an Organization.
- **A family or dynasty** is an Organization; each individual member is a Character.
- **Politics** is broad: a government is an Organization, a politician is a Character, an ideology is a Tradition or Ethnicity.
- Every built-in type can be **cloned** in Project Settings → Element Templates and renamed to fit your world's terminology.

---

**Next:** [Element References](./element-references) - Link your elements with @mentions.

import { inject, Injectable, signal } from '@angular/core';
import {
  castOf,
  type ConversationPluginOptions,
  ElementRefService,
  type Speaker,
  type SpeakerClickEvent,
} from '@editor';
import { ElementType } from '@inkweld/index';
import { TranslocoService } from '@jsverse/transloco';
import { type ElementSearchResult } from '@models/element-ref.model';
import { AppearanceService } from '@services/worldbuilding/appearance.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { type Node as PMNode } from 'prosemirror-model';

import { ProjectStateService } from './project-state.service';

/**
 * Speaker lookups for conversations: names, portraits and the speaker
 * picker. Speakers can be any worldbuilding element — a project's
 * "characters" may use any schema — or just a typed name.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuilding = inject(WorldbuildingService);
  private readonly appearance = inject(AppearanceService);
  private readonly elementRefs = inject(ElementRefService);
  private readonly transloco = inject(TranslocoService);

  /** Portrait lookups, keyed by project and element id. */
  private readonly avatars = new Map<string, Promise<string | null>>();

  /** Set when an avatar is clicked; the editor opens the speaker picker. */
  readonly speakerClick = signal<SpeakerClickEvent | null>(null);

  /** Callbacks for the conversation ProseMirror plugin. */
  pluginOptions(): ConversationPluginOptions {
    return {
      displayName: speaker => this.displayName(speaker),
      avatarUrl: speaker => this.avatarUrl(speaker),
      onSpeakerClick: event => this.speakerClick.set(event),
      label: key => this.transloco.translate(`editor.conversation.${key}`),
      findSpeaker: (name, doc) => this.findSpeaker(name, doc),
    };
  }

  /** The element's current name for a linked speaker, else the stored name. */
  displayName(speaker: Speaker): string {
    if (speaker.id) {
      const element = this.projectState
        .elements()
        .find(e => e.id === speaker.id);
      if (element) return element.name;
    }
    return speaker.name;
  }

  /** Identity image of a linked speaker, resolved to a loadable URL. */
  avatarUrl(speaker: Speaker): Promise<string | null> {
    const project = this.projectState.project();
    if (!speaker.id || !project) return Promise.resolve(null);
    const key = `${project.username}/${project.slug}/${speaker.id}`;
    let pending = this.avatars.get(key);
    if (!pending) {
      pending = this.loadAvatar(speaker.id, project.username, project.slug);
      this.avatars.set(key, pending);
    }
    return pending;
  }

  /** Forget cached portraits, e.g. after an identity image changes. */
  clearAvatarCache(): void {
    this.avatars.clear();
  }

  /**
   * The speaker a typed `Name:` refers to: someone already in the
   * conversation, else a worldbuilding element with that name, else an
   * unlinked speaker.
   */
  findSpeaker(name: string, doc: PMNode | null): Speaker {
    const folded = name.trim().toLocaleLowerCase();
    const inCast = doc
      ? castOf(doc).find(
          s => this.displayName(s).trim().toLocaleLowerCase() === folded
        )
      : undefined;
    if (inCast) return inCast;
    const element = this.projectState
      .elements()
      .find(
        e =>
          e.type === ElementType.Worldbuilding &&
          e.name.trim().toLocaleLowerCase() === folded
      );
    if (element) return { id: element.id, name: element.name };
    return { id: null, name: name.trim() };
  }

  /**
   * Worldbuilding elements matching `query`, for the speaker picker.
   * Elements sharing a schema with someone already linked in the
   * conversation come first, so whatever a project uses for its people
   * rises to the top without the picker knowing what that schema is.
   */
  searchSpeakers(
    query: string,
    limit = 8,
    linkedIds: readonly string[] = []
  ): ElementSearchResult[] {
    const elements = this.projectState.elements();
    const schemaOf = (id: string) => elements.find(e => e.id === id)?.schemaId;
    const preferred = new Set(
      linkedIds.map(schemaOf).filter((id): id is string => !!id)
    );
    const results = this.elementRefs.searchElements(query, {
      types: [ElementType.Worldbuilding],
      limit: preferred.size ? Number.MAX_SAFE_INTEGER : limit,
    });
    if (!preferred.size) return results;
    const rank = (result: ElementSearchResult) =>
      preferred.has(schemaOf(result.element.id) ?? '') ? 0 : 1;
    return [...results].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }

  private async loadAvatar(
    elementId: string,
    username: string,
    slug: string
  ): Promise<string | null> {
    try {
      const identity = await this.worldbuilding.getIdentityData(
        elementId,
        username,
        slug
      );
      if (!identity.image) return null;
      return await this.appearance.resolveImageReference(
        identity.image,
        username,
        slug
      );
    } catch {
      return null;
    }
  }
}

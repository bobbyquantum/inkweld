import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UserAvatarComponent } from '@components/user-avatar/user-avatar.component';
import { PresenceService } from '@services/presence/presence.service';

/**
 * Compact presence indicator for collaborative tabs (timeline, canvas, …).
 *
 * Renders avatars of remote users currently focused on the same `location`
 * (e.g. `timeline:<elementId>`). Hidden when no other users are present, so
 * solo editing does not produce visual noise.
 */
@Component({
  selector: 'app-tab-presence-indicator',
  imports: [MatTooltipModule, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tab-presence-indicator.component.html',
  styleUrls: ['./tab-presence-indicator.component.scss'],
})
export class TabPresenceIndicatorComponent {
  private readonly presence = inject(PresenceService);

  /**
   * Location key (e.g. `timeline:<elementId>`). When set, only users
   * currently focused on this location are shown. When omitted, all
   * remote users in the project are shown.
   */
  readonly location = input<string | null | undefined>(undefined);

  /** Maximum avatars to show before collapsing into a `+N` chip. */
  readonly maxDisplayed = input<number>(5);

  protected readonly visibleUsers = this.presence.usersAtLocation(
    this.location
  );

  protected readonly displayed = computed(() =>
    this.visibleUsers().slice(0, this.maxDisplayed())
  );

  protected readonly overflowCount = computed(() =>
    Math.max(0, this.visibleUsers().length - this.maxDisplayed())
  );

  protected readonly overflowTooltip = computed(() =>
    this.visibleUsers()
      .slice(this.maxDisplayed())
      .map(u => u.username)
      .join(', ')
  );
}

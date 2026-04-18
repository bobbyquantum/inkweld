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
  template: `
    @if (visibleUsers().length > 0) {
      <div
        class="tab-presence"
        data-testid="tab-presence-indicator"
        [attr.data-location]="location()">
        @for (user of displayed(); track user.clientId) {
          <div
            class="tab-presence__avatar"
            [matTooltip]="user.username"
            matTooltipPosition="below"
            data-testid="tab-presence-user"
            [attr.data-username]="user.username"
            [style.outlineColor]="user.color">
            <app-user-avatar [username]="user.username" size="small" />
          </div>
        }
        @if (overflowCount() > 0) {
          <div
            class="tab-presence__avatar tab-presence__avatar--overflow"
            [matTooltip]="overflowTooltip()">
            +{{ overflowCount() }}
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .tab-presence {
        display: inline-flex;
        align-items: center;
        gap: 0;
      }

      .tab-presence__avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        margin-left: -6px;
        outline: 2px solid var(--sys-surface, #fff);
        overflow: hidden;
        background: var(--sys-surface-container, #eee);

        &:first-child {
          margin-left: 0;
        }

        app-user-avatar,
        ::ng-deep .avatar.small {
          width: 100%;
          height: 100%;
        }

        &--overflow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          color: var(--sys-on-secondary-container, #333);
          background: var(--sys-secondary-container, #ddd);
        }
      }
    `,
  ],
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

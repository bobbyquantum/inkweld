import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { LoggerService } from '@services/core/logger.service';

import { CloudSyncConfigService } from '../cloud-sync-config.service';
import {
  type CloudTokenSet,
  CloudTokenStoreService,
} from '../cloud-token-store.service';
import { generateState } from '../pkce';
import {
  RemoteAuthError,
  RemoteReauthRequiredError,
} from '../remote-store.interface';
import {
  buildGoogleAuthorizeUrl,
  GOOGLE_AUTH_CHANNEL,
  GOOGLE_CALLBACK_PATH,
  type GoogleAuthRelayMessage,
  type GoogleAuthResponse,
  grantsAppData,
  parseGoogleAuthResponse,
  RENEWAL_STATE_PREFIX,
} from './google-auth';
import { getGoogleDriveUser } from './google-drive-api';

/** Opens the channel renewal responses arrive on; replaced in specs */
export const GOOGLE_AUTH_CHANNEL_FACTORY = new InjectionToken<
  () => BroadcastChannel
>('GOOGLE_AUTH_CHANNEL_FACTORY', {
  providedIn: 'root',
  factory: () => () => new BroadcastChannel(GOOGLE_AUTH_CHANNEL),
});

export interface GoogleAuthTiming {
  /** How long a hidden-iframe renewal may take before it counts as failed */
  silentTimeoutMs: number;
  /** Give up on a popup the user left open */
  popupTimeoutMs: number;
  /** How often to check whether the user closed the popup */
  popupPollMs: number;
}

/** Renewal timeouts; specs shorten them instead of faking timers */
export const GOOGLE_AUTH_TIMING = new InjectionToken<GoogleAuthTiming>(
  'GOOGLE_AUTH_TIMING',
  {
    providedIn: 'root',
    factory: () => ({
      silentTimeoutMs: 15_000,
      popupTimeoutMs: 5 * 60_000,
      popupPollMs: 500,
    }),
  }
);

/** After a failed silent renewal, don't try another for this long */
export const SILENT_RETRY_MS = 5 * 60_000;
/** Start renewing this long before the token expires */
export const RENEW_AHEAD_MS = 10 * 60_000;
const POPUP_NAME = 'inkweld-google-auth';
const POPUP_FEATURES = 'popup,width=480,height=640';

/**
 * Keeps a Google Drive access token alive without a refresh token.
 *
 * Google's browser token flow issues one-hour access tokens. Ten minutes
 * before expiry (or on expiry) the service asks Google again with
 * `prompt=none` in a hidden iframe. That succeeds when the browser lets the
 * iframe send Google's cookies (Chrome does; Safari and Firefox usually
 * block them). When it fails, the next click anywhere in the app opens a
 * popup that, for a user who is still signed in to Google, closes itself
 * within a second or so. Sync pauses only if the token actually expires
 * first; local edits are kept and pushed once it is renewed.
 *
 * The popup opens on one click only. If the user closes it or it is blocked,
 * `renewWithPopup()` from an explicit "Resume sync" control tries again.
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleDriveAuthService {
  private readonly config = inject(CloudSyncConfigService);
  private readonly tokens = inject(CloudTokenStoreService);
  private readonly logger = inject(LoggerService);
  private readonly document = inject(DOCUMENT);
  private readonly createChannel = inject(GOOGLE_AUTH_CHANNEL_FACTORY);
  private readonly timing = inject(GOOGLE_AUTH_TIMING);

  /** Config id whose token needs the user's help to renew, if any */
  readonly renewalNeeded = signal<string | null>(null);
  /** Increments after every successful renewal */
  readonly renewals = signal(0);

  private readonly silentRenewals = new Map<string, Promise<string | null>>();
  private readonly silentFailures = new Map<string, number>();
  private popupRenewal: Promise<boolean> | null = null;
  private clickListener: (() => void) | null = null;

  /**
   * A valid access token for `configId`. Renews silently when it can; when
   * only the user can, arms click renewal and throws
   * RemoteReauthRequiredError so the caller pauses instead of disconnecting.
   */
  async getAccessToken(configId: string): Promise<string> {
    const tokens = this.tokens.get(configId);
    if (!tokens) throw new RemoteAuthError('Google Drive is not connected');
    if (!this.tokens.isExpired(tokens)) {
      if (this.tokens.isExpired(tokens, RENEW_AHEAD_MS)) {
        void this.renewAhead(configId);
      }
      return tokens.accessToken;
    }
    const renewed = await this.renewSilently(configId);
    if (renewed) return renewed;
    this.armClickRenewal(configId);
    throw new RemoteReauthRequiredError(
      'Google Drive sign-in expired; click anywhere to resume sync'
    );
  }

  /**
   * Renew in a popup. Must be called from a click handler, or the browser
   * blocks the popup. Resolves true once a new token is stored.
   */
  renewWithPopup(
    configId: string | null = this.renewalNeeded()
  ): Promise<boolean> {
    if (!configId) return Promise.resolve(false);
    if (this.popupRenewal) return this.popupRenewal;
    this.disarmClickRenewal();

    const state = RENEWAL_STATE_PREFIX + generateState();
    const url = this.authorizeUrl(configId, state);
    const popup = url
      ? (this.document.defaultView?.open(url, POPUP_NAME, POPUP_FEATURES) ??
        null)
      : null;
    if (!popup) {
      this.logger.warn('CloudSync', 'Google sign-in popup was blocked');
      return Promise.resolve(false);
    }

    const run = this.waitForResponse(
      state,
      this.timing.popupTimeoutMs,
      () => popup.closed
    )
      .then(async response => {
        if (!popup.closed) popup.close();
        const token = await this.applyResponse(configId, response);
        if (token) this.silentFailures.delete(configId);
        return token !== null;
      })
      .finally(() => {
        this.popupRenewal = null;
      });
    this.popupRenewal = run;
    return run;
  }

  /** Stop waiting for a renewal (the profile was disconnected) */
  cancel(configId: string): void {
    if (this.renewalNeeded() === configId) {
      this.renewalNeeded.set(null);
      this.disarmClickRenewal();
    }
    this.silentFailures.delete(configId);
  }

  private async renewAhead(configId: string): Promise<void> {
    const token = await this.renewSilently(configId);
    // Still valid for a few minutes: let the next click renew it early so
    // sync never has to pause.
    if (!token) this.armClickRenewal(configId);
  }

  private renewSilently(configId: string): Promise<string | null> {
    const inFlight = this.silentRenewals.get(configId);
    if (inFlight) return inFlight;
    const failedAt = this.silentFailures.get(configId);
    if (failedAt !== undefined && Date.now() - failedAt < SILENT_RETRY_MS) {
      return Promise.resolve(null);
    }
    const run = this.runSilentRenewal(configId).finally(() => {
      this.silentRenewals.delete(configId);
    });
    this.silentRenewals.set(configId, run);
    return run;
  }

  private async runSilentRenewal(configId: string): Promise<string | null> {
    const state = RENEWAL_STATE_PREFIX + generateState();
    const url = this.authorizeUrl(configId, state, 'none');
    if (!url) return null;

    const response = this.waitForResponse(state, this.timing.silentTimeoutMs);
    const frame = this.document.createElement('iframe');
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = url;
    this.document.body.appendChild(frame);
    try {
      const answer = await response;
      frame.remove();
      const token = await this.applyResponse(configId, answer);
      if (token) {
        this.silentFailures.delete(configId);
      } else {
        this.silentFailures.set(configId, Date.now());
        this.logger.debug('CloudSync', 'Silent Google token renewal failed');
      }
      return token;
    } finally {
      frame.remove();
    }
  }

  private armClickRenewal(configId: string): void {
    this.renewalNeeded.set(configId);
    if (this.clickListener) return;
    const listener = (): void => {
      void this.renewWithPopup(configId);
    };
    this.clickListener = listener;
    this.document.addEventListener('click', listener, { capture: true });
  }

  private disarmClickRenewal(): void {
    if (!this.clickListener) return;
    this.document.removeEventListener('click', this.clickListener, {
      capture: true,
    });
    this.clickListener = null;
  }

  /**
   * Resolve with the relayed response carrying `state`, or null on timeout
   * or once `abandoned()` stays true across two polls (the relay closes the
   * popup right after posting, so one poll of grace lets its message land).
   */
  private waitForResponse(
    state: string,
    timeoutMs: number,
    abandoned?: () => boolean
  ): Promise<GoogleAuthResponse | null> {
    return new Promise(resolve => {
      const channel = this.createChannel();
      let abandonedOnce = false;
      let poll: ReturnType<typeof setInterval> | undefined;
      const finish = (response: GoogleAuthResponse | null): void => {
        channel.close();
        clearTimeout(timer);
        if (poll !== undefined) clearInterval(poll);
        resolve(response);
      };
      channel.onmessage = (event: MessageEvent<GoogleAuthRelayMessage>) => {
        if (event.data?.type !== 'google-auth-response') return;
        const response = parseGoogleAuthResponse(event.data.fragment);
        if (response?.state === state) finish(response);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      if (abandoned) {
        poll = setInterval(() => {
          if (!abandoned()) return;
          if (abandonedOnce) finish(null);
          abandonedOnce = true;
        }, this.timing.popupPollMs);
      }
    });
  }

  /**
   * Mark the stored token expired after Drive rejected it (revoked early, or
   * the local clock is off), so the next request renews it instead of
   * sending it again. The account and login hint are kept.
   */
  invalidate(configId: string): void {
    const current = this.tokens.get(configId);
    if (current) this.tokens.set(configId, { ...current, expiresAt: 0 });
  }

  /**
   * Store a successful response; returns the new token or null. The token
   * must belong to the connected account: `login_hint` is only a hint, and
   * in the popup the user can pick another account, whose app data folder
   * sync would otherwise read and overwrite.
   */
  private async applyResponse(
    configId: string,
    response: GoogleAuthResponse | null
  ): Promise<string | null> {
    if (response?.kind !== 'token') {
      if (response) {
        this.logger.debug(
          'CloudSync',
          `Google token renewal answered ${response.error}`
        );
      }
      return null;
    }
    if (!grantsAppData(response.scope)) {
      this.logger.warn(
        'CloudSync',
        'Google renewal did not grant Drive app data access'
      );
      return null;
    }
    const current = this.tokens.get(configId);
    if (!current) return null;
    if (!(await this.isSameAccount(response.accessToken, current.accountId))) {
      return null;
    }
    const next: CloudTokenSet = {
      ...current,
      accessToken: response.accessToken,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };
    this.tokens.set(configId, next);
    if (this.renewalNeeded() === configId) {
      this.renewalNeeded.set(null);
      this.disarmClickRenewal();
    }
    this.renewals.update(n => n + 1);
    return next.accessToken;
  }

  private async isSameAccount(
    accessToken: string,
    accountId: string
  ): Promise<boolean> {
    try {
      const user = await getGoogleDriveUser(accessToken);
      if (user.permissionId === accountId) return true;
      this.logger.warn(
        'CloudSync',
        'Google renewal signed in to a different account; ignoring it'
      );
    } catch (error) {
      this.logger.warn(
        'CloudSync',
        'Could not confirm the renewed Google account',
        error
      );
    }
    return false;
  }

  private authorizeUrl(
    configId: string,
    state: string,
    prompt?: 'none'
  ): string | null {
    const clientId = this.config.getAppKey('google-drive');
    if (!clientId) return null;
    return buildGoogleAuthorizeUrl({
      clientId,
      redirectUri: `${globalThis.location.origin}${GOOGLE_CALLBACK_PATH}`,
      state,
      prompt,
      loginHint: this.tokens.get(configId)?.loginHint,
    });
  }
}

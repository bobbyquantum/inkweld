import { inject, Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class UpdateService {
  private swUpdate = inject(SwUpdate);

  constructor() {
    if (this.swUpdate.isEnabled) {
      console.log('Service Worker Update Service initialized');

      this.swUpdate.versionUpdates
        .pipe(
          filter(
            (evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'
          )
        )
        .subscribe(evt => {
          console.log('New version available!', evt);
          if (confirm('A new version of Inkweld is available. Update now?')) {
            window.location.reload();
          }
        });

      // Check for updates every hour
      setInterval(() => {
        void this.swUpdate.checkForUpdate();
      }, 3600000);
    }
  }
}

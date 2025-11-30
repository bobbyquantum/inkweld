import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

/**
 * Component for resetting all browser storage and logging the user out.
 * Clears IndexedDB databases, localStorage, sessionStorage, and cookies.
 */
@Component({
  selector: 'app-reset',
  templateUrl: './reset.component.html',
  styleUrls: ['./reset.component.scss'],
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
})
export class ResetComponent {
  private router = inject(Router);

  readonly isClearing = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Clear all browser storage and redirect to setup/login
   */
  async clearAllData(): Promise<void> {
    this.isClearing.set(true);
    this.error.set(null);

    try {
      // 1. Delete all IndexedDB databases
      await this.clearIndexedDB();

      // 2. Clear localStorage
      localStorage.clear();

      // 3. Clear sessionStorage
      sessionStorage.clear();

      // 4. Clear all cookies
      this.clearCookies();

      // 5. Navigate to setup page
      await this.router.navigate(['/setup']);
    } catch (err) {
      console.error('Error clearing data:', err);
      this.error.set(
        'Failed to clear some data. Please try again or clear your browser data manually.'
      );
      this.isClearing.set(false);
    }
  }

  /**
   * Delete all IndexedDB databases
   */
  private async clearIndexedDB(): Promise<void> {
    // Known database names used by Inkweld
    const knownDatabases = ['inkweld-media', 'inkweld-sync'];

    // Try to get all databases (not supported in all browsers)
    if ('databases' in indexedDB) {
      try {
        const databases = await indexedDB.databases();
        for (const db of databases) {
          if (db.name) {
            await this.deleteDatabase(db.name);
          }
        }
        return;
      } catch {
        // Fall through to known databases
      }
    }

    // Fallback: delete known databases
    for (const dbName of knownDatabases) {
      await this.deleteDatabase(dbName);
    }
  }

  /**
   * Delete a single IndexedDB database
   */
  private deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error(`Failed to delete database: ${name}`));
      request.onblocked = () => {
        // Database is blocked, but we'll resolve anyway
        console.warn(`Database ${name} delete was blocked`);
        resolve();
      };
    });
  }

  /**
   * Clear all cookies for the current domain
   */
  private clearCookies(): void {
    const cookies = document.cookie.split(';');

    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name =
        eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      if (name) {
        // Try to delete with various path combinations
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
      }
    }
  }
}

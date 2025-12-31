import { Injectable, ApplicationRef, inject, isDevMode } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, first, interval, concat } from 'rxjs';

/**
 * Service for handling PWA updates.
 * Checks for updates periodically and notifies users when a new version is available.
 */
@Injectable({
  providedIn: 'root'
})
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    if (!isDevMode() && this.swUpdate.isEnabled) {
      this.initializeUpdateCheck();
      this.listenForUpdates();
    }
  }

  /**
   * Initialize periodic update checks after app stabilizes.
   * Checks for updates every 6 hours.
   */
  private initializeUpdateCheck(): void {
    // Wait for app to stabilize before checking for updates
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable)
    );

    // Check for updates every 6 hours
    const everyHours$ = interval(6 * 60 * 60 * 1000);
    const everyHoursOnceStable$ = concat(appIsStable$, everyHours$);

    everyHoursOnceStable$.subscribe(() => {
      this.checkForUpdate();
    });
  }

  /**
   * Listen for version ready events from the service worker.
   */
  private listenForUpdates(): void {
    this.swUpdate.versionUpdates.pipe(
      filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY')
    ).subscribe(event => {
      console.log('New version available:', event.latestVersion);
      this.promptUserToUpdate();
    });
  }

  /**
   * Manually check for updates.
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      const updateAvailable = await this.swUpdate.checkForUpdate();
      console.log('Update check complete. Update available:', updateAvailable);
      return updateAvailable;
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Show snackbar notification prompting user to update.
   */
  private promptUserToUpdate(): void {
    const snackBarRef = this.snackBar.open(
      'A new version is available!',
      'Update',
      {
        duration: 0, // Don't auto-dismiss
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['nubian-snackbar', 'nubian-snackbar--info']
      }
    );

    snackBarRef.onAction().subscribe(() => {
      this.activateUpdate();
    });
  }

  /**
   * Activate the update and reload the app.
   */
  async activateUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
      window.location.reload();
    } catch (error) {
      console.error('Error activating update:', error);
      // Force reload anyway
      window.location.reload();
    }
  }
}

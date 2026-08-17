import {Injectable, inject} from '@angular/core';
import {SwUpdate, VersionReadyEvent} from '@angular/service-worker';
import {MatSnackBar} from '@angular/material/snack-bar';
import {filter} from 'rxjs/operators';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Installed as a PWA, the app would otherwise run stale code indefinitely with no prompt
// to reload — native apps update in the background, this is the equivalent nudge. Checks
// hourly and whenever the tab regains focus, since a backgrounded PWA can sit for days.
@Injectable({providedIn: 'root'})
export class UpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates.pipe(
      filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
    ).subscribe(() => this.promptReload());

    setInterval(() => this.swUpdate.checkForUpdate(), CHECK_INTERVAL_MS);
    window.addEventListener('focus', () => this.swUpdate.checkForUpdate());
  }

  private promptReload(): void {
    const snackBarRef = this.snackBar.open('Ny version af Planner er klar.', 'Genindlæs');
    snackBarRef.onAction().subscribe(() => document.location.reload());
  }
}

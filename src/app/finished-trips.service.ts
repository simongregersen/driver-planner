import {Injectable, signal} from '@angular/core';

/**
 * Tracks which trips a driver has personally marked as finished, purely as an on-device
 * convenience — never synced to Firebase, never visible to anyone else. Keyed by trip $key,
 * which is stable across edits.
 */
@Injectable({providedIn: 'root'})
export class FinishedTripsService {
  private static readonly STORAGE_KEY = 'driver-planner:finished-trips';

  private readonly finishedKeys = signal<Set<string>>(this.load());

  isFinished(tripKey: string): boolean {
    return this.finishedKeys().has(tripKey);
  }

  toggle(tripKey: string): void {
    const next = new Set(this.finishedKeys());
    if (next.has(tripKey)) {
      next.delete(tripKey);
    } else {
      next.add(tripKey);
    }
    this.finishedKeys.set(next);
    this.save(next);
  }

  private load(): Set<string> {
    try {
      const raw = localStorage.getItem(FinishedTripsService.STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  // localStorage can throw (private browsing, quota) — finished state just won't persist then.
  private save(keys: Set<string>): void {
    try {
      localStorage.setItem(FinishedTripsService.STORAGE_KEY, JSON.stringify([...keys]));
    } catch {
      // Ignored — see comment above.
    }
  }
}

import {Injectable, inject} from '@angular/core';
import {DataStore} from '../data.service';

/**
 * Records that the signed-in driver has seen a particular version of a trip.
 *
 * Fire-and-forget by design. A receipt is a nice-to-have for the office, never something the
 * driver is waiting on, so a failure here must not produce a snackbar or block anything — the
 * same posture as DataStore.enqueueTripChangeNotification.
 *
 * The in-memory set is load-bearing even though the database is the real authority on
 * first-read-wins. The SDK applies a write optimistically, so the local trip gains its receipt
 * immediately and SeenWhenVisibleDirective's token goes null; if the server then rejects the
 * write — which it does for a version already recorded — the rollback puts the token back and the
 * directive re-arms. Without remembering the attempt, that loop repeats for as long as the row is
 * on screen.
 */
@Injectable({providedIn: 'root'})
export class ReadReceiptsService {
  private readonly dataStore = inject(DataStore);
  private readonly attempted = new Set<string>();

  record(tripKey: string, driverKey: string, version: number): void {
    const token = `${tripKey}:${driverKey}:${version}`;
    if (this.attempted.has(token)) return;
    this.attempted.add(token);
    this.dataStore.markTripRead(tripKey, driverKey, version).catch(err => {
      // Expected whenever a receipt for this version already exists: the rules reject the
      // duplicate rather than letting it re-stamp when the driver first saw it. Deliberately not
      // retried and deliberately not surfaced.
      console.warn('Could not record trip read receipt', err);
    });
  }
}

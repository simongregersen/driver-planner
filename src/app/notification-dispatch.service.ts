import {Injectable} from '@angular/core';
import {environment} from '../environments/environment';

// A burst of enqueued notifications only needs one poller run to drain the whole queue, so
// collapse rapid-fire triggers into a single dispatch. Inserting a 20-trip template into an
// already-published day previously fired 20 separate workflow_dispatch calls in a burst, which
// GitHub may rate-limit (silently dropping some) for no benefit — the first run drains all 20
// queue entries anyway.
const TRIGGER_DEBOUNCE_MS = 2000;

// Kicks the notification-poller GitHub Actions workflow off immediately instead of
// waiting for its 5-minute cron fallback. Best-effort: a failure here just means
// delivery falls back to the schedule, so callers don't need to handle rejections.
@Injectable({providedIn: 'root'})
export class NotificationDispatchService {
  private pending: ReturnType<typeof setTimeout> | null = null;

  trigger(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.dispatch();
    }, TRIGGER_DEBOUNCE_MS);
  }

  private dispatch(): void {
    const {owner, repo, workflowFile, token} = environment.notificationDispatch;
    if (!token) {
      return;
    }
    fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ref: 'master'}),
    }).catch(err => console.warn('Could not trigger notification-poller immediately, relying on the scheduled poll', err));
  }
}

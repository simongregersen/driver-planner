import {Injectable} from '@angular/core';
import {environment} from '../environments/environment';

// Kicks the notification-poller GitHub Actions workflow off immediately instead of
// waiting for its 5-minute cron fallback. Best-effort: a failure here just means
// delivery falls back to the schedule, so callers don't need to handle rejections.
@Injectable({providedIn: 'root'})
export class NotificationDispatchService {
  trigger(): void {
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

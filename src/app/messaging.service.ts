import {Injectable, inject} from '@angular/core';
import {getToken, onMessage} from 'firebase/messaging';
import {ref, remove, set} from 'firebase/database';
import {MatSnackBar} from '@angular/material/snack-bar';
import {db, messaging} from './firebase';
import {environment} from '../environments/environment';
import {AuthenticationService} from './authentication.service';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Registers this device for push notifications and keeps the in-app foreground
// notification listener alive for as long as the app is running.
@Injectable({providedIn: 'root'})
export class MessagingService {
  private readonly authService = inject(AuthenticationService);
  private readonly snackBar = inject(MatSnackBar);
  private currentTokenHash: string | null = null;

  constructor() {
    messaging.then(m => {
      if (!m) {
        return;
      }
      onMessage(m, payload => {
        this.snackBar.open(payload.notification?.body ?? payload.notification?.title ?? 'New notification', 'Dismiss', {
          duration: 8000,
        });
      });
    });
  }

  // Call this from an explicit user action (e.g. an "Enable notifications" button),
  // not automatically on load, per notification-permission best practice.
  async register(): Promise<boolean> {
    const m = await messaging;
    if (!m) {
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    const uid = await firstUid(this.authService);
    if (!uid) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(m, {
      vapidKey: environment.fcmVapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return false;
    }

    this.currentTokenHash = await sha256Hex(token);
    await set(ref(db, `/fcmTokens/${uid}/${this.currentTokenHash}`), {
      token,
      updatedAt: Date.now(),
    });
    return true;
  }

  async unregister(): Promise<void> {
    const uid = await firstUid(this.authService);
    if (uid && this.currentTokenHash) {
      await remove(ref(db, `/fcmTokens/${uid}/${this.currentTokenHash}`));
    }
    this.currentTokenHash = null;
  }
}

function firstUid(authService: AuthenticationService): Promise<string | null> {
  return new Promise(resolve => {
    const sub = authService.authState.subscribe(user => {
      resolve(user?.uid ?? null);
      queueMicrotask(() => sub.unsubscribe());
    });
  });
}

import {Injectable, inject} from '@angular/core';
import {getToken, onMessage} from 'firebase/messaging';
import {ref, remove, set} from 'firebase/database';
import {MatSnackBar} from '@angular/material/snack-bar';
import {db, messaging} from './firebase';
import {environment} from '../environments/environment';
import {AuthenticationService} from './authentication.service';

// Must match the constant of the same name in src/combined-sw.js — a service worker can't import
// from the app bundle, so the string is duplicated rather than shared.
const PUSH_TO_WINDOW = 'planner-push';

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
      // Fires when the FCM SDK recognises a visible page and hands the push straight to it
      // instead of showing a notification.
      onMessage(m, payload => this.showPushSnackbar(payload.data));
    });
    this.listenForServiceWorkerPushes();
  }

  // iOS doesn't report an installed PWA that's open in the foreground as a visible client, so
  // the SDK's own foreground path above never runs there and the push is handled as a background
  // one instead. combined-sw.js forwards those to us anyway (see its comment) — hence the
  // visibility check, which is the part the service worker couldn't do for itself.
  private listenForServiceWorkerPushes(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type !== PUSH_TO_WINDOW || document.visibilityState !== 'visible') {
        return;
      }
      this.showPushSnackbar(event.data.data);
    });
  }

  // Reads `data` rather than `notification` — the sender is data-only, see
  // scripts/send-notifications.mjs. Title first and body under it, matching what the service
  // worker puts on the lock screen: showing the body alone left a driver with "Tur 12 d. 5. maj
  // kl. 08:00" and no indication of what had actually happened to it. The newline renders as a
  // line break via the pre-line rule in styles.css.
  private showPushSnackbar(data: Record<string, string> | undefined): void {
    const {title, body} = data ?? {};
    this.snackBar.open([title, body].filter(Boolean).join('\n') || 'Ny besked', 'OK', {
      duration: 8000,
    });
  }

  // Call this from an explicit user action (e.g. an "Enable notifications" button),
  // not automatically on load, per notification-permission best practice.
  //
  // Every early exit below (and the catch at the end) logs *why*, since the UI only ever shows
  // a generic "couldn't enable" message on failure — without this, there was no way to tell a
  // browser that doesn't support push apart from a previously-denied permission apart from a
  // real Firebase/FCM error from the console alone.
  async register(): Promise<boolean> {
    try {
      const m = await messaging;
      if (!m) {
        console.warn('[MessagingService] Push messaging is not supported in this browser/context.');
        return false;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn(`[MessagingService] Notification permission was not granted (state: "${permission}"). If this resolved instantly with no prompt, it was likely already denied previously at the OS/browser level.`);
        return false;
      }

      const uid = await firstUid(this.authService);
      if (!uid) {
        console.warn('[MessagingService] No authenticated user was available to register a token for.');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(m, {
        vapidKey: environment.fcmVapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        console.warn('[MessagingService] getToken() resolved with no token.');
        return false;
      }

      this.currentTokenHash = await sha256Hex(token);
      await set(ref(db, `/fcmTokens/${uid}/${this.currentTokenHash}`), {
        token,
        updatedAt: Date.now(),
      });
      return true;
    } catch (err) {
      console.error('[MessagingService] register() failed:', err);
      return false;
    }
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

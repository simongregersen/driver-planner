import {Injectable, signal} from '@angular/core';

// Chrome/Edge/Android fire this when the PWA meets their own installability criteria (valid
// manifest, registered service worker, HTTPS — all already true here) and expect the page to
// suppress their own mini-infobar (preventDefault) and offer its own install trigger instead.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}

// iOS Safari's own non-standard "installed as home-screen app" flag — absent from the standard
// Navigator type, so this exists purely to read it without an `any` cast.
interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

// iOS Safari has never implemented beforeinstallprompt (and Apple has given no indication it
// ever will) — there is no programmatic way to trigger "Add to Home Screen" there. The best a
// page can do is detect it's running there and show instructions for the manual gesture
// instead, which is why this exposes isIOS as its own signal rather than folding it into
// canInstall.
@Injectable({providedIn: 'root'})
export class InstallPromptService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly isStandalone = signal(InstallPromptService.detectStandalone());
  readonly isIOS = signal(InstallPromptService.detectIOS());
  readonly canInstall = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    // Covers both a successful install via our own button and one triggered any other way
    // (e.g. the browser's own omnibox install icon) — either way, nothing left to offer.
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
    });
  }

  async install(): Promise<void> {
    const promptEvent = this.deferredPrompt;
    if (!promptEvent) return;
    this.deferredPrompt = null;
    this.canInstall.set(false);
    await promptEvent.prompt();
    await promptEvent.userChoice;
  }

  private static detectStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as NavigatorWithStandalone).standalone === true;
  }

  // iPadOS's Safari presents its UA as a desktop Mac by default — maxTouchPoints is the
  // standard way to tell an actual (touch-capable) iPad apart from a real desktop Mac.
  private static detectIOS(): boolean {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  }
}

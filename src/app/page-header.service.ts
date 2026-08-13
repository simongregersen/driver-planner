import {Injectable, signal} from '@angular/core';

// Lets each routed page push its own title (and an optional short subtitle — a selected date,
// a period range, ...) up into the app shell's toolbar, which otherwise has no way to know
// what page it's showing. Only rendered on mobile (see app.component.html/css) — desktop keeps
// each page's own in-page title, unaffected by this.
@Injectable({providedIn: 'root'})
export class PageHeaderService {
  readonly title = signal('');
  readonly subtitle = signal<string | null>(null);

  set(title: string, subtitle: string | null = null): void {
    this.title.set(title);
    this.subtitle.set(subtitle);
  }
}

import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {BreakpointObserver} from '@angular/cdk/layout';
import {map} from 'rxjs/operators';

// Matches the 767px breakpoint already used throughout this app's own CSS (the trips table's
// card layout, date-field, date-time-field, etc.) — kept in one place so anything needing it in
// TypeScript (e.g. a mat-datepicker's touchUi input) follows the same rule as the CSS does,
// rather than every component re-deriving its own media query.
@Injectable({providedIn: 'root'})
export class BreakpointService {
  private readonly observer = inject(BreakpointObserver);

  readonly isMobile = toSignal(
    this.observer.observe('(max-width: 767px)').pipe(map(state => state.matches)),
    {initialValue: false},
  );
}

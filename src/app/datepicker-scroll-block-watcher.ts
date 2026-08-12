import {Injectable, inject} from '@angular/core';
import {BreakpointService} from './breakpoint.service';
import {MobileScrollBlockStrategy} from './mobile-scroll-block-strategy';

/**
 * MatDatepicker's touchUi mode hardcodes CDK's BlockScrollStrategy (see styles.css for why that
 * can't be swapped out the way it was for dialogs/the "Mere" sheet), so its cdk-global-
 * scrollblock class still gets toggled on <html> on every open/close — styles.css neutralizes
 * the layout effect of that class on mobile, which means nothing is actually blocking the
 * background from scrolling behind the calendar anymore. This mirrors the class onto our own
 * touchmove-based block (the same one dialogs/the sheet use) so that protection isn't lost.
 */
@Injectable({providedIn: 'root'})
export class DatepickerScrollBlockWatcher {
  private readonly breakpoints = inject(BreakpointService);
  private readonly strategy = new MobileScrollBlockStrategy();

  constructor() {
    const html = document.documentElement;
    new MutationObserver(() => {
      if (html.classList.contains('cdk-global-scrollblock') && this.breakpoints.isMobile()) {
        this.strategy.enable();
      } else {
        this.strategy.disable();
      }
    }).observe(html, {attributes: true, attributeFilter: ['class']});
  }
}

import {ChangeDetectionStrategy, Component, signal} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

// A bottom-pinned bar with an always-visible row (bar-collapsed) and a second row
// (bar-expanded) that's collapsed by default and toggled open with the triangle button — on
// short-height screens the always-expanded version of this bar (the previous design) ate too
// much of the little vertical space left for actual content.
@Component({
  standalone: true,
  selector: 'app-collapsible-bottom-bar',
  templateUrl: './collapsible-bottom-bar.component.html',
  styleUrls: ['./collapsible-bottom-bar.component.css'],
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapsibleBottomBarComponent {
  readonly expanded = signal(false);

  toggle(): void {
    this.expanded.update(value => !value);
  }
}

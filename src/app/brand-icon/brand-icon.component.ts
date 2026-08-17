import {ChangeDetectionStrategy, Component, input} from '@angular/core';

// Shared with the toolbar (app.component.html) and the sign-in screen — kept as one component
// rather than duplicating the SVG so the two never drift apart.
@Component({
  standalone: true,
  selector: 'app-brand-icon',
  templateUrl: './brand-icon.component.html',
  styleUrls: ['./brand-icon.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandIconComponent {
  height = input(28);
}

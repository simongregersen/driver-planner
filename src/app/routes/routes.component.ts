import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-routes',
  templateUrl: './routes.component.html',
  styleUrls: ['./routes.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutesComponent {
}

import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment, {Moment} from 'moment';
import {DateTimeFieldComponent} from '../date-time-field/date-time-field.component';

@Component({
  standalone: true,
  selector: 'app-clock-record-creator',
  templateUrl: './clock-record-creator.component.html',
  styleUrls: ['./clock-record-creator.component.css'],
  imports: [
    FormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateTimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClockRecordCreatorComponent {
  private save!: (clockIn: Moment, note: string | null) => void;

  readonly dialogRef = inject(MatDialogRef<ClockRecordCreatorComponent>);

  clockIn: Moment | null = null;
  note = '';

  public open(save: (clockIn: Moment, note: string | null) => void): void {
    this.save = save;
    this.clockIn = this.roundToQuarterHour(moment());
  }

  onSubmit(): void {
    if (!this.clockIn) return;
    this.save(this.clockIn, this.note.trim() || null);
  }

  private roundToQuarterHour(m: Moment): Moment {
    return m.clone().minutes(Math.round(m.minutes() / 15) * 15).seconds(0).milliseconds(0);
  }
}

import {ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AsyncPipe} from '@angular/common';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {DateUtility} from '../date-utility';
import {ClockPunchComponent} from '../clock-punch/clock-punch.component';
import {TimeReportingComponent} from '../time-reporting/time-reporting.component';
import {PageHeaderService} from '../page-header.service';

@Component({
  standalone: true,
  selector: 'app-time-tracking',
  templateUrl: './time-tracking.component.html',
  styleUrls: ['./time-tracking.component.css'],
  imports: [AsyncPipe, ClockPunchComponent, TimeReportingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeTrackingComponent implements OnInit {
  readonly userService = inject(UserService);
  private readonly dateUtility = inject(DateUtility);
  private readonly authService = inject(AuthenticationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageHeader = inject(PageHeaderService);

  readonly recordsWindowStart = this.dateUtility.today().subtract(14, 'days');

  ngOnInit(): void {
    this.pageHeader.set('Arbejdstid');

    this.userService.driverProfile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(driver => {
        if (driver?.deleted) {
          this.authService.logout();
        }
      });
  }
}

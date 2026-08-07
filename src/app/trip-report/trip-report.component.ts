import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';
import {NgbActiveModal, NgbInputDatepicker, NgbTimepicker} from '@ng-bootstrap/ng-bootstrap';
import {take} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {Trip, TripReport} from '../trip';
import {NgbUtility} from '../ngb-date-utility';
import {DataStore} from '../data.service';
import {SelectOption} from '../select-option';
import {Utility} from '../utility';

@Component({
  standalone: true,
  selector: 'app-trip-report',
  templateUrl: './trip-report.component.html',
  styleUrls: ['./trip-report.component.css'],
  imports: [ReactiveFormsModule, DatePipe, NgbInputDatepicker, NgbTimepicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripReportComponent {
  save!: (trip: Trip, driverKey: string, report: TripReport) => void;
  trip!: Trip;
  fixedDriverKey: string | null = null;

  readonly selectedDriverKey = signal<string | null>(null);
  readonly availableDrivers = signal<SelectOption[]>([]);
  readonly selectedDriverName = computed(() =>
    this.availableDrivers().find(d => d.id === this.selectedDriverKey())?.name ?? ''
  );

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  readonly modal = inject(NgbActiveModal);
  readonly minDate = this.ngbUtility.minDate(5);

  reportForm: FormGroup = this.fb.group({
    startDate: null,
    startTime: null,
    garageDate: null,
    garageTime: null,
    endDate: null,
    endTime: null,
  });

  private readonly formValue = toSignal(this.reportForm.valueChanges, {initialValue: this.reportForm.value});
  readonly orderError = computed(() => this.computeOrderError(this.formValue()));

  public edit(trip: Trip, save: (trip: Trip, driverKey: string, report: TripReport) => void, fixedDriverKey?: string) {
    this.save = save;
    this.trip = trip;
    this.fixedDriverKey = fixedDriverKey ?? null;

    this.dataStore.getAllDrivers().pipe(take(1)).subscribe(all => {
      const assigned = Utility.filterDeleted(all).filter(d => trip.drivers.includes(d.$key));
      this.availableDrivers.set(assigned.map(d => ({id: d.$key, name: d.displayName})));
      this.selectDriver(fixedDriverKey ?? assigned[0]?.$key ?? trip.drivers[0]);
    });
  }

  selectDriver(driverKey: string) {
    this.selectedDriverKey.set(driverKey);

    const report = this.trip.reports?.[driverKey];
    const start = report?.actualStart ? moment(report.actualStart) : null;
    const garage = report?.garageReturn ? moment(report.garageReturn) : null;
    const end = report?.actualEnd ? moment(report.actualEnd) : null;

    this.reportForm.patchValue({
      startDate: start ? this.ngbUtility.getDate(start) : null,
      startTime: start ? this.ngbUtility.getTime(start) : null,
      garageDate: garage ? this.ngbUtility.getDate(garage) : null,
      garageTime: garage ? this.ngbUtility.getTime(garage) : null,
      endDate: end ? this.ngbUtility.getDate(end) : null,
      endTime: end ? this.ngbUtility.getTime(end) : null,
    });
  }

  setNow(field: 'start' | 'garage' | 'end') {
    const now = moment();
    this.reportForm.patchValue({
      [`${field}Date`]: this.ngbUtility.getDate(now),
      [`${field}Time`]: this.ngbUtility.getTime(now),
    });
  }

  clear(field: 'start' | 'garage' | 'end') {
    this.reportForm.patchValue({
      [`${field}Date`]: null,
      [`${field}Time`]: null,
    });
  }

  onSubmit() {
    if (this.orderError()) return;

    const val = this.reportForm.value;
    const actualStart = this.toMomentOrNull(val.startDate, val.startTime);
    const garageReturn = this.toMomentOrNull(val.garageDate, val.garageTime);
    const actualEnd = this.toMomentOrNull(val.endDate, val.endTime);

    this.save(this.trip, this.selectedDriverKey()!, {actualStart, garageReturn, actualEnd});
  }

  private toMomentOrNull(date: any, time: any): Moment | null {
    if (!date && !time) return null;
    return this.ngbUtility.toMoment(date || this.ngbUtility.getDate(moment(this.trip.start)), time);
  }

  private computeOrderError(val: any): string | null {
    if (!this.trip) return null;

    const start = this.toMomentOrNull(val.startDate, val.startTime);
    const garage = this.toMomentOrNull(val.garageDate, val.garageTime);
    const end = this.toMomentOrNull(val.endDate, val.endTime);

    if (start && garage && garage.isBefore(start)) {
      return 'Retur til garage kan ikke være før start.';
    }
    if (garage && end && end.isBefore(garage)) {
      return 'Afsluttet kan ikke være før retur til garage.';
    }
    if (!garage && start && end && end.isBefore(start)) {
      return 'Afsluttet kan ikke være før start.';
    }
    return null;
  }
}

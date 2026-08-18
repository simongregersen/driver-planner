import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatListModule} from '@angular/material/list';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Template} from '../template';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {NewTrip, Trip} from '../trip';
import {TripFormComponent} from '../trip-form/trip-form.component';
import {TripsComponent} from '../trips/trips.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';
import {WriteFeedbackService} from '../write-feedback.service';

@Component({
  standalone: true,
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe,
    MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatListModule,
    MatTooltipModule,
    TripsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);
  private readonly pageHeader = inject(PageHeaderService);

  // Only used to name the driver/vehicle in the removal confirmation. Deliberately unfiltered —
  // getAllDrivers no longer strips soft-deleted drivers (see its doc comment), which is what lets
  // a driver who has since left still resolve to a name here rather than to 'chaufføren'.
  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});

  templates$!: Observable<Template[]>;
  trips$!: Observable<Trip[]>;
  // Null until the template list first arrives (see ngOnInit) — the previous `!: Template`
  // declared away a state that genuinely occurs, which left the template's own `?.` guard
  // looking redundant to the compiler while still being needed at runtime.
  private _selectedTemplate: Template | null = null;

  templateForm: FormGroup = this.fb.group({
    name: ['', Validators.required]
  });

  ngOnInit(): void {
    this.pageHeader.set('Skabeloner');

    this.templates$ = this.dataStore.getAllTemplates();
    // Auto-select the first template once, when the list first arrives.
    this.templates$.pipe(take(1)).subscribe(ts => {
      if (ts.length) this.selectedTemplate = ts[0];
    });
  }

  createTemplate() {
    if (!this.templateForm.valid) return;
    const val = this.templateForm.value;
    void this.writeFeedback.run(this.dataStore.addTemplate(val.name));
    this.templateForm.reset();
  }

  removeTemplate(template: Template) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette skabelonen\n'${template.name}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) void this.writeFeedback.run(this.dataStore.removeTemplate(template), {failureMessage: 'Kunne ikke slette skabelonen. Prøv igen.'});
    });
  }

  create() {
    const template = this.selectedTemplate;
    if (!template) return;
    const dialogRef = this.dialog.open(TripFormComponent, DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'create';
    instance.showDate = false;
    instance.save.subscribe((t: NewTrip) => this.closeOnSave(dialogRef, this.dataStore.addTripToTemplate(template, t)));
  }

  removeTrip(trip: Trip) {
    const template = this.selectedTemplate;
    if (!template) return Promise.resolve();
    return this.dataStore.removeTripFromTemplate(template, trip);
  }

  removeDriverFromTrip({trip, driverKey}: {trip: Trip; driverKey: string}) {
    const name = this.driverList().find(d => d.$key === driverKey)?.displayName ?? 'chaufføren';
    // Also prunes the removed driver's own vehicleAssignments entry (if any) in the same update,
    // so removing a driver can never leave a dangling pairing behind.
    const {[driverKey]: _removed, ...vehicleAssignments} = trip.vehicleAssignments ?? {};
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen i skabelonen?`, trip,
      {drivers: trip.drivers.filter(k => k !== driverKey), vehicleAssignments});
  }

  removeVehicleFromTrip({trip, vehicleKey}: {trip: Trip; vehicleKey: string}) {
    const name = this.vehicleList().find(v => v.$key === vehicleKey)?.displayName ?? 'køretøjet';
    // Also prunes any driver(s) paired with the removed vehicle, so removing a vehicle can never
    // leave a dangling pairing behind.
    const vehicleAssignments = Object.fromEntries(Object.entries(trip.vehicleAssignments ?? {}).filter(([, v]) => v !== vehicleKey));
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen i skabelonen?`, trip,
      {vehicles: trip.vehicles.filter(k => k !== vehicleKey), vehicleAssignments});
  }

  // Mirrors TripEditingService.confirmRemoval, and for the same reason: the chip's remove button
  // sits directly on the row-click-to-edit target, so on a phone it's easy to hit by mistake.
  // Persists through updateTripFromTemplate rather than updateTrip — a template trip lives under
  // /tripsInTemplate, which is a different node with its own write path.
  private confirmRemoval(message: string, trip: Trip, updates: Partial<NewTrip>): void {
    const template = this.selectedTemplate;
    if (!template) return;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {message, confirmLabel: 'Fjern', danger: true} as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.run(this.dataStore.updateTripFromTemplate(template, trip, updates));
      }
    });
  }

  // Shared by create()/edit()'s save/remove subscriptions. A rejected write leaves the dialog
  // open with a snackbar rather than silently discarding the edit; an unacknowledged one (the
  // offline case, where the RTDB promise never settles) closes it and says so instead of
  // freezing. See WriteFeedbackService.
  private closeOnSave(dialogRef: MatDialogRef<TripFormComponent>, saved: PromiseLike<unknown>): void {
    const instance = dialogRef.componentInstance;
    instance?.saving.set(true);
    this.writeFeedback.run(saved).then(outcome => {
      instance?.saving.set(false);
      if (outcome !== 'failed') dialogRef.close();
    });
  }

  edit(trip: Trip) {
    const template = this.selectedTemplate;
    if (!template) return;
    const dialogRef = this.dialog.open(TripFormComponent, DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'edit';
    instance.showDate = false;
    instance.trip = trip;
    instance.save.subscribe((updates: NewTrip) => this.closeOnSave(dialogRef, this.dataStore.updateTripFromTemplate(template, trip, updates)));
    instance.remove.subscribe(() => this.closeOnSave(dialogRef, this.removeTrip(trip)));
  }


  set selectedTemplate(template: Template) {
    this._selectedTemplate = template;
    this.trips$ = this.dataStore.getTemplateTrips(template);
  }

  get selectedTemplate(): Template | null {
    return this._selectedTemplate;
  }

}

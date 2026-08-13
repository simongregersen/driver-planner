import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatListModule} from '@angular/material/list';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Template} from '../template';
import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {NewTrip, Trip} from '../trip';
import {TripFormComponent} from '../trip-form/trip-form.component';
import {TripsComponent} from '../trips/trips.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';

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
  private readonly pageHeader = inject(PageHeaderService);

  templates$!: Observable<Template[]>;
  trips$!: Observable<Trip[]>;
  private _selectedTemplate!: Template;

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
    this.dataStore.addTemplate(val.name);
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
      if (confirmed) this.dataStore.removeTemplate(template);
    });
  }

  create() {
    if (!this.selectedTemplate) return;
    const instance = this.dialog.open(TripFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'create';
    instance.showDate = false;
    instance.save.subscribe((t: NewTrip) => this.dataStore.addTripToTemplate(this.selectedTemplate, t));
  }

  removeTrip(trip: Trip) {
    this.dataStore.removeTripFromTemplate(this.selectedTemplate, trip);
  }

  edit(trip: Trip) {
    const instance = this.dialog.open(TripFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.showDate = false;
    instance.trip = trip;
    instance.save.subscribe((updates: NewTrip) => this.dataStore.updateTripFromTemplate(this.selectedTemplate, trip, updates));
    instance.remove.subscribe(() => this.removeTrip(trip));
  }


  set selectedTemplate(template: Template) {
    this._selectedTemplate = template;
    this.trips$ = this.dataStore.getTemplateTrips(template);
  }

  get selectedTemplate(): Template {
    return this._selectedTemplate;
  }

}

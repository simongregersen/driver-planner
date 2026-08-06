import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgbModal, NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {DataStore} from '../data.service';
import {Template} from '../template';
import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {NewTrip, Trip} from '../trip';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {TripCreatorComponent} from '../trip-creator/trip-creator.component';
import {TripsComponent} from '../trips/trips.component';

@Component({
  standalone: true,
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.css'],
  imports: [ReactiveFormsModule, AsyncPipe, ConfirmationPopoverModule, NgbTooltip, TripsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplatesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dataStore = inject(DataStore);
  private readonly modalService = inject(NgbModal);

  templates$!: Observable<Template[]>;
  trips$!: Observable<Trip[]>;
  private _selectedTemplate!: Template;

  templateForm: FormGroup = this.fb.group({
    name: ['', Validators.required]
  });

  ngOnInit(): void {
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
    this.dataStore.removeTemplate(template);
  }

  create() {
    if (!this.selectedTemplate) return;
    const modalRef = this.modalService.open(TripCreatorComponent, {size: 'lg'});
    modalRef.componentInstance.showDate = false;
    modalRef.componentInstance.create.subscribe((t: NewTrip) => this.dataStore.addTripToTemplate(this.selectedTemplate, t));
  }

  removeTrip(trip: Trip) {
    this.dataStore.removeTripFromTemplate(this.selectedTemplate, trip);
  }

  edit(trip: Trip) {
    const modalRef = this.modalService.open(TripEditorComponent, {size: 'lg'});
    modalRef.componentInstance.showDate = false;
    modalRef.componentInstance.edit(trip, (t: Trip, u: any) => this.dataStore.updateTripFromTemplate(this.selectedTemplate, t, u));
  }


  set selectedTemplate(template: Template) {
    this._selectedTemplate = template;
    this.trips$ = this.dataStore.getTemplateTrips(template);
  }

  get selectedTemplate(): Template {
    return this._selectedTemplate;
  }

}

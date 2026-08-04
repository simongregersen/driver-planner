import {Component, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {DataStore} from '../data.service';
import {Template} from '../template';
import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {NewTrip, Trip} from '../trip';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {TripCreatorComponent} from '../trip-creator/trip-creator.component';

@Component({
  standalone: false,
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.css']
})
export class TemplatesComponent implements OnInit {
  templateForm: FormGroup;
  templates$!: Observable<Template[]>;
  trips$!: Observable<Trip[]>;
  private _selectedTemplate!: Template;

  constructor(private fb: FormBuilder, private dataStore: DataStore, private modalService: NgbModal) {
    this.templateForm = this.fb.group({
      name: ['', Validators.required]
    })
  }

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

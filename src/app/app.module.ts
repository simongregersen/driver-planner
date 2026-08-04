import {BrowserModule} from '@angular/platform-browser';
import {LOCALE_ID, NgModule} from '@angular/core';
import {registerLocaleData} from '@angular/common';
import localeDa from '@angular/common/locales/da';

import {AppComponent} from './app.component';
import {DataStore} from './data.service';
import {NgbModule} from '@ng-bootstrap/ng-bootstrap';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {TripsComponent} from './trips/trips.component';
import {SignInComponent} from './sign-in/sign-in.component';
import {AppRoutingModule} from './app-routing/app-routing.module';
import {DayPlansComponent} from './day-plans/day-plans.component';
import {AuthenticationService} from './authentication.service';
import {OverviewComponent} from './overview/overview.component';
import {TemplatesComponent} from './templates/templates.component';
import {RoutesComponent} from './routes/routes.component';
import {DriversComponent} from './drivers/drivers.component';
import {VehiclesComponent} from './vehicles/vehicles.component';
import {TripCreatorComponent} from './trip-creator/trip-creator.component';
import {NgSelectModule} from '@ng-select/ng-select';
import {PeriodPlansComponent} from './period-plans/period-plans.component';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {TripEditorComponent} from './trip-editor/trip-editor.component';
import {NgbUtility} from './ngb-date-utility';

registerLocaleData(localeDa);

@NgModule({
  declarations: [
    AppComponent,
    TripsComponent,
    SignInComponent,
    DayPlansComponent,
    OverviewComponent,
    TemplatesComponent,
    RoutesComponent,
    DriversComponent,
    VehiclesComponent,
    TripCreatorComponent,
    PeriodPlansComponent,
    TripEditorComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
    NgbModule,
    NgSelectModule,
    ConfirmationPopoverModule.forRoot()
  ],
  providers: [
    {provide: LOCALE_ID, useValue: 'da-DK'},
    AuthenticationService,
    DataStore,
    NgbUtility
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}

import {inject} from '@angular/core';
import {Routes} from '@angular/router';
import {map, take} from 'rxjs/operators';
import {authGuard} from './auth-guard';
import {adminGuard} from './admin-guard';
import {UserService} from './user.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./sign-in/sign-in.component').then(m => m.SignInComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => inject(UserService).driverProfile$.pipe(take(1), map(driver => driver ? '/my-trips' : '/day-plans')),
      },
      {
        path: 'my-trips',
        loadComponent: () => import('./my-trips/my-trips.component').then(m => m.MyTripsComponent),
      },
      {
        path: 'time-report',
        loadComponent: () => import('./time-report/time-report.component').then(m => m.TimeReportComponent),
      },
      {
        path: '',
        canActivate: [adminGuard],
        children: [
          {path: 'overview', loadComponent: () => import('./overview/overview.component').then(m => m.OverviewComponent)},
          {path: 'day-plans', loadComponent: () => import('./day-plans/day-plans.component').then(m => m.DayPlansComponent)},
          {path: 'period-plans', loadComponent: () => import('./period-plans/period-plans.component').then(m => m.PeriodPlansComponent)},
          {path: 'templates', loadComponent: () => import('./templates/templates.component').then(m => m.TemplatesComponent)},
          {path: 'routes', loadComponent: () => import('./routes/routes.component').then(m => m.RoutesComponent)},
          {path: 'drivers', loadComponent: () => import('./drivers/drivers.component').then(m => m.DriversComponent)},
          {path: 'vehicles', loadComponent: () => import('./vehicles/vehicles.component').then(m => m.VehiclesComponent)},
        ],
      },
    ],
  },
];

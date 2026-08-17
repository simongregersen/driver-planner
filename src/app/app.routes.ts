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
        path: 'time-tracking',
        loadComponent: () => import('./time-tracking/time-tracking.component').then(m => m.TimeTrackingComponent),
      },
      {
        path: 'time-report',
        loadComponent: () => import('./time-report/time-report.component').then(m => m.TimeReportComponent),
      },
      {
        path: 'fuel-tracking',
        loadComponent: () => import('./fuel-tracking/fuel-tracking.component').then(m => m.FuelTrackingComponent),
      },
      {
        path: '',
        canActivate: [adminGuard],
        children: [
          {path: 'overview', loadComponent: () => import('./overview/overview.component').then(m => m.OverviewComponent), data: {adminOnly: true}},
          {path: 'day-plans', loadComponent: () => import('./day-plans/day-plans.component').then(m => m.DayPlansComponent), data: {adminOnly: true}},
          {path: 'period-plans', loadComponent: () => import('./period-plans/period-plans.component').then(m => m.PeriodPlansComponent), data: {adminOnly: true}},
          {path: 'templates', loadComponent: () => import('./templates/templates.component').then(m => m.TemplatesComponent), data: {adminOnly: true}},
          {path: 'routes', loadComponent: () => import('./routes/routes.component').then(m => m.RoutesComponent), data: {adminOnly: true}},
          {path: 'drivers', loadComponent: () => import('./drivers/drivers.component').then(m => m.DriversComponent), data: {adminOnly: true}},
          {path: 'vehicles', loadComponent: () => import('./vehicles/vehicles.component').then(m => m.VehiclesComponent), data: {adminOnly: true}},
          // Deliberately not linked from any nav (desktop tabs, mobile bottom-nav, "Mere" sheet) —
          // reachable only by navigating to /cleanup directly. Still gated by authGuard/adminGuard
          // like every other admin page here; "hidden" isn't a substitute for real access control.
          {path: 'cleanup', loadComponent: () => import('./cleanup/cleanup.component').then(m => m.CleanupComponent), data: {adminOnly: true}},
        ],
      },
    ],
  },
];

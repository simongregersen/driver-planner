import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxChange, MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {Driver} from '../driver';
import {AppUser} from '../user';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DriverFormComponent} from '../driver-form/driver-form.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';
import {WriteFeedbackService} from '../write-feedback.service';

@Component({
  standalone: true,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriversComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly writeFeedback = inject(WriteFeedbackService);
  private readonly dialog = inject(MatDialog);
  private readonly pageHeader = inject(PageHeaderService);

  drivers!: Observable<Driver[]>;
  users$!: Observable<Record<string, AppUser>>;

  ngOnInit() {
    this.pageHeader.set('Chauffører');
    // getAllDrivers no longer filters (it must still resolve names for already-assigned
    // drivers elsewhere), so this list — the one place a driver is deleted from — filters itself.
    this.drivers = this.dataStore.getAllDrivers().pipe(map(Utility.filterDeleted));
    this.users$ = this.dataStore.getAllUsers();
  }

  isDriverAdmin(driver: Driver, users: Record<string, AppUser>): boolean {
    return !!driver.uid && users[driver.uid]?.role === 'admin';
  }

  create() {
    this.dialog.open(DriverFormComponent, DIALOG_CONFIG).componentInstance.mode = 'create';
  }

  removeDriver(driver: Driver) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette chaufføren\n'${driver.displayName}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.run(this.dataStore.deleteDriver(driver), {
          failureMessage: 'Kunne ikke slette chaufføren. Prøv igen.',
        });
      }
    });
  }

  // Same one-way-[checked] hazard as Day Plans' publish toggle: on a rejected write the bound
  // value never changes, so nothing pushes the checkbox back and it keeps claiming a privilege
  // level that was never stored. Reset it from $event.source on failure.
  setDriverAdmin(driver: Driver, event: MatCheckboxChange) {
    if (!driver.uid) return;
    void this.writeFeedback
      .run(this.dataStore.setUserAdmin(driver.uid, event.checked), {
        failureMessage: 'Kunne ikke ændre administratorrettigheder. Prøv igen.',
      })
      .then(outcome => {
        if (outcome === 'failed') event.source.checked = !event.checked;
      });
  }

  edit(driver: Driver) {
    const instance = this.dialog.open(DriverFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.driver = driver;
  }

  createLogin(driver: Driver) {
    const dialogRef = this.dialog.open(DriverLoginCreatorComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.driver = driver;
  }

}

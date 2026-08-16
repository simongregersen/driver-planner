import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Driver} from '../driver';
import {UserService} from '../user.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';

@Component({
  standalone: true,
  selector: 'app-driver-login-creator',
  templateUrl: './driver-login-creator.component.html',
  styleUrls: ['./driver-login-creator.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverLoginCreatorComponent {
  driver!: Driver;
  error = signal<string | null>(null);
  saving = signal(false);

  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  readonly dialogRef = inject(MatDialogRef<DriverLoginCreatorComponent>);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });


  // Escape / backdrop click ask before discarding typed-in input, rather than
  // destroying it silently. Pristine forms still close instantly. See
  // guardDialogDismissal and DIALOG_CONFIG's disableClose.
  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.loginForm?.dirty ?? false);
  }

  onSubmit() {
    const val = this.loginForm.value;
    this.error.set(null);
    this.saving.set(true);
    this.userService.createDriverLogin(val.email, val.password, this.driver.$key)
      .then(() => this.dialogRef.close())
      .catch(err => {
        this.error.set(DriverLoginCreatorComponent.mapError(err?.code));
        this.saving.set(false);
      });
  }

  private static mapError(code: string): string {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'E-mailen er allerede i brug.';
      case 'auth/weak-password':
        return 'Kodeordet er for kort.';
      case 'auth/invalid-email':
        return 'E-mailen er ugyldig.';
      default:
        return 'Der skete en fejl. Prøv igen.';
    }
  }
}

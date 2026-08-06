import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {Driver} from '../driver';
import {UserService} from '../user.service';

@Component({
  standalone: true,
  selector: 'app-driver-login-creator',
  templateUrl: './driver-login-creator.component.html',
  styleUrls: ['./driver-login-creator.component.css'],
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverLoginCreatorComponent {
  driver!: Driver;
  error = signal<string | null>(null);
  saving = signal(false);

  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  readonly modal = inject(NgbActiveModal);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  onSubmit() {
    const val = this.loginForm.value;
    this.error.set(null);
    this.saving.set(true);
    this.userService.createDriverLogin(val.email, val.password, this.driver.$key)
      .then(() => this.modal.close())
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

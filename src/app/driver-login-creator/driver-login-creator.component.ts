import {Component, NgZone} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {Driver} from '../driver';
import {UserService} from '../user.service';

@Component({
  standalone: false,
  selector: 'app-driver-login-creator',
  templateUrl: './driver-login-creator.component.html',
  styleUrls: ['./driver-login-creator.component.css']
})
export class DriverLoginCreatorComponent {
  driver!: Driver;
  loginForm: FormGroup;
  error: string | null = null;
  saving = false;

  constructor(private fb: FormBuilder, private userService: UserService, private ngZone: NgZone,
              public modal: NgbActiveModal) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    const val = this.loginForm.value;
    this.error = null;
    this.saving = true;
    this.userService.createDriverLogin(val.email, val.password, this.driver.$key)
      .then(() => this.ngZone.run(() => this.modal.close()))
      .catch(err => this.ngZone.run(() => {
        this.error = DriverLoginCreatorComponent.mapError(err?.code);
        this.saving = false;
      }));
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

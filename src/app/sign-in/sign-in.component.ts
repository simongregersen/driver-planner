import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AuthenticationService} from '../authentication.service';
import {Router} from '@angular/router';
import {BrandIconComponent} from '../brand-icon/brand-icon.component';

@Component({
  standalone: true,
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css'],
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, BrandIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  private readonly authService = inject(AuthenticationService);
  private readonly router = inject(Router);

  error = signal<string | null>(null);

  login(email: string, password: string) {
    this.error.set(null);
    this.authService.login(email, password)
      .then(() => this.router.navigate(['']))
      .catch(err => this.error.set(SignInComponent.mapError(err?.code)));
  }

  private static mapError(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Forkert e-mail eller kodeord.';
      case 'auth/invalid-email':
        return 'E-mailen er ugyldig.';
      case 'auth/too-many-requests':
        return 'For mange forsøg. Prøv igen senere.';
      default:
        return 'Der skete en fejl. Prøv igen.';
    }
  }

}

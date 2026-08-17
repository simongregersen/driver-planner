import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {AuthenticationService} from '../authentication.service';
import {Router} from '@angular/router';
import {BrandIconComponent} from '../brand-icon/brand-icon.component';
import {InstallPromptService} from '../install-prompt.service';

@Component({
  standalone: true,
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css'],
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, BrandIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
  private readonly authService = inject(AuthenticationService);
  private readonly router = inject(Router);
  readonly installPrompt = inject(InstallPromptService);

  error = signal<string | null>(null);
  /** Gates the submit button so a slow network can't turn an impatient second tap into a second
   * sign-in attempt — which Firebase counts toward its own rate limit (auth/too-many-requests). */
  readonly signingIn = signal(false);

  login(email: string, password: string) {
    if (this.signingIn()) return;
    this.error.set(null);
    this.signingIn.set(true);
    this.authService.login(email, password)
      .then(() => this.router.navigate(['']))
      .catch(err => this.error.set(SignInComponent.mapError(err?.code)))
      .finally(() => this.signingIn.set(false));
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

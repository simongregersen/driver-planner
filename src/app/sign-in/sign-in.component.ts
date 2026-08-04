import {Component} from '@angular/core';
import {AuthenticationService} from '../authentication.service';
import {Router} from '@angular/router';

@Component({
  standalone: false,
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {

  constructor(private authService: AuthenticationService, private router: Router) {
  }

  login(email: string, password: string) {
    this.authService.login(email, password)
      .then(() => this.router.navigate(['']))
      .catch(err => console.log(err));
  }

}

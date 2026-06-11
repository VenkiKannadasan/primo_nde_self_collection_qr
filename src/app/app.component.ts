import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'primo-nde-self-collection-qr';
  public getTitle(){
    return this.title;
  }
}

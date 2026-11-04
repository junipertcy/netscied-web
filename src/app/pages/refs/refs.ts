import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-refs',
  imports: [RouterLink],
  templateUrl: './refs.html',
  host: { class: 'page' },
})
export class Refs {}

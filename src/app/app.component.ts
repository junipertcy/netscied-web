import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  title = 'app';
  downloadEnglishVersion() {
    window.location.href = 'https://sites.google.com/a/binghamton.edu/netscied/Network-Literacy-high-res.pdf';
  }
  downloadChineseVersion() {
    window.location.href = 'http://wiki.junipertcy.info/images/c/ce/Network_Literacy_tw_Mandarin.pdf';
  }
  gotoJinMa() {
    window.location.href = 'https://jinma.today/relations';
  }
}

export class NzDemoFormInlineComponent implements OnInit {
  validateForm: FormGroup;

  _submitForm() {
    for (const i in this.validateForm.controls) {
      this.validateForm.controls[ i ].markAsDirty();
    }
  }

  constructor(private fb: FormBuilder) {
  }

  ngOnInit() {
    this.validateForm = this.fb.group({
      userName: [ null, [ Validators.required ] ],
      password: [ null, [ Validators.required ] ]
    });
  }
}

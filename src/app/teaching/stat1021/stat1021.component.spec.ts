import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { Stat1021Component } from './stat1021.component';

describe('Stat1021Component', () => {
  let component: Stat1021Component;
  let fixture: ComponentFixture<Stat1021Component>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ Stat1021Component ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(Stat1021Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});

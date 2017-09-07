import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NetworkLiteracyComponent } from './network-literacy.component';

describe('NetworkLiteracyComponent', () => {
  let component: NetworkLiteracyComponent;
  let fixture: ComponentFixture<NetworkLiteracyComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NetworkLiteracyComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NetworkLiteracyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});

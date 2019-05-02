import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { IntroToSbmComponent } from './intro-to-sbm.component';

describe('IntroToSbmComponent', () => {
  let component: IntroToSbmComponent;
  let fixture: ComponentFixture<IntroToSbmComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ IntroToSbmComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(IntroToSbmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

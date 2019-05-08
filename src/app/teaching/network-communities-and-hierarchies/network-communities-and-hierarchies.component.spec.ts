import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NetworkCommunitiesAndHierarchiesComponent } from './network-communities-and-hierarchies.component';

describe('NetworkCommunitiesAndHierarchiesComponent', () => {
  let component: NetworkCommunitiesAndHierarchiesComponent;
  let fixture: ComponentFixture<NetworkCommunitiesAndHierarchiesComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NetworkCommunitiesAndHierarchiesComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NetworkCommunitiesAndHierarchiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

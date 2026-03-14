import { Injectable } from '@angular/core';
import { type CanDeactivate } from '@angular/router';

import { type ProjectComponent } from '../pages/project/project.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateProjectGuard implements CanDeactivate<ProjectComponent> {
  canDeactivate(component: ProjectComponent): Promise<boolean> {
    return component.canDeactivate();
  }
}

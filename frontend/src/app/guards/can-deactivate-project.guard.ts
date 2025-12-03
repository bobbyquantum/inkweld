import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';

import { ProjectComponent } from '../pages/project/project.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateProjectGuard implements CanDeactivate<ProjectComponent> {
  canDeactivate(component: ProjectComponent): Promise<boolean> {
    return component.canDeactivate();
  }
}

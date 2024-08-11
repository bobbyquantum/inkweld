import { Component } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { ProjectSelectorComponent } from "../project-selector/project-selector.component";
import { UserMenuComponent } from "../user-menu/user-menu.component";
import { Editor, NgxEditorModule } from 'ngx-editor';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [
    MatSidenavModule,
    ProjectSelectorComponent,
    UserMenuComponent,
    NgxEditorModule
],
  templateUrl: './project.component.html',
  styleUrl: './project.component.scss'
})
export class ProjectComponent {

  editor!: Editor;

  ngOnInit(): void {
    this.editor = new Editor({});
    this.editor.setContent("content");
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }
}

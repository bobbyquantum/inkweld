import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { UserMenuComponent } from '../user-menu/user-menu.component';

interface MenuItem {
  label: string;
  items: string[];
}

@Component({
  selector: 'app-project-main-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatButtonModule, UserMenuComponent],
  templateUrl: './project-main-menu.component.html',
  styleUrl: './project-main-menu.component.scss',
})
export class ProjectMainMenuComponent {
  menuItems: MenuItem[] = [
    {
      label: 'File',
      items: ['New', 'Open', 'Save', 'Save As', 'Close'],
    },
    {
      label: 'Edit',
      items: ['Undo', 'Redo', 'Cut', 'Copy', 'Paste'],
    },
    {
      label: 'View',
      items: ['Zoom In', 'Zoom Out', 'Reset Zoom'],
    },
    {
      label: 'Help',
      items: ['Documentation', 'About'],
    },
  ];

  onMenuItemClick(item: string): void {
    console.log(`Clicked: ${item}`);
    // Implement the actual functionality for each menu item here
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor, NgxEditorModule } from 'ngx-editor';

@Component({
  selector: 'app-element-editor',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, NgxEditorModule],
  templateUrl: './element-editor.component.html',
  styleUrl: './element-editor.component.scss',
})
export class ElementEditorComponent implements OnInit, OnDestroy {
  editor!: Editor;
  zoomLevel = 100;

  ngOnInit(): void {
    this.editor = new Editor({
      plugins: [],
    });
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }

  increaseZoom() {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.updateZoom();
    }
  }

  decreaseZoom() {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.updateZoom();
    }
  }

  private updateZoom() {
    document.documentElement.style.setProperty(
      '--editor-zoom',
      (this.zoomLevel / 100).toString()
    );
  }
}

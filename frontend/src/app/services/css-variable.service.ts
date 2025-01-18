import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CssVariableService {
  private documentElement: HTMLElement;

  constructor() {
    this.documentElement = document.documentElement;
  }

  setVariable(name: string, value: string): void {
    this.documentElement.style.setProperty(name, value);
  }

  removeVariable(name: string): void {
    this.documentElement.style.removeProperty(name);
  }

  setPageDimensions(dimensions: {
    pageWidth: string;
    leftMargin: string;
    rightMargin: string;
  }): void {
    this.setVariable('--page-width', dimensions.pageWidth);
    this.setVariable('--margin-left', dimensions.leftMargin);
    this.setVariable('--margin-right', dimensions.rightMargin);
    this.removeVariable('--editor-max-width');
  }

  setFitWidthMode(): void {
    this.removeVariable('--page-width');
    this.removeVariable('--margin-left');
    this.removeVariable('--margin-right');
    this.setVariable('--editor-max-width', '100%');
  }

  setZoomLevel(zoom: number): void {
    this.setVariable('--editor-zoom', (zoom / 100).toString());
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type LangDefinition, TranslocoModule } from '@jsverse/transloco';
import { LocaleService } from '@services/core/locale.service';
import { type ThemeOption, ThemeService } from '@themes/theme.service';
import { type Subscription } from 'rxjs';

@Component({
  selector: 'app-general-settings',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    FormsModule,
    TranslocoModule,
  ],
  templateUrl: './general-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './general-settings.component.scss',
})
export class GeneralSettingsComponent implements OnInit, OnDestroy {
  private readonly themeService = inject(ThemeService);
  private readonly localeService = inject(LocaleService);

  selectedTheme!: ThemeOption;
  selectedLang = 'en';
  readonly availableLangs: LangDefinition[] =
    this.localeService.availableLangs.map(lang =>
      typeof lang === 'string' ? { id: lang, label: lang } : lang
    );
  readonly isMultiLang = this.availableLangs.length > 1;

  private themeSubscription!: Subscription;

  ngOnInit() {
    this.themeSubscription = this.themeService
      .getCurrentTheme()
      .subscribe(theme => {
        this.selectedTheme = theme;
      });
    this.selectedLang = this.localeService.currentLang;
  }

  ngOnDestroy() {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onThemeChange() {
    this.themeService.update(this.selectedTheme);
  }

  onLangChange() {
    this.localeService.setLang(this.selectedLang);
  }
}

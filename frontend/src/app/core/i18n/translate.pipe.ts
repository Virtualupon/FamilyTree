import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { I18nService } from './i18n.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  private readonly translateService = inject(TranslateService);
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    // Try ngx-translate first (JSON files), fall back to inline translations
    const translated = this.translateService.instant(key, params);
    if (translated !== key) {
      return translated;
    }
    // Fall back to inline translations for keys not in JSON
    return this.i18n.t(key, params);
  }
}

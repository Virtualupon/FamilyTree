import { Pipe, PipeTransform, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { I18nService } from './i18n.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private readonly translateService = inject(TranslateService);
  private readonly i18n = inject(I18nService);
  private readonly cdr = inject(ChangeDetectorRef);

  private onLangChangeSub: Subscription | undefined;
  private onDefaultLangChangeSub: Subscription | undefined;

  constructor() {
    // Subscribe to language changes to trigger re-render
    this.onLangChangeSub = this.translateService.onLangChange.subscribe(() => {
      this.cdr.markForCheck();
    });

    this.onDefaultLangChangeSub = this.translateService.onDefaultLangChange.subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  transform(key: string, params?: Record<string, string | number>): string {
    // Try ngx-translate first (JSON files), fall back to inline translations
    const translated = this.translateService.instant(key, params);
    if (translated !== key) {
      return translated;
    }
    // Fall back to inline translations for keys not in JSON
    return this.i18n.t(key, params);
  }

  ngOnDestroy(): void {
    this.onLangChangeSub?.unsubscribe();
    this.onDefaultLangChangeSub?.unsubscribe();
  }
}

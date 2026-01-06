import { Pipe, PipeTransform, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false // Impure pipe to handle async updates
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private readonly translateService = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  private lastKey: string | null = null;
  private lastParams: Record<string, string | number> | undefined;
  private value: string = '';
  private onLangChangeSub: Subscription | undefined;
  private onDefaultLangChangeSub: Subscription | undefined;
  private onTranslationChangeSub: Subscription | undefined;

  constructor() {
    // Subscribe to language changes
    this.onLangChangeSub = this.translateService.onLangChange.subscribe((event: LangChangeEvent) => {
      if (this.lastKey) {
        this.updateValue(this.lastKey, this.lastParams);
      }
    });

    this.onDefaultLangChangeSub = this.translateService.onDefaultLangChange.subscribe(() => {
      if (this.lastKey) {
        this.updateValue(this.lastKey, this.lastParams);
      }
    });

    this.onTranslationChangeSub = this.translateService.onTranslationChange.subscribe(() => {
      if (this.lastKey) {
        this.updateValue(this.lastKey, this.lastParams);
      }
    });
  }

  transform(key: string, params?: Record<string, string | number>): string {
    if (!key) {
      return '';
    }

    // Only update if key or params changed
    if (key !== this.lastKey || !this.equals(params, this.lastParams)) {
      this.lastKey = key;
      this.lastParams = params;
      this.updateValue(key, params);
    }

    return this.value;
  }

  private updateValue(key: string, params?: Record<string, string | number>): void {
    // Get the translation - this handles both sync (cached) and triggers async load
    this.translateService.get(key, params).subscribe({
      next: (result: string) => {
        this.value = result;
        this.cdr.markForCheck();
      },
      error: () => {
        this.value = key; // Fallback to key on error
        this.cdr.markForCheck();
      }
    });
  }

  private equals(a: Record<string, string | number> | undefined, b: Record<string, string | number> | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => a[key] === b[key]);
  }

  ngOnDestroy(): void {
    this.onLangChangeSub?.unsubscribe();
    this.onDefaultLangChangeSub?.unsubscribe();
    this.onTranslationChangeSub?.unsubscribe();
  }
}
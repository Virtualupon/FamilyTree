import { FamilyRelationshipTypeService } from '../services/family-relationship-type.service';
import { I18nService } from '../i18n';

/**
 * Get relationship display name with multi-level fallback:
 * 1. Try DB type ID (new system)
 * 2. Try i18n key (legacy system)
 * 3. Return "Unknown" (never empty)
 *
 * @param typeId - The database relationship type ID (may be null/undefined)
 * @param i18nKey - The legacy i18n key (may be null/undefined)
 * @param familyRelTypeService - The family relationship type service
 * @param i18nService - The i18n service
 * @returns The localized relationship name, or "Unknown" if not found
 */
export function getRelationshipDisplayName(
  typeId: number | null | undefined,
  i18nKey: string | null | undefined,
  familyRelTypeService: FamilyRelationshipTypeService,
  i18nService: I18nService
): string {
  // Level 1: Try DB type ID (preferred - new system)
  if (typeId != null && typeId > 0) {
    const name = familyRelTypeService.getLocalizedNameById(typeId);
    if (name && name !== 'Unknown' && name !== i18nService.t('common.unknown')) {
      return name;
    }
  }

  // Level 2: Try i18n key (legacy system)
  if (i18nKey) {
    const translated = i18nService.t(i18nKey);
    // Check if translation was successful (not returning the key itself)
    if (translated && translated !== i18nKey) {
      return translated;
    }

    // Level 2b: Try to find type by i18n key pattern in DB
    const type = familyRelTypeService.getTypeByI18nKey(i18nKey);
    if (type) {
      return familyRelTypeService.getLocalizedName(type);
    }
  }

  // Level 3: Return "Unknown" - NEVER empty
  return i18nService.t('common.unknown') || 'Unknown';
}

/**
 * Check if a relationship has valid display information.
 * Returns true if either typeId or i18nKey can produce a valid label.
 *
 * @param typeId - The database relationship type ID
 * @param i18nKey - The legacy i18n key
 * @param familyRelTypeService - The family relationship type service
 * @param i18nService - The i18n service
 * @returns True if a valid label can be displayed
 */
export function hasValidRelationshipInfo(
  typeId: number | null | undefined,
  i18nKey: string | null | undefined,
  familyRelTypeService: FamilyRelationshipTypeService,
  i18nService: I18nService
): boolean {
  // Check type ID
  if (typeId != null && typeId > 0) {
    const name = familyRelTypeService.getLocalizedNameById(typeId);
    if (name && name !== 'Unknown' && name !== i18nService.t('common.unknown')) {
      return true;
    }
  }

  // Check i18n key
  if (i18nKey && i18nKey.length > 0 && i18nKey !== 'relationship.') {
    const translated = i18nService.t(i18nKey);
    if (translated && translated !== i18nKey) {
      return true;
    }

    // Check if type exists in DB by key
    const type = familyRelTypeService.getTypeByI18nKey(i18nKey);
    if (type) {
      return true;
    }
  }

  return false;
}

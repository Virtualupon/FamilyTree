export interface TownImageDto {
  id: string;
  townId: string;
  townName: string;
  imageUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize: number;
  townNameNb?: string;  // Nobiin (Nubian)
  townNameAr?: string;  // Arabic
  townNameEn?: string;  // English
  
  // Multilingual: Default + Nobiin + Arabic + English
  title?: string;
  titleNb?: string;  // Nobiin (Nubian)
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionNb?: string;  // Nobiin (Nubian)
  descriptionAr?: string;
  descriptionEn?: string;
  
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CarouselImageDto {
  id: string;
  townId: string;
  townName: string;
  townNameNb?: string;  // Nobiin (Nubian)
  townNameAr?: string;  // Arabic
  townNameEn?: string;  // English
  imageUrl: string;

  // Multilingual: Default + Nobiin + Arabic + English
  title?: string;
  titleNb?: string;  // Nobiin (Nubian)
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionNb?: string;  // Nobiin (Nubian)
  descriptionAr?: string;
  descriptionEn?: string;
}

/**
 * Request for uploading town image (Base64)
 * Same pattern as avatar upload
 */
export interface UploadTownImageRequest {
  townId: string;
  /** Base64 encoded image data (with or without data URL prefix) */
  base64Data: string;
  /** Original filename */
  fileName: string;
  /** MIME type (e.g., image/webp) */
  mimeType?: string;
  
  // Multilingual: Default + Nobiin + Arabic + English
  title?: string;
  titleNb?: string;  // Nobiin (Nubian)
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionNb?: string;  // Nobiin (Nubian)
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder?: number;
}

export interface UpdateTownImageRequest {
  // Multilingual: Default + Nobiin + Arabic + English
  title?: string;
  titleNb?: string;  // Nobiin (Nubian)
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionNb?: string;  // Nobiin (Nubian)
  descriptionAr?: string;
  descriptionEn?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface ReorderTownImagesRequest {
  images: { imageId: string; displayOrder: number }[];
}

export interface LandingPageImagesResponse {
  images: CarouselImageDto[];
  totalCount: number;
}

// Alias for backward compatibility with backend DTO naming
export type TownCarouselImageDto = CarouselImageDto;
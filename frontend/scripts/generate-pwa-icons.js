#!/usr/bin/env node

/**
 * PWA Icon Generator Script
 *
 * Generates all required icon sizes for PWA from a source image.
 *
 * Usage:
 *   node scripts/generate-pwa-icons.js path/to/source-image.png
 *
 * Requirements:
 *   npm install sharp
 *
 * The source image should be at least 512x512 pixels for best results.
 */

const fs = require('fs');
const path = require('path');

// Icon sizes required for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Output directory (relative to frontend folder)
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');

async function generateIcons(sourcePath) {
  // Check if sharp is installed
  let sharp;
  try {
    sharp = require('sharp');
  } catch (error) {
    console.error('Error: sharp package is not installed.');
    console.error('Please install it first:');
    console.error('  npm install sharp --save-dev');
    process.exit(1);
  }

  // Validate source file
  if (!sourcePath) {
    console.error('Usage: node generate-pwa-icons.js <source-image>');
    console.error('Example: node generate-pwa-icons.js logo.png');
    process.exit(1);
  }

  const absoluteSourcePath = path.resolve(sourcePath);

  if (!fs.existsSync(absoluteSourcePath)) {
    console.error(`Error: Source file not found: ${absoluteSourcePath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  console.log(`\nGenerating PWA icons from: ${absoluteSourcePath}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Get source image metadata
  const metadata = await sharp(absoluteSourcePath).metadata();
  console.log(`Source image: ${metadata.width}x${metadata.height} (${metadata.format})`);

  if (metadata.width < 512 || metadata.height < 512) {
    console.warn('\nWarning: Source image is smaller than 512x512.');
    console.warn('For best results, use an image at least 512x512 pixels.\n');
  }

  // Generate icons
  for (const size of ICON_SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

    try {
      await sharp(absoluteSourcePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 250, g: 247, b: 241, alpha: 1 } // Nubian warm white
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ Failed to generate icon-${size}x${size}.png:`, error.message);
    }
  }

  // Generate maskable icons (with padding for safe area)
  console.log('\nGenerating maskable icons...');

  for (const size of [192, 512]) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}-maskable.png`);
    const safeSize = Math.floor(size * 0.8); // 80% of the icon for safe area

    try {
      // Create a canvas with padding
      const paddedIcon = await sharp(absoluteSourcePath)
        .resize(safeSize, safeSize, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      // Create background and composite
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 24, g: 117, b: 115, alpha: 1 } // Nubian teal
        }
      })
        .composite([{
          input: paddedIcon,
          gravity: 'center'
        }])
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated: icon-${size}x${size}-maskable.png`);
    } catch (error) {
      console.error(`✗ Failed to generate maskable icon:`, error.message);
    }
  }

  console.log('\n✓ Icon generation complete!');
  console.log('\nNext steps:');
  console.log('1. Review generated icons in:', OUTPUT_DIR);
  console.log('2. Update manifest.webmanifest if using maskable icons');
  console.log('3. Build your app: npm run build');
}

// Run the script
const sourceImage = process.argv[2];
generateIcons(sourceImage).catch(error => {
  console.error('Error generating icons:', error);
  process.exit(1);
});

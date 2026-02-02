# Help Dialog System - Implementation Guide

This document provides a comprehensive guide for building a tabbed help dialog system in Angular applications. Based on the implementation from BoardPulsePro's PDF Form Creator.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [Component Implementation](#3-component-implementation)
4. [Template Structure](#4-template-structure)
5. [Styling Guide](#5-styling-guide)
6. [Content Patterns](#6-content-patterns)
7. [Integration Guide](#7-integration-guide)
8. [Dependencies](#8-dependencies)
9. [Customization Guide](#9-customization-guide)
10. [Best Practices](#10-best-practices)

---

## 1. Architecture Overview

### Design Pattern

The help system follows a **tabbed dialog pattern** with the following characteristics:

- **Modal Dialog**: Opens as a Material Dialog overlay
- **Tabbed Navigation**: Pill-style tab buttons for content switching
- **Conditional Rendering**: Uses `*ngIf` to show/hide tab content
- **Self-Contained**: All content, styling, and logic in one component

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Material Dialog | Provides accessibility, keyboard navigation, and backdrop |
| Tab-based navigation | Organizes large amounts of content into digestible sections |
| Inline SVG diagrams | Eliminates external image dependencies |
| SCSS with BEM-like structure | Maintainable, scoped styling |
| Auto-open on init | Ensures users see help on first visit |

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Parent         │     │  HelpDialog     │     │  MatDialog      │
│  Component      │────>│  Component      │────>│  Service        │
│                 │     │                 │     │                 │
│  openHelp()     │     │  tabs[]         │     │  overlay        │
│                 │     │  activeTab      │     │  backdrop       │
└─────────────────┘     │  setActiveTab() │     └─────────────────┘
                        │  close()        │
                        └─────────────────┘
```

---

## 2. File Structure

```
help-dialog/
├── help-dialog.component.ts      # Component class with tab logic
├── help-dialog.component.html    # Template with all help content
├── help-dialog.component.scss    # Comprehensive styling
└── README.md                     # Integration documentation
```

### File Purposes

| File | Lines (approx) | Purpose |
|------|----------------|---------|
| `.ts` | 35 | Tab definitions, navigation logic, dialog close |
| `.html` | 986 | All help content organized by tabs |
| `.scss` | 776 | Complete styling for all UI elements |
| `README.md` | 191 | Integration instructions |

---

## 3. Component Implementation

### TypeScript Component

```typescript
import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-help-dialog',
  templateUrl: './help-dialog.component.html',
  styleUrls: ['./help-dialog.component.scss']
})
export class HelpDialogComponent {
  // Default active tab
  activeTab = 'overview';

  // Tab definitions with id, label, and Material icon
  tabs = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'signature', label: 'Signature', icon: 'draw' },
    { id: 'initials', label: 'Initials', icon: 'mode_edit' },
    { id: 'fullname', label: 'Full Name', icon: 'person' },
    { id: 'date', label: 'Date', icon: 'calendar_month' },
    { id: 'checkbox', label: 'Checkbox', icon: 'check_box' },
    { id: 'radio', label: 'Radio Button', icon: 'radio_button_checked' },
    { id: 'textinput', label: 'Text Input', icon: 'text_fields' },
    { id: 'noneditable', label: 'Static Text', icon: 'article' },
    { id: 'image', label: 'Image', icon: 'image' },
    { id: 'tips', label: 'Tips', icon: 'lightbulb' }
  ];

  constructor(public dialogRef: MatDialogRef<HelpDialogComponent>) {}

  // Switch active tab
  setActiveTab(tabId: string): void {
    this.activeTab = tabId;
  }

  // Close the dialog
  close(): void {
    this.dialogRef.close();
  }
}
```

### Key Implementation Details

1. **Tab Array Structure**:
   - `id`: Unique identifier used for conditional rendering
   - `label`: Display text shown in tab button
   - `icon`: Material icon name for visual identification

2. **State Management**:
   - Single `activeTab` string controls which content is visible
   - Simple and efficient without complex state management

3. **Dialog Reference**:
   - `MatDialogRef` injected for programmatic close functionality

---

## 4. Template Structure

### Overall Layout

```html
<div class="help-dialog">
  <!-- Header with title and close button -->
  <div class="help-header">
    <div class="help-title">
      <mat-icon>help_outline</mat-icon>
      <h2>Your Help Guide Title</h2>
    </div>
    <button mat-icon-button (click)="close()">
      <mat-icon>close</mat-icon>
    </button>
  </div>

  <!-- Tab Navigation -->
  <div class="help-tabs">
    <button
      *ngFor="let tab of tabs"
      class="tab-btn"
      [class.active]="activeTab === tab.id"
      (click)="setActiveTab(tab.id)"
    >
      <mat-icon>{{ tab.icon }}</mat-icon>
      <span>{{ tab.label }}</span>
    </button>
  </div>

  <!-- Content Area -->
  <div class="help-content">
    <!-- Tab content sections -->
    <div *ngIf="activeTab === 'overview'" class="tab-content">
      <!-- Overview content -->
    </div>

    <div *ngIf="activeTab === 'feature1'" class="tab-content">
      <!-- Feature 1 content -->
    </div>

    <!-- Additional tabs... -->
  </div>

  <!-- Footer with primary action -->
  <div class="help-footer">
    <button mat-raised-button color="primary" (click)="close()">
      Got it, let's start!
    </button>
  </div>
</div>
```

### Content Section Patterns

#### Overview Tab Pattern

```html
<div *ngIf="activeTab === 'overview'" class="tab-content">
  <h3>Welcome Title</h3>
  <p>Introduction paragraph explaining the feature.</p>

  <div class="section">
    <h4>How to Get Started</h4>
    <div class="steps">
      <div class="step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Step Title</strong>
          <p>Step description with details.</p>
        </div>
      </div>
      <!-- More steps... -->
    </div>
  </div>

  <div class="section">
    <h4>Available Features</h4>
    <div class="field-types-grid">
      <div class="field-type-card">
        <mat-icon>icon_name</mat-icon>
        <span>Feature Name</span>
        <small>Brief description</small>
      </div>
      <!-- More cards... -->
    </div>
  </div>
</div>
```

#### Feature Tab Pattern

```html
<div *ngIf="activeTab === 'feature-name'" class="tab-content">
  <h3><mat-icon>feature_icon</mat-icon> Feature Title</h3>
  <p>Feature description explaining what it does.</p>

  <!-- Feature highlights box -->
  <div class="feature-box">
    <h4>Features</h4>
    <ul>
      <li>Feature point 1</li>
      <li>Feature point 2</li>
      <li>Feature point 3</li>
    </ul>
  </div>

  <!-- How-to instructions -->
  <div class="section">
    <h4>How to Use</h4>
    <div class="instruction-box">
      <div class="instruction">
        <div class="icon-box"><mat-icon>step_icon</mat-icon></div>
        <div>
          <strong>Step 1:</strong> Description of the step
        </div>
      </div>
      <!-- More instructions... -->
    </div>
  </div>

  <!-- Visual example -->
  <div class="example-box">
    <h4>Example</h4>
    <div class="example-visual">
      <!-- Before/After visualization -->
    </div>
  </div>

  <!-- Helpful tip -->
  <div class="tip-box">
    <mat-icon>tips_and_updates</mat-icon>
    <div>
      <strong>Tip:</strong> Helpful advice for using this feature.
    </div>
  </div>
</div>
```

#### Tips Tab Pattern

```html
<div *ngIf="activeTab === 'tips'" class="tab-content">
  <h3><mat-icon>lightbulb</mat-icon> Tips &amp; Best Practices</h3>

  <div class="tips-list">
    <div class="tip-card">
      <div class="tip-icon"><mat-icon>tip_icon</mat-icon></div>
      <div class="tip-content">
        <h4>Tip Title</h4>
        <p>Tip description with actionable advice.</p>
      </div>
    </div>
    <!-- More tip cards... -->
  </div>

  <!-- Quick Reference Table -->
  <div class="quick-reference">
    <h4>Quick Reference</h4>
    <table class="reference-table">
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
        <th>Column 3</th>
      </tr>
      <tr>
        <td>Data 1</td>
        <td>Data 2</td>
        <td>Data 3</td>
      </tr>
      <!-- More rows... -->
    </table>
  </div>
</div>
```

---

## 5. Styling Guide

### Core Container Styles

```scss
.help-dialog {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  width: 100%;
}
```

### Header Styling

```scss
.help-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  // Gradient background - customize colors as needed
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;

  .help-title {
    display: flex;
    align-items: center;
    gap: 12px;

    mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
  }

  button {
    color: white;
  }
}
```

### Tab Navigation Styling

```scss
.help-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    background: white;
    border-radius: 20px;  // Pill shape
    cursor: pointer;
    font-size: 13px;
    color: #666;
    transition: all 0.2s;

    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    &:hover {
      background: #e3f2fd;
      color: #1976d2;
    }

    &.active {
      background: #1976d2;
      color: white;
    }
  }
}
```

### Content Area Styling

```scss
.help-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;

  // Custom scrollbar
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  &::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 4px;

    &:hover {
      background: #999;
    }
  }
}

.tab-content {
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: 22px;
    color: #333;

    mat-icon {
      color: #1976d2;
    }
  }

  p {
    color: #555;
    line-height: 1.6;
    margin-bottom: 20px;
  }
}
```

### Content Box Styles

```scss
// Feature highlight box (blue)
.feature-box {
  background: #e3f2fd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;

  h4 {
    margin: 0 0 12px 0;
    color: #1565c0;
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 8px;
      color: #333;
    }
  }
}

// Tip box (yellow/amber)
.tip-box {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #fff8e1;
  border-radius: 8px;
  border-left: 4px solid #ffc107;
  margin-bottom: 20px;

  mat-icon {
    color: #f57c00;
    flex-shrink: 0;
  }

  strong {
    color: #e65100;
  }
}

// Note/Info box (blue)
.note-box {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #e3f2fd;
  border-radius: 8px;
  border-left: 4px solid #1976d2;
  margin-bottom: 20px;

  mat-icon {
    color: #1565c0;
    flex-shrink: 0;
  }

  strong {
    color: #0d47a1;
  }
}

// Example visualization box
.example-box {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;

  h4 {
    margin: 0 0 16px 0;
    color: #333;
  }
}
```

### Step/Instruction Styles

```scss
.steps {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .step {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    .step-number {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #1976d2;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }

    .step-content {
      strong {
        display: block;
        margin-bottom: 4px;
        color: #333;
      }

      p {
        margin: 0;
        font-size: 14px;
        color: #666;
      }
    }
  }
}

.instruction-box {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .instruction {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #fafafa;
    border-radius: 8px;

    .icon-box {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: #e3f2fd;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon {
        color: #1976d2;
      }
    }
  }
}
```

### Grid Layouts

```scss
.field-types-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;

  .field-type-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: #f9f9f9;
    border-radius: 8px;
    text-align: center;

    mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1976d2;
    }

    span {
      font-weight: 600;
      color: #333;
    }

    small {
      font-size: 11px;
      color: #888;
    }
  }
}
```

### Tips Cards

```scss
.tips-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;

  .tip-card {
    display: flex;
    gap: 16px;
    padding: 16px;
    background: #fafafa;
    border-radius: 8px;
    border: 1px solid #eee;

    .tip-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: #e3f2fd;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      mat-icon {
        color: #1976d2;
      }
    }

    .tip-content {
      h4 {
        margin: 0 0 8px 0;
        font-size: 15px;
      }

      p {
        margin: 0;
        font-size: 14px;
        color: #666;
        line-height: 1.5;
      }
    }
  }
}
```

### Reference Tables

```scss
.quick-reference,
.comparison-box {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;

  h4 {
    margin: 0 0 16px 0;
  }

  .reference-table {
    width: 100%;
    border-collapse: collapse;

    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }

    th {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 13px;
    }

    td {
      font-size: 14px;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        vertical-align: middle;
      }
    }
  }
}
```

### Footer Styling

```scss
.help-footer {
  padding: 16px 24px;
  border-top: 1px solid #ddd;
  text-align: center;
  background: #fafafa;
}
```

### Responsive Design

```scss
@media (max-width: 600px) {
  .help-header {
    padding: 12px 16px;

    .help-title h2 {
      font-size: 16px;
    }
  }

  .help-tabs {
    padding: 8px 12px;

    .tab-btn {
      padding: 6px 10px;
      font-size: 12px;

      // Hide text labels on mobile, show only icons
      span {
        display: none;
      }
    }
  }

  .help-content {
    padding: 16px;
  }

  .example-visual {
    flex-direction: column;
    gap: 12px;

    .arrow {
      transform: rotate(90deg);
    }
  }

  .comparison-box table {
    font-size: 12px;

    th, td {
      padding: 8px;
    }
  }
}
```

---

## 6. Content Patterns

### Box Types Summary

| Box Type | Background | Border | Use Case |
|----------|------------|--------|----------|
| `.feature-box` | Blue (#e3f2fd) | None | Highlight key features |
| `.tip-box` | Yellow (#fff8e1) | Left amber | Tips and best practices |
| `.note-box` | Blue (#e3f2fd) | Left blue | Important notes |
| `.example-box` | White | Gray border | Visual examples |
| `.comparison-box` | Light gray | None | Comparison tables |

### Visual Example Patterns

#### Horizontal Before/After

```html
<div class="example-visual">
  <div class="field-preview">
    <!-- Before state -->
    <span>Before Text</span>
  </div>
  <span class="arrow">→</span>
  <div class="field-result">
    <!-- After state -->
    <span>After Text</span>
  </div>
</div>
```

#### Vertical Flow

```html
<div class="example-visual-vertical">
  <div class="preview-element">
    <!-- Initial state -->
  </div>
  <div class="result-text">
    <mat-icon>arrow_downward</mat-icon>
    <span>Result description</span>
  </div>
</div>
```

### Inline SVG Diagrams

For complex visualizations, use inline SVG:

```html
<div class="positioning-diagram">
  <svg width="500" height="200" xmlns="http://www.w3.org/2000/svg">
    <!-- Background -->
    <rect width="500" height="200" fill="#f8f9fa"/>

    <!-- Title -->
    <text x="250" y="25" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="14"
          font-weight="bold" fill="#333">
      Diagram Title
    </text>

    <!-- Your diagram elements -->
    <rect x="20" y="65" width="200" height="35" rx="4"
          fill="#fff" stroke="#1976D2" stroke-width="2"/>

    <!-- Labels and annotations -->
    <text x="120" y="87" font-family="Arial, sans-serif"
          font-size="13" fill="#333">
      Label Text
    </text>
  </svg>
</div>
```

---

## 7. Integration Guide

### Step 1: Add to Module

```typescript
// your-feature.module.ts
import { HelpDialogComponent } from './components/help-dialog/help-dialog.component';

@NgModule({
  declarations: [
    // ... other components
    HelpDialogComponent
  ],
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule
  ]
})
export class YourFeatureModule { }
```

### Step 2: Add to Parent Component

```typescript
// parent.component.ts
import { MatDialog } from '@angular/material/dialog';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';

@Component({
  selector: 'app-parent',
  templateUrl: './parent.component.html'
})
export class ParentComponent {

  constructor(private dialog: MatDialog) {}

  // Auto-open on init (optional)
  ngOnInit(): void {
    this.openHelp();
  }

  // Method to open help dialog
  openHelp(): void {
    this.dialog.open(HelpDialogComponent, {
      width: '800px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'help-dialog-panel'
    });
  }
}
```

### Step 3: Add Help Button to Template

```html
<!-- parent.component.html -->
<button mat-icon-button
        matTooltip="Help Guide"
        (click)="openHelp()"
        class="help-btn">
  <mat-icon>help_outline</mat-icon>
</button>
```

### Step 4: Global Styles (Optional)

```scss
// styles.scss (global)
.help-dialog-panel {
  .mat-mdc-dialog-container {
    padding: 0;
    overflow: hidden;
  }
}
```

---

## 8. Dependencies

### Required Angular Material Modules

```typescript
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';  // For tooltips
```

### Required Angular Modules

```typescript
import { CommonModule } from '@angular/common';  // For *ngIf, *ngFor
```

### Package.json Dependencies

```json
{
  "dependencies": {
    "@angular/material": "^17.0.0",
    "@angular/cdk": "^17.0.0"
  }
}
```

---

## 9. Customization Guide

### Adding New Tabs

1. **Add tab definition** in component:

```typescript
tabs = [
  // ... existing tabs
  { id: 'newfeature', label: 'New Feature', icon: 'star' }
];
```

2. **Add content section** in template:

```html
<div *ngIf="activeTab === 'newfeature'" class="tab-content">
  <h3><mat-icon>star</mat-icon> New Feature</h3>
  <p>Description of the new feature.</p>

  <div class="feature-box">
    <h4>Features</h4>
    <ul>
      <li>Feature 1</li>
      <li>Feature 2</li>
    </ul>
  </div>

  <!-- More content... -->
</div>
```

### Changing Color Theme

Update the gradient in header:

```scss
.help-header {
  // Purple/violet gradient (original)
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

  // Blue gradient alternative
  // background: linear-gradient(135deg, #1976d2 0%, #0d47a1 100%);

  // Green gradient alternative
  // background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);

  // Orange gradient alternative
  // background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}
```

Update primary color throughout:

```scss
// Define as variable for easy changing
$primary-color: #1976d2;
$primary-light: #e3f2fd;
$primary-dark: #0d47a1;

.tab-btn.active {
  background: $primary-color;
}

mat-icon {
  color: $primary-color;
}

.icon-box {
  background: $primary-light;
}
```

### Adding Screenshots

Replace SVG examples with actual images:

```html
<div class="example-box">
  <h4>Example</h4>
  <img src="assets/images/help/feature-example.png"
       alt="Feature Example"
       style="max-width: 100%; border-radius: 8px;" />
</div>
```

### Localization Support

Make content translatable:

```typescript
// help-dialog.component.ts
import { TranslateService } from '@ngx-translate/core';

export class HelpDialogComponent {
  tabs = [
    { id: 'overview', labelKey: 'HELP.TABS.OVERVIEW', icon: 'home' },
    // ...
  ];

  constructor(
    public dialogRef: MatDialogRef<HelpDialogComponent>,
    private translate: TranslateService
  ) {}

  getTabLabel(tab: any): string {
    return this.translate.instant(tab.labelKey);
  }
}
```

---

## 10. Best Practices

### Content Guidelines

1. **Keep it scannable**: Use headers, bullet points, and visual hierarchy
2. **Show, don't tell**: Include visual examples for complex features
3. **Be concise**: Users scan help content, avoid walls of text
4. **Use consistent terminology**: Match labels in help with actual UI
5. **Include tips**: Provide actionable advice, not just descriptions

### UX Guidelines

1. **Auto-open on first visit**: Help users discover features early
2. **Provide manual access**: Always have a help button visible
3. **Remember position**: Don't reset tab when re-opening
4. **Mobile-friendly**: Ensure responsive design works well
5. **Keyboard accessible**: Support Tab navigation and Enter/Escape keys

### Performance Guidelines

1. **Lazy content**: Consider lazy loading for images
2. **Inline SVG**: Use inline SVG for diagrams (no extra requests)
3. **Single component**: Keep all help in one component for simplicity
4. **Conditional rendering**: Use `*ngIf` not `[hidden]` for tabs

### Maintenance Guidelines

1. **Version sync**: Update help when features change
2. **Screenshot freshness**: Update screenshots with UI changes
3. **User feedback**: Track which tabs are most visited
4. **Test all tabs**: Verify each tab renders correctly

---

## Appendix A: Complete Tab Configuration Example

```typescript
tabs = [
  // Welcome/Introduction
  { id: 'overview', label: 'Overview', icon: 'home' },

  // Feature-specific tabs
  { id: 'signature', label: 'Signature', icon: 'draw' },
  { id: 'initials', label: 'Initials', icon: 'mode_edit' },
  { id: 'fullname', label: 'Full Name', icon: 'person' },
  { id: 'date', label: 'Date', icon: 'calendar_month' },
  { id: 'checkbox', label: 'Checkbox', icon: 'check_box' },
  { id: 'radio', label: 'Radio Button', icon: 'radio_button_checked' },
  { id: 'textinput', label: 'Text Input', icon: 'text_fields' },
  { id: 'noneditable', label: 'Static Text', icon: 'article' },
  { id: 'image', label: 'Image', icon: 'image' },

  // Summary/Tips (always last)
  { id: 'tips', label: 'Tips', icon: 'lightbulb' }
];
```

---

## Appendix B: Material Icons Reference

Commonly used icons for help systems:

| Category | Icon Name | Description |
|----------|-----------|-------------|
| Navigation | `home` | Overview/Home |
| | `help_outline` | Help button |
| | `close` | Close dialog |
| | `arrow_forward` | Next step |
| | `arrow_downward` | Flow indicator |
| Actions | `drag_indicator` | Drag handle |
| | `touch_app` | Click action |
| | `edit` | Edit/Input |
| | `delete` | Remove |
| | `save` | Save action |
| Fields | `draw` | Signature |
| | `mode_edit` | Initials |
| | `person` | Name |
| | `calendar_month` | Date |
| | `check_box` | Checkbox |
| | `radio_button_checked` | Radio |
| | `text_fields` | Text input |
| | `article` | Static text |
| | `image` | Image upload |
| Info | `tips_and_updates` | Tips |
| | `lightbulb` | Ideas |
| | `info` | Information |
| | `warning` | Warning |

---

## Appendix C: Dialog Configuration Options

```typescript
this.dialog.open(HelpDialogComponent, {
  // Size
  width: '800px',           // Fixed width
  maxWidth: '95vw',         // Max width (responsive)
  maxHeight: '90vh',        // Max height (scrollable)

  // Behavior
  disableClose: false,      // Allow clicking outside to close
  autoFocus: true,          // Focus first focusable element
  restoreFocus: true,       // Return focus on close

  // Styling
  panelClass: 'help-dialog-panel',  // Custom CSS class

  // Data (if needed)
  data: { initialTab: 'tips' }      // Pass data to dialog
});
```

---

## Appendix D: Quick Reference Table Example

```html
<table class="reference-table">
  <tr>
    <th>Field Type</th>
    <th>Icon</th>
    <th>Selection</th>
    <th>Required?</th>
  </tr>
  <tr>
    <td>Signature</td>
    <td><mat-icon>draw</mat-icon></td>
    <td>Draw/Upload</td>
    <td>Yes</td>
  </tr>
  <tr>
    <td>Initials</td>
    <td><mat-icon>mode_edit</mat-icon></td>
    <td>Type</td>
    <td>Yes</td>
  </tr>
  <tr>
    <td>Full Name</td>
    <td><mat-icon>person</mat-icon></td>
    <td>Type legal name</td>
    <td>Yes</td>
  </tr>
  <tr>
    <td>Date</td>
    <td><mat-icon>calendar_month</mat-icon></td>
    <td>Auto-fill</td>
    <td>Yes</td>
  </tr>
  <tr>
    <td>Checkbox</td>
    <td><mat-icon>check_box</mat-icon></td>
    <td>Multi-select</td>
    <td>No</td>
  </tr>
  <tr>
    <td>Radio Button</td>
    <td><mat-icon>radio_button_checked</mat-icon></td>
    <td>Single-select</td>
    <td>Yes</td>
  </tr>
  <tr>
    <td>Text Input</td>
    <td><mat-icon>text_fields</mat-icon></td>
    <td>Free text</td>
    <td>Configurable</td>
  </tr>
  <tr>
    <td>Static Text</td>
    <td><mat-icon>article</mat-icon></td>
    <td>Display only</td>
    <td>N/A</td>
  </tr>
  <tr>
    <td>Image</td>
    <td><mat-icon>image</mat-icon></td>
    <td>Upload PNG</td>
    <td>Yes</td>
  </tr>
</table>
```

---

*Document generated from BoardPulsePro PDF Form Creator Help System implementation.*

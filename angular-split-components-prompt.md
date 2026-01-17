# Angular Component File Splitting Task

## Objective
Refactor all Angular components in this project that use inline `template` and `styles` in the `@Component` decorator to use separate external files (`.html`, `.scss`, `.ts`) following the official Angular Style Guide.

## Scope
Scan the entire project for `.ts` files containing `@Component` decorators with:
- `template:` (inline template) → extract to `.component.html`
- `styles:` (inline styles) → extract to `.component.scss`

## Rules & Constraints

### 1. File Naming Convention (Angular Style Guide)
```
component-name.component.ts
component-name.component.html
component-name.component.scss
```

### 2. Extraction Rules

#### For Templates:
- Extract the content inside `template: \`...\`` or `template: '...'`
- Remove the backticks/quotes - save raw HTML only
- Preserve all Angular syntax: `*ngIf`, `*ngFor`, `[(ngModel)]`, `[property]`, `(event)`, `#templateRef`, `@if`, `@for`, etc.
- Preserve all whitespace and formatting
- Save to `[component-name].component.html` in the same directory

#### For Styles:
- Extract content inside `styles: [\`...\`]` or `styles: ['...']`
- Convert to valid SCSS syntax
- Replace `:host ::ng-deep` with `::ng-deep` (keep for now, add TODO comment about deprecation)
- Preserve all CSS/SCSS: nesting with `&`, variables, mixins if present
- Save to `[component-name].component.scss` in the same directory

#### For TypeScript:
- Replace `template:` with `templateUrl: './[component-name].component.html',`
- Replace `styles:` with `styleUrls: ['./[component-name].component.scss']`
- For Angular 17+ standalone components, `styleUrl` (singular) is also valid for single file
- Remove the inline content completely
- Keep all other code unchanged

### 3. Do NOT Modify
- Components already using `templateUrl` and `styleUrls`
- Any TypeScript logic, imports, class methods, or properties
- Any Angular decorators other than adjusting template/styles references
- Test files (`.spec.ts`)

### 4. Edge Cases to Handle

#### Small Templates (< 3 lines):
- Still extract if `styles` are being extracted (keep consistent)
- Exception: If template is truly minimal (e.g., `<router-outlet></router-outlet>`), you may leave inline but add comment explaining why

#### Empty or No Styles:
- If `styles: []` is empty, create empty `.scss` file with comment:
  ```scss
  /* Styles for ComponentName */
  ```
- Or remove `styles: []` entirely and don't create `.scss` file (preferred)

#### Multiple Style Blocks:
- If `styles: [\`...\`, \`...\`]` has multiple strings, combine into single `.scss` file with clear separation:
  ```scss
  /* Block 1 */
  ...
  
  /* Block 2 */
  ...
  ```

#### Template Expressions with Backticks:
- Be careful with templates containing JavaScript template literals inside Angular expressions
- Ensure proper escaping is maintained

### 5. Validation Steps (After Each File)
1. Verify the new `.html` file contains valid Angular template syntax
2. Verify the new `.scss` file contains valid SCSS syntax  
3. Verify the `.ts` file has correct relative paths in `templateUrl`/`styleUrls`
4. Verify no TypeScript compilation errors are introduced
5. Verify component selector remains unchanged

## Process

### Step 1: Discovery
```bash
# Find all component files with inline templates
grep -r "template:" --include="*.component.ts" --include="*.ts" -l src/
```

### Step 2: For Each Component File
1. Read the entire file content
2. Parse the `@Component` decorator
3. Extract `template` content if present
4. Extract `styles` content if present
5. Determine the component name from filename or selector
6. Create new `.html` file with extracted template
7. Create new `.scss` file with extracted styles
8. Modify `.ts` file to use `templateUrl` and `styleUrls`
9. Validate all three files

### Step 3: Verification
After all files are processed:
```bash
# Run Angular compiler to check for errors
ng build --configuration=development

# Or just type-check
npx tsc --noEmit

# Run tests to ensure nothing broke
ng test --watch=false
```

## Example Transformation

### Before: `user-card.component.ts`
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../models/user.model';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="user-card" [class.active]="isActive">
      <img [src]="user.avatar" [alt]="user.name">
      <h3>{{ user.name }}</h3>
      <p>{{ user.email }}</p>
      <button (click)="onSelect()">Select</button>
    </div>
  `,
  styles: [`
    .user-card {
      padding: 16px;
      border-radius: 8px;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      
      &.active {
        border: 2px solid #1976d2;
      }
      
      img {
        width: 64px;
        height: 64px;
        border-radius: 50%;
      }
      
      h3 {
        margin: 8px 0 4px;
        font-size: 16px;
      }
      
      p {
        color: #666;
        font-size: 14px;
      }
      
      button {
        margin-top: 12px;
        padding: 8px 16px;
        background: #1976d2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        
        &:hover {
          background: #1565c0;
        }
      }
    }
  `]
})
export class UserCardComponent {
  @Input() user!: User;
  @Input() isActive = false;
  
  onSelect(): void {
    // selection logic
  }
}
```

### After: `user-card.component.ts`
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../models/user.model';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-card.component.html',
  styleUrls: ['./user-card.component.scss']
})
export class UserCardComponent {
  @Input() user!: User;
  @Input() isActive = false;
  
  onSelect(): void {
    // selection logic
  }
}
```

### After: `user-card.component.html`
```html
<div class="user-card" [class.active]="isActive">
  <img [src]="user.avatar" [alt]="user.name">
  <h3>{{ user.name }}</h3>
  <p>{{ user.email }}</p>
  <button (click)="onSelect()">Select</button>
</div>
```

### After: `user-card.component.scss`
```scss
.user-card {
  padding: 16px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &.active {
    border: 2px solid #1976d2;
  }

  img {
    width: 64px;
    height: 64px;
    border-radius: 50%;
  }

  h3 {
    margin: 8px 0 4px;
    font-size: 16px;
  }

  p {
    color: #666;
    font-size: 14px;
  }

  button {
    margin-top: 12px;
    padding: 8px 16px;
    background: #1976d2;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: #1565c0;
    }
  }
}
```

## Special Handling for ::ng-deep

When extracting styles containing `::ng-deep`:

```scss
// Add this comment at the top of the file if ::ng-deep is used
// TODO: ::ng-deep is deprecated. Consider using component styles with ViewEncapsulation.None
// or restructuring styles to avoid deep selectors.
// See: https://angular.io/guide/component-styles#deprecated-deep--and-ng-deep

::ng-deep {
  .some-deep-style {
    // ...
  }
}
```

## Checklist for Each Component

- [ ] Template extracted to `.component.html`
- [ ] Styles extracted to `.component.scss`
- [ ] `templateUrl` path is correct (relative, starts with `./`)
- [ ] `styleUrls` path is correct (array format, relative path)
- [ ] No trailing commas issues in decorator
- [ ] Original formatting/indentation preserved in HTML
- [ ] SCSS syntax is valid (check `&` nesting works)
- [ ] All Angular bindings intact (`[]`, `()`, `[()]`, `*`, `#`, `@`)
- [ ] No TypeScript errors after modification
- [ ] Component still renders correctly (visual verification if possible)

## Output Summary
After completing the task, provide a summary:
1. Total components found with inline templates/styles
2. Components successfully split
3. Components skipped (with reasons)
4. Any warnings or issues encountered
5. Verification status (build success/failure)

---

## Start Command
Begin by scanning the `src/` directory for all Angular components with inline templates or styles, then process each one according to the rules above. Work through files one directory at a time, validating as you go.

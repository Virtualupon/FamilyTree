import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InstallPromptComponent } from './shared/components/install-prompt/install-prompt.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, InstallPromptComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('family-tree-ui');
}

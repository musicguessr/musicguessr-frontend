import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// Re-export required by the Angular 21 prerender worker
export { ɵgetOrCreateAngularServerApp } from '@angular/ssr';

const bootstrap = (context?: BootstrapContext): Promise<unknown> =>
  bootstrapApplication(AppComponent, config, context);

export default bootstrap;

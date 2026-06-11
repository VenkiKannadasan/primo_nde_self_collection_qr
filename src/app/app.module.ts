import {ApplicationRef, DoBootstrap, Injector, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {AppComponent} from './app.component';
import {createCustomElement, NgElementConstructor} from "@angular/elements";
import {Router} from "@angular/router";
import {selectorComponentMap} from "./custom1-module/customComponentMappings";
import {TranslateModule} from "@ngx-translate/core";
import { CommonModule } from '@angular/common';
import { AutoAssetSrcDirective } from './services/auto-asset-src.directive';
import {SHELL_ROUTER} from "./injection-tokens";
import { SelfCollectionQrComponent } from './self-collection-qr/self-collection-qr.component';



export const AppModule = ({providers, shellRouter}: {providers:any, shellRouter: Router}) => {
   @NgModule({
    declarations: [
      AppComponent,
      AutoAssetSrcDirective,
      SelfCollectionQrComponent
    ],
    exports: [AutoAssetSrcDirective],
    imports: [
      BrowserModule,
      CommonModule,
      TranslateModule.forRoot({})
    ],
    providers: [...providers, {provide: SHELL_ROUTER, useValue: shellRouter}],
    bootstrap: []
  })
  class AppModule implements DoBootstrap{
    private webComponentSelectorMap = new Map<string,  NgElementConstructor<unknown>>();

    constructor(private injector: Injector, private router: Router) {
      router.dispose(); //this prevents the router from being initialized and interfering with the shell app router
    }

    ngDoBootstrap(appRef: ApplicationRef) {
      for (const [key, value] of selectorComponentMap) {
        const customElement = createCustomElement(value, {injector: this.injector});
        this.webComponentSelectorMap.set(key, customElement);
      }

      console.info('[SelfCollectionQr] registered NDE selectors', Array.from(this.webComponentSelectorMap.keys()));
    }

    /**
     * Use componentMapping, selectorComponentMap
     * @param componentName
     */
    public getComponentRef(componentName:string) {
      const componentRef = this.webComponentSelectorMap.get(componentName);

      console.info('[SelfCollectionQr] getComponentRef', {
        componentName,
        found: Boolean(componentRef),
        registeredSelectors: Array.from(this.webComponentSelectorMap.keys()),
      });

      return componentRef;
    }
  }
  return AppModule
}

import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { SelfCollectionQrComponent } from './self-collection-qr.component';

describe('SelfCollectionQrComponent', () => {
  let fixture: ComponentFixture<SelfCollectionQrComponent>;
  let component: SelfCollectionQrComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SelfCollectionQrComponent],
      providers: [
        {
          provide: 'MODULE_PARAMETERS',
          useValue: {
            selfCollectionQr: {
              queryParamA: 'token A',
              queryParamB: 'token B',
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SelfCollectionQrComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.querySelectorAll('nde-requests').forEach(element => element.remove());
    fixture.destroy();
  });

  it('renders QR codes for requests on the hold shelf until a pickup date', () => {
    component.hostComponent = {
      requestsService: {
        requestsDisplay: [
          {
            requestId: 'REQ 123',
            title: 'Ready title',
            status: 'Request. On Hold Shelf until 22/06/2026',
          },
          {
            requestId: 'REQ 456',
            title: 'Pending title',
            status: 'In process',
          },
        ],
      },
    };

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.self-collection-qr__item');
    const qrImage = compiled.querySelector('.self-collection-qr__image') as HTMLImageElement | null;

    expect(cards.length).toBe(1);
    expect(compiled.textContent).toContain('Ready title');
    expect(compiled.textContent).not.toContain('Pending title');
    expect(qrImage?.src).toContain('apiPublic.aspx');
    expect(qrImage?.src).toContain('a=token+A');
    expect(qrImage?.src).toContain('b=token+B');
    expect(qrImage?.src).toContain('c=REQ+123');
  });

  it('renders QR codes from the expanded NDE request row when the request is ready', () => {
    const requestsRoot = document.createElement('nde-requests');
    requestsRoot.innerHTML = `
      <section class="request-row">
        <a href="/discovery/fulldisplay">Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)</a>
        <div>Request. Ready for Collection</div>
        <div>Carldberg, Conrad George.</div>
        <div>Pick up: NP Library</div>
        <div>Request Date: 11/06/2026</div>
        <div>Request Id: 2207101260008082</div>
        <button aria-label="Cancel request">Cancel</button>
      </section>
    `;
    document.body.appendChild(requestsRoot);

    component.hostComponent = {};
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const qrImage = compiled.querySelector('.self-collection-qr__image') as HTMLImageElement | null;

    expect(compiled.textContent).toContain('Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)');
    expect(qrImage?.src).toContain('c=2207101260008082');
  });

  it('renders QR codes from request row attributes when the request ID is not visible', () => {
    const requestsRoot = document.createElement('nde-requests');
    requestsRoot.innerHTML = `
      <section class="request-row" data-request-id="2207101260008082">
        <a href="/discovery/fulldisplay">Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)</a>
        <div>Request. On Hold Shelf until 22/06/2026</div>
        <div>Carldberg, Conrad George.</div>
        <div>Pick up: NP Library</div>
        <button aria-label="Cancel request">Cancel</button>
      </section>
    `;
    document.body.appendChild(requestsRoot);

    component.hostComponent = {};
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const qrImage = compiled.querySelector('.self-collection-qr__image') as HTMLImageElement | null;

    expect(compiled.textContent).toContain('Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)');
    expect(qrImage?.src).toContain('c=2207101260008082');
  });

  it('places an inline QR inside the real NDE request item action row', fakeAsync(() => {
    const requestsRoot = document.createElement('nde-requests');
    requestsRoot.innerHTML = `
      <nde-request-item class="width-100 flex-column">
        <div class="request-item-container flex-row flex-layout-space-between margin-top-medium">
          <div class="request-info flex-column flex-layout-start-start">
            <div class="request-title">
              <a data-qa="requests-item-title" href="/nde/fulldisplay?docid=alma9910014014807171">
                Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)
              </a>
            </div>
            <div data-qa="requests-item-status-indication" class="status-line margin-top-medium">
              <span>Request</span><span>. On Hold Shelf until 22/06/2026</span>
            </div>
            <div data-qa="requests-brief-line-1" class="margin-top-medium">Carlberg, Conrad George.</div>
            <div data-qa="requests-brief-line-2" class="margin-top-medium">
              <span class="field-title">Pick up:</span> NP Library
            </div>
            <div>
              <div>
                <div class="margin-top-medium" data-qa="requests-expanded-item-request.bookings.request_id">
                  <span class="field-title">Request Id:</span> 2207101260008082
                </div>
              </div>
            </div>
          </div>
          <div class="flex-column flex-layout-space-between">
            <div class="request-actions flex-row flex-layout-start-start">
              <nde-actions-presenter data-qa="requests_actions_container"></nde-actions-presenter>
            </div>
          </div>
        </div>
        <div class="flex-row flex-layout-space-between width-100">
          <button data-qa="request-item-cancel-btn" aria-label="Cancel request Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)">
            <span class="mdc-button__label">Cancel</span>
          </button>
          <div class="margin-start-auto">
            <button data-qa="request-expand-collapse-item-btn" aria-expanded="true"></button>
          </div>
        </div>
      </nde-request-item>
    `;
    document.body.appendChild(requestsRoot);

    component.hostComponent = {};
    fixture.detectChanges();
    tick(150);
    fixture.detectChanges();

    const inlineQr = requestsRoot.querySelector('.self-collection-qr-inline') as HTMLButtonElement | null;
    const inlineQrImage = inlineQr?.querySelector('img') ?? null;

    expect(inlineQr).not.toBeNull();
    expect(inlineQr?.dataset['requestId']).toBe('2207101260008082');
    expect(inlineQr?.parentElement?.querySelector('[data-qa="request-item-cancel-btn"]')).not.toBeNull();
    expect(inlineQrImage?.src).toContain('c=2207101260008082');
    expect(inlineQrImage?.getAttribute('crossorigin')).toBeNull();

    discardPeriodicTasks();
  }));

  it('places an inline QR when mounted in the NDE record actions hook', fakeAsync(() => {
    const requestsRoot = document.createElement('nde-requests');
    requestsRoot.innerHTML = `
      <nde-request-item class="width-100 flex-column">
        <div class="request-item-container flex-row flex-layout-space-between margin-top-medium">
          <div class="request-info flex-column flex-layout-start-start">
            <div class="request-title">
              <a data-qa="requests-item-title" href="/nde/fulldisplay?docid=alma9910014014807171">
                Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)
              </a>
            </div>
            <div data-qa="requests-item-status-indication" class="status-line margin-top-medium">
              <span>Request</span><span>. On Hold Shelf until 22/06/2026</span>
            </div>
            <div>
              <div>
                <div class="margin-top-medium" data-qa="requests-expanded-item-request.bookings.request_id">
                  <span class="field-title">Request Id:</span> 2207101260008082
                </div>
              </div>
            </div>
          </div>
          <div class="flex-column flex-layout-space-between">
            <div class="request-actions flex-row flex-layout-start-start">
              <nde-record-actions-bottom></nde-record-actions-bottom>
            </div>
          </div>
        </div>
        <div class="flex-row flex-layout-space-between width-100">
          <button data-qa="request-item-cancel-btn" aria-label="Cancel request Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)">
            <span class="mdc-button__label">Cancel</span>
          </button>
          <div class="margin-start-auto">
            <button data-qa="request-expand-collapse-item-btn" aria-expanded="true"></button>
          </div>
        </div>
      </nde-request-item>
    `;
    document.body.appendChild(requestsRoot);

    const actionsHook = requestsRoot.querySelector('nde-record-actions-bottom') as HTMLElement;
    actionsHook.appendChild(fixture.nativeElement);

    component.hostComponent = {};
    fixture.detectChanges();
    tick(150);
    fixture.detectChanges();

    const inlineQr = requestsRoot.querySelector('.self-collection-qr-inline') as HTMLButtonElement | null;
    const sectionFallback = fixture.nativeElement.querySelector('.self-collection-qr');

    expect(inlineQr).not.toBeNull();
    expect(inlineQr?.dataset['requestId']).toBe('2207101260008082');
    expect(inlineQr?.parentElement?.querySelector('[data-qa="request-item-cancel-btn"]')).not.toBeNull();
    expect(sectionFallback).toBeNull();

    discardPeriodicTasks();
  }));

  it('accepts Alma object parameters when they arrive as a key-value string', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      declarations: [SelfCollectionQrComponent],
      providers: [
        {
          provide: 'MODULE_PARAMETERS',
          useValue: {
            selfCollectionQr: '{qrUrlTemplate=https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={requestId}, eligibleStatuses=[On Hold Shelf], debug=true}',
          },
        },
      ],
    });

    const stringConfigFixture = TestBed.createComponent(SelfCollectionQrComponent);
    const stringConfigComponent = stringConfigFixture.componentInstance;

    stringConfigComponent.hostComponent = {
      requestsService: {
        requestsDisplay: [
          {
            requestId: '2207101260008082',
            title: 'Decision analytics',
            status: 'Request. On Hold Shelf until 22/06/2026',
          },
          {
            requestId: '2207101260008083',
            title: 'Still pending',
            status: 'Request. In Process',
          },
        ],
      },
    };

    stringConfigFixture.detectChanges();

    const compiled = stringConfigFixture.nativeElement as HTMLElement;
    const qrImage = compiled.querySelector('.self-collection-qr__image') as HTMLImageElement | null;

    expect(compiled.textContent).toContain('Decision analytics');
    expect(compiled.textContent).not.toContain('Still pending');
    expect(qrImage?.src).toContain('api.qrserver.com/v1/create-qr-code/');
    expect(qrImage?.src).toContain('data=2207101260008082');

    stringConfigFixture.destroy();
  });

  it('does not render QR codes from an expanded NDE request row while it is in process', () => {
    const requestsRoot = document.createElement('nde-requests');
    requestsRoot.innerHTML = `
      <section class="request-row">
        <a href="/discovery/fulldisplay">Decision analytics : Microsoft Excel / Conrad Carlberg. (PBK.)</a>
        <div>Request. In Process</div>
        <div>Request Id: 2207101260008082</div>
        <button aria-label="Cancel request">Cancel</button>
      </section>
    `;
    document.body.appendChild(requestsRoot);

    component.hostComponent = {};
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.self-collection-qr')).toBeNull();
  });

  it('does not render without locker service parameters', () => {
    spyOn(console, 'warn');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      declarations: [SelfCollectionQrComponent],
      providers: [
        {
          provide: 'MODULE_PARAMETERS',
          useValue: { selfCollectionQr: {} },
        },
      ],
    });

    const missingConfigFixture = TestBed.createComponent(SelfCollectionQrComponent);
    const missingConfigComponent = missingConfigFixture.componentInstance;

    missingConfigComponent.hostComponent = {
      requestsService: {
        requestsDisplay: [
          {
            requestId: 'REQ 123',
            title: 'Ready title',
            status: 'On Hold Shelf',
          },
        ],
      },
    };

    missingConfigFixture.detectChanges();

    const compiled = missingConfigFixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.self-collection-qr')).toBeNull();

    missingConfigFixture.destroy();
  });
});

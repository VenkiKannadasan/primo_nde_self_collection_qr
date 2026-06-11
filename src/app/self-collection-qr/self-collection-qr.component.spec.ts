import { ComponentFixture, TestBed } from '@angular/core/testing';
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

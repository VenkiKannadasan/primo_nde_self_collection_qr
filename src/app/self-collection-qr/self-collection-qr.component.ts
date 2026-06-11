import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  Optional,
} from '@angular/core';

interface RawSelfCollectionQrConfig {
  enabled?: boolean;
  placement?: SelfCollectionQrPlacement;
  showSectionFallback?: boolean;
  serviceUrl?: string;
  qrUrlTemplate?: string;
  queryParamA?: string;
  queryParamB?: string;
  queryparamA?: string;
  queryparamB?: string;
  a?: string;
  b?: string;
  paramAName?: string;
  paramBName?: string;
  requestIdParamName?: string;
  eligibleStatus?: string;
  eligibleStatuses?: string[];
  heading?: string;
  subheading?: string;
  imageAlt?: string;
  unavailableText?: string;
  observerSelector?: string;
  rowSelector?: string;
  refreshIntervalMs?: number;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
}

interface SelfCollectionQrModuleParameters extends RawSelfCollectionQrConfig {
  selfCollectionQr?: RawSelfCollectionQrConfig;
}

interface SelfCollectionQrConfig {
  enabled: boolean;
  placement: SelfCollectionQrPlacement;
  showSectionFallback: boolean;
  serviceUrl: string;
  qrUrlTemplate: string;
  queryParamA: string;
  queryParamB: string;
  paramAName: string;
  paramBName: string;
  requestIdParamName: string;
  eligibleStatuses: string[];
  heading: string;
  subheading: string;
  imageAlt: string;
  unavailableText: string;
  observerSelector: string;
  rowSelector: string;
  refreshIntervalMs: number;
  crossOrigin: '' | 'anonymous' | 'use-credentials';
}

interface SelfCollectionRequest {
  requestId: string;
  title: string;
  status: string;
  qrUrl: string;
}

type SelfCollectionQrPlacement = 'inline' | 'section' | 'both';

const DEFAULT_SERVICE_URL = 'https://lockerwebservice.message.sg/npa_ws/apiPublic.aspx';
const DEFAULT_ELIGIBLE_STATUSES = [
  'On Hold Shelf',
  'Available for Pickup',
  'Available for Pick Up',
  'Available for Collection',
  'Ready for Pickup',
  'Ready for Pick Up',
  'Ready for Collection',
];
const DEFAULT_ROW_SELECTOR = [
  'md-list-item',
  'mat-expansion-panel',
  '.mat-expansion-panel',
  'mat-list-item',
  '.mat-mdc-list-item',
  '.mdc-list-item',
  '[role="listitem"]',
  '[class*="request"]',
  'li',
  'article',
  'tr',
].join(', ');

@Component({
  selector: 'custom-self-collection-qr',
  host: { 'data-component-id': 'self-collection-qr' },
  templateUrl: './self-collection-qr.component.html',
  styleUrls: ['./self-collection-qr.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelfCollectionQrComponent implements OnDestroy {
  @Input()
  set hostComponent(value: unknown) {
    this.host = value;
    this.refreshRequests();
    this.observeRequestDom();
  }

  get hostComponent(): unknown {
    return this.host;
  }

  readonly config: SelfCollectionQrConfig;
  qrRequests: SelfCollectionRequest[] = [];
  selectedRequest: SelfCollectionRequest | null = null;

  private readonly failedRequestIds = new Set<string>();
  private host: unknown = null;
  private lastRequestSignature = '';
  private pollHandle: number | null = null;
  private mutationObserver: MutationObserver | null = null;
  private inlinePlacementHandle: number | null = null;
  private inlinePlacedRequestIds = new Set<string>();
  private hasLoggedMissingConfig = false;

  constructor(
    @Optional() @Inject('MODULE_PARAMETERS') moduleParameters: SelfCollectionQrModuleParameters | null,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly ngZone: NgZone,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.config = this.buildConfig(moduleParameters);
    this.startPolling();
  }

  get shouldRender(): boolean {
    return this.config.enabled && this.isConfigured() && this.sectionRequests.length > 0;
  }

  get sectionRequests(): SelfCollectionRequest[] {
    if (this.config.placement === 'section' || this.config.placement === 'both') {
      return this.qrRequests;
    }

    if (!this.config.showSectionFallback) {
      return [];
    }

    return this.qrRequests.filter(request => !this.inlinePlacedRequestIds.has(request.requestId));
  }

  trackByRequestId(_index: number, request: SelfCollectionRequest): string {
    return request.requestId;
  }

  openQr(request: SelfCollectionRequest): void {
    this.selectedRequest = request;
    this.changeDetector.markForCheck();
  }

  closeQr(): void {
    this.selectedRequest = null;
    this.changeDetector.markForCheck();
  }

  onQrImageError(request: SelfCollectionRequest): void {
    this.failedRequestIds.add(request.requestId);
    this.changeDetector.markForCheck();
  }

  isQrImageUnavailable(request: SelfCollectionRequest): boolean {
    return this.failedRequestIds.has(request.requestId);
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    if (this.inlinePlacementHandle !== null) {
      window.clearTimeout(this.inlinePlacementHandle);
    }

    this.removeInlineQrElements();
  }

  private buildConfig(moduleParameters: SelfCollectionQrModuleParameters | null): SelfCollectionQrConfig {
    const raw = moduleParameters?.selfCollectionQr ?? moduleParameters ?? {};
    const eligibleStatuses = raw.eligibleStatuses?.length
      ? raw.eligibleStatuses
      : [raw.eligibleStatus ?? DEFAULT_ELIGIBLE_STATUSES].flat();

    return {
      enabled: raw.enabled ?? true,
      placement: raw.placement ?? 'inline',
      showSectionFallback: raw.showSectionFallback ?? true,
      serviceUrl: raw.serviceUrl ?? DEFAULT_SERVICE_URL,
      qrUrlTemplate: raw.qrUrlTemplate ?? '',
      queryParamA: raw.queryParamA ?? raw.queryparamA ?? raw.a ?? '',
      queryParamB: raw.queryParamB ?? raw.queryparamB ?? raw.b ?? '',
      paramAName: raw.paramAName ?? 'a',
      paramBName: raw.paramBName ?? 'b',
      requestIdParamName: raw.requestIdParamName ?? 'c',
      eligibleStatuses: eligibleStatuses.map(status => status.trim()).filter(status => status.length > 0),
      heading: raw.heading ?? 'Self-collection QR',
      subheading: raw.subheading ?? 'Scan at the self-collection kiosk.',
      imageAlt: raw.imageAlt ?? 'Self-collection QR code',
      unavailableText: raw.unavailableText ?? 'QR unavailable',
      observerSelector: raw.observerSelector ?? 'nde-requests, prm-requests',
      rowSelector: raw.rowSelector ?? DEFAULT_ROW_SELECTOR,
      refreshIntervalMs: Math.max(raw.refreshIntervalMs ?? 1000, 250),
      crossOrigin: raw.crossOrigin ?? 'anonymous',
    };
  }

  private isConfigured(): boolean {
    if (this.config.qrUrlTemplate.trim().length > 0) {
      return true;
    }

    return this.config.serviceUrl.trim().length > 0
      && this.config.queryParamA.trim().length > 0
      && this.config.queryParamB.trim().length > 0;
  }

  private refreshRequests(): void {
    if (!this.config.enabled) {
      return;
    }

    const extractedRequests = this.extractRequests(this.host);
    const qrRequests = this.toSelfCollectionRequests(extractedRequests);
    const signature = qrRequests
      .map(request => `${request.requestId}:${request.title}:${request.status}`)
      .join('|');

    if (!this.isConfigured() && qrRequests.length > 0 && !this.hasLoggedMissingConfig) {
      this.hasLoggedMissingConfig = true;
      console.warn('Self-collection QR add-on is missing queryParamA/queryParamB or qrUrlTemplate configuration.');
    }

    if (signature !== this.lastRequestSignature) {
      this.lastRequestSignature = signature;
      this.qrRequests = qrRequests;
      this.failedRequestIds.clear();
      this.changeDetector.markForCheck();
    }

    this.scheduleInlinePlacement();
  }

  private toSelfCollectionRequests(rawRequests: unknown[]): SelfCollectionRequest[] {
    const seenRequestIds = new Set<string>();
    const requests: SelfCollectionRequest[] = [];

    for (const rawRequest of rawRequests) {
      const request = this.normaliseRequest(rawRequest);

      if (!request || seenRequestIds.has(request.requestId)) {
        continue;
      }

      seenRequestIds.add(request.requestId);
      requests.push(request);
    }

    return requests;
  }

  private normaliseRequest(rawRequest: unknown): SelfCollectionRequest | null {
    if (!this.isRecord(rawRequest)) {
      return null;
    }

    const requestId = this.textFromFirst(rawRequest, [
      'requestId',
      'requestID',
      'request_id',
      'id',
    ]);
    const title = this.textFromFirst(rawRequest, [
      'title',
      'displayTitle',
      'recordTitle',
      'itemTitle',
    ]);
    const status = this.textFromFirst(rawRequest, [
      'status',
      'statusText',
      'displayStatus',
      'requestStatus',
    ]);

    if (!requestId || !this.statusIsEligible(status)) {
      return null;
    }

    return {
      requestId,
      title: title || 'Requested item',
      status,
      qrUrl: this.buildQrUrl(requestId),
    };
  }

  private statusIsEligible(status: string): boolean {
    const normalizedStatus = status.toLowerCase();

    return this.config.eligibleStatuses.some(eligibleStatus =>
      normalizedStatus.includes(eligibleStatus.toLowerCase()),
    );
  }

  private buildQrUrl(requestId: string): string {
    const encodedRequestId = encodeURIComponent(requestId);

    if (this.config.qrUrlTemplate.trim().length > 0) {
      return this.config.qrUrlTemplate
        .replace(/\{\{\s*requestId\s*\}\}/g, encodedRequestId)
        .replace(/\{requestId\}/g, encodedRequestId)
        .replace(/\$\{requestId\}/g, encodedRequestId);
    }

    const url = new URL(this.config.serviceUrl, this.document.location.origin);
    url.searchParams.set(this.config.paramAName, this.config.queryParamA);
    url.searchParams.set(this.config.paramBName, this.config.queryParamB);
    url.searchParams.set(this.config.requestIdParamName, requestId);

    return url.toString();
  }

  private extractRequests(host: unknown): unknown[] {
    const directRequestArrays = this.readDirectRequestArrays(host);
    const domRequests = this.extractRequestsFromDom();

    if (directRequestArrays.length > 0) {
      return [...directRequestArrays, ...domRequests];
    }

    return [
      ...(this.findRequestArray(host, 0, new WeakSet<object>()) ?? []),
      ...domRequests,
    ];
  }

  private readDirectRequestArrays(host: unknown): unknown[] {
    const directPaths = [
      ['requestsService', 'requestsDisplay'],
      ['requestsService', 'requests'],
      ['requestsDisplay'],
      ['displayedRequests'],
      ['requests'],
      ['requestList'],
      ['requestsList'],
      ['items'],
    ];

    for (const path of directPaths) {
      const value = this.readPath(host, path);

      if (Array.isArray(value) && value.some(item => this.looksLikeRequest(item))) {
        return value;
      }
    }

    return [];
  }

  private extractRequestsFromDom(): unknown[] {
    const root = this.findRequestsRoot();

    if (!root) {
      return [];
    }

    const requestRows = new Set<HTMLElement>();
    const candidates = Array.from(root.querySelectorAll<HTMLElement>(
      'a, button, span, div, p, li, article, section, tr',
    ));

    for (const candidate of candidates) {
      if (this.elementRef.nativeElement.contains(candidate)) {
        continue;
      }

      if (!/request\s*id\s*:/i.test(candidate.textContent ?? '')) {
        continue;
      }

      const row = this.findLikelyRequestContainer(candidate, root);

      if (row && !this.elementRef.nativeElement.contains(row)) {
        requestRows.add(row);
      }
    }

    return Array.from(requestRows)
      .map(row => this.requestFromDomRow(row))
      .filter((request): request is Record<string, string> => request !== null);
  }

  private requestFromDomRow(row: HTMLElement): Record<string, string> | null {
    const rowText = this.normalizeWhitespace(row.textContent ?? '');
    const requestIdMatch = rowText.match(/request\s*id\s*:\s*([^\s]+)/i);
    const requestId = requestIdMatch?.[1] ?? '';
    const status = this.findStatusFromDomRow(row);
    const title = this.findTitleFromDomRow(row);

    if (!requestId || !status) {
      return null;
    }

    return {
      requestId,
      title: title || 'Requested item',
      status,
    };
  }

  private findLikelyRequestContainer(candidate: HTMLElement, root: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = candidate;
    let depth = 0;

    while (current && current !== root && depth < 8) {
      const text = current.textContent ?? '';

      if (
        /request\s*id\s*:/i.test(text)
        && this.findStatusFromDomRow(current)
        && this.findTitleFromDomRow(current)
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return this.findNearestRequestRow(candidate, root);
  }

  private findStatusFromDomRow(row: HTMLElement): string {
    const textCandidates = Array.from(row.querySelectorAll<HTMLElement>('span, div, p, a, button'))
      .map(element => this.normalizeWhitespace(element.textContent ?? ''))
      .filter(text => text.length > 0)
      .sort((left, right) => left.length - right.length);

    return textCandidates.find(text => this.statusIsEligible(text))
      ?? textCandidates.find(text => /^request\./i.test(text))
      ?? '';
  }

  private findTitleFromDomRow(row: HTMLElement): string {
    const linkTitles = Array.from(row.querySelectorAll<HTMLAnchorElement>('a'))
      .map(link => this.normalizeWhitespace(link.textContent ?? ''))
      .filter(text => text.length > 0 && !/^cancel$/i.test(text));

    if (linkTitles.length > 0) {
      return linkTitles[0];
    }

    const titleCandidate = Array.from(row.querySelectorAll<HTMLElement>('[class*="title"], h1, h2, h3, h4'))
      .map(element => this.normalizeWhitespace(element.textContent ?? ''))
      .find(text => text.length > 0);

    return titleCandidate ?? '';
  }

  private readPath(source: unknown, path: string[]): unknown {
    let current = source;

    for (const key of path) {
      if (!this.isRecord(current)) {
        return null;
      }

      current = current[key];
    }

    return current;
  }

  private findRequestArray(source: unknown, depth: number, seen: WeakSet<object>): unknown[] | null {
    if (Array.isArray(source)) {
      return source.some(item => this.looksLikeRequest(item)) ? source : null;
    }

    if (!this.isRecord(source) || depth >= 4) {
      return null;
    }

    const sourceObject = source as object;

    if (seen.has(sourceObject)) {
      return null;
    }

    seen.add(sourceObject);

    for (const key of Object.keys(source).slice(0, 80)) {
      if (this.shouldSkipRecursiveKey(key)) {
        continue;
      }

      let child: unknown;

      try {
        child = source[key];
      } catch {
        continue;
      }

      const found = this.findRequestArray(child, depth + 1, seen);

      if (found) {
        return found;
      }
    }

    return null;
  }

  private shouldSkipRecursiveKey(key: string): boolean {
    return key === '__ngContext__'
      || key === 'router'
      || key === 'store'
      || key === 'document'
      || key === 'window'
      || key === 'elementRef'
      || key === 'changeDetectorRef';
  }

  private looksLikeRequest(value: unknown): boolean {
    if (!this.isRecord(value)) {
      return false;
    }

    const hasIdentifier = this.textFromFirst(value, [
      'requestId',
      'requestID',
      'request_id',
      'id',
    ]).length > 0;
    const hasTitleAndStatus = this.textFromFirst(value, ['title', 'displayTitle', 'recordTitle', 'itemTitle']).length > 0
      && this.textFromFirst(value, ['status', 'statusText', 'displayStatus', 'requestStatus']).length > 0;

    return hasIdentifier || hasTitleAndStatus;
  }

  private textFromFirst(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const text = this.valueToText(record[key]).trim();

      if (text.length > 0) {
        return text;
      }
    }

    return '';
  }

  private valueToText(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.valueToText(item)).filter(text => text.length > 0).join(' ');
    }

    if (this.isRecord(value)) {
      return this.textFromFirst(value, [
        'display',
        'desc',
        'description',
        'label',
        'value',
        'code',
        'name',
      ]);
    }

    return '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private startPolling(): void {
    this.ngZone.runOutsideAngular(() => {
      this.pollHandle = window.setInterval(() => {
        this.ngZone.run(() => this.refreshRequests());
      }, this.config.refreshIntervalMs);
    });
  }

  private observeRequestDom(): void {
    if (this.mutationObserver) {
      return;
    }

    const target = this.document.querySelector(this.config.observerSelector)
      ?? this.elementRef.nativeElement.parentElement;

    if (!target) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.mutationObserver = new MutationObserver(() => {
        this.ngZone.run(() => this.refreshRequests());
      });
      this.mutationObserver.observe(target, {
        childList: true,
        attributes: true,
        subtree: true,
      });
    });
  }

  private scheduleInlinePlacement(): void {
    if (this.config.placement === 'section' || !this.config.enabled || !this.isConfigured()) {
      return;
    }

    if (this.inlinePlacementHandle !== null) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.inlinePlacementHandle = window.setTimeout(() => {
        this.inlinePlacementHandle = null;
        this.ngZone.run(() => this.syncInlinePlacement());
      }, 100);
    });
  }

  private syncInlinePlacement(): void {
    if (this.config.placement === 'section') {
      return;
    }

    const root = this.findRequestsRoot();

    if (!root) {
      this.inlinePlacedRequestIds.clear();
      this.changeDetector.markForCheck();
      return;
    }

    const validRequestIds = new Set(this.qrRequests.map(request => request.requestId));
    const placedRequestIds = new Set<string>();

    this.removeInlineQrElements(validRequestIds);

    for (const request of this.qrRequests) {
      const existing = this.findExistingInlineQr(root, request.requestId);

      if (existing) {
        placedRequestIds.add(request.requestId);
        continue;
      }

      const row = this.findRequestRow(root, request.title);

      if (!row) {
        continue;
      }

      const inlineQr = this.createInlineQrElement(request);
      const actionAnchor = this.findActionAnchor(row);

      if (actionAnchor?.parentElement) {
        actionAnchor.parentElement.insertBefore(inlineQr, actionAnchor);
      } else {
        row.appendChild(inlineQr);
      }

      placedRequestIds.add(request.requestId);
    }

    this.inlinePlacedRequestIds = placedRequestIds;
    this.changeDetector.markForCheck();
  }

  private findRequestsRoot(): HTMLElement | null {
    const configuredRoot = this.document.querySelector(this.config.observerSelector);

    if (configuredRoot instanceof HTMLElement) {
      return configuredRoot;
    }

    const parent = this.elementRef.nativeElement.parentElement;

    return parent instanceof HTMLElement ? parent : null;
  }

  private findExistingInlineQr(root: HTMLElement, requestId: string): HTMLElement | null {
    const elements = Array.from(root.querySelectorAll<HTMLElement>('.self-collection-qr-inline'));

    return elements.find(element => element.dataset['requestId'] === requestId) ?? null;
  }

  private findRequestRow(root: HTMLElement, title: string): HTMLElement | null {
    const normalizedTitle = this.normalizeText(title);

    if (!normalizedTitle) {
      return null;
    }

    const titleCandidates = Array.from(root.querySelectorAll<HTMLElement>(
      'a, h1, h2, h3, h4, [class*="title"], span, div',
    ));

    for (const candidate of titleCandidates) {
      if (this.elementRef.nativeElement.contains(candidate)) {
        continue;
      }

      const candidateText = this.normalizeText(candidate.textContent ?? '');

      if (candidateText !== normalizedTitle && !candidateText.includes(normalizedTitle)) {
        continue;
      }

      const row = this.findNearestRequestRow(candidate, root);

      if (row) {
        return row;
      }
    }

    return null;
  }

  private findNearestRequestRow(candidate: HTMLElement, root: HTMLElement): HTMLElement | null {
    try {
      const selectorMatch = candidate.closest(this.config.rowSelector);

      if (
        selectorMatch instanceof HTMLElement
        && selectorMatch !== root
        && root.contains(selectorMatch)
        && !this.elementRef.nativeElement.contains(selectorMatch)
      ) {
        return selectorMatch;
      }
    } catch {
      // A tenant override can provide rowSelector. If it is invalid, fall back to parent traversal.
    }

    let current = candidate.parentElement;
    let depth = 0;

    while (current && current !== root && depth < 6) {
      if (!this.elementRef.nativeElement.contains(current)) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  private findActionAnchor(row: HTMLElement): HTMLElement | null {
    const actionSelectors = [
      'button[aria-label*="Cancel" i]',
      'button[title*="Cancel" i]',
      'a[role="button"][aria-label*="Cancel" i]',
      'a[role="button"][title*="Cancel" i]',
    ];

    for (const selector of actionSelectors) {
      const action = row.querySelector(selector);

      if (action instanceof HTMLElement && !action.classList.contains('self-collection-qr-inline')) {
        return action;
      }
    }

    return null;
  }

  private createInlineQrElement(request: SelfCollectionRequest): HTMLElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'self-collection-qr-inline';
    button.dataset['requestId'] = request.requestId;
    button.setAttribute('aria-label', `${this.config.imageAlt} for ${request.title}`);
    button.setAttribute('style', [
      'align-items:center',
      'appearance:none',
      'background:#f8fafc',
      'border:1px solid rgba(15,23,42,0.18)',
      'border-radius:8px',
      'cursor:pointer',
      'display:inline-flex',
      'float:right',
      'height:104px',
      'justify-content:center',
      'margin-left:auto',
      'padding:8px',
      'width:104px',
      'flex:0 0 auto',
    ].join(';'));

    const image = this.document.createElement('img');
    image.src = request.qrUrl;
    image.alt = `${this.config.imageAlt} for ${request.title}`;
    image.setAttribute('style', 'display:block;height:88px;object-fit:contain;width:88px');

    if (this.config.crossOrigin) {
      image.crossOrigin = this.config.crossOrigin;
    }

    image.addEventListener('error', () => {
      this.ngZone.run(() => this.markInlineQrUnavailable(button, request));
    });

    button.addEventListener('click', () => {
      this.ngZone.run(() => this.openQr(request));
    });
    button.appendChild(image);

    return button;
  }

  private markInlineQrUnavailable(button: HTMLElement, request: SelfCollectionRequest): void {
    this.failedRequestIds.add(request.requestId);
    button.textContent = this.config.unavailableText;
    button.setAttribute('style', `${button.getAttribute('style') ?? ''};color:#6b7280;font-size:12px;line-height:1.25;text-align:center`);
    this.changeDetector.markForCheck();
  }

  private removeInlineQrElements(validRequestIds: Set<string> | null = null): void {
    const elements = Array.from(this.document.querySelectorAll<HTMLElement>('.self-collection-qr-inline'));

    for (const element of elements) {
      const requestId = element.dataset['requestId'];

      if (!validRequestIds || !requestId || !validRequestIds.has(requestId)) {
        element.remove();
      }
    }
  }

  private normalizeText(text: string): string {
    return this.normalizeWhitespace(text).toLowerCase();
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}

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
  [key: string]: unknown;
  enabled?: unknown;
  debug?: unknown;
  placement?: unknown;
  showSectionFallback?: unknown;
  serviceUrl?: unknown;
  qrUrlTemplate?: unknown;
  queryParamA?: unknown;
  queryParamB?: unknown;
  queryparamA?: unknown;
  queryparamB?: unknown;
  a?: unknown;
  b?: unknown;
  paramAName?: unknown;
  paramBName?: unknown;
  requestIdParamName?: unknown;
  eligibleStatus?: unknown;
  eligibleStatuses?: unknown;
  heading?: unknown;
  subheading?: unknown;
  imageAlt?: unknown;
  unavailableText?: unknown;
  observerSelector?: unknown;
  rowSelector?: unknown;
  refreshIntervalMs?: unknown;
  crossOrigin?: unknown;
}

interface SelfCollectionQrModuleParameters extends RawSelfCollectionQrConfig {
  selfCollectionQr?: RawSelfCollectionQrConfig | string;
}

interface SelfCollectionQrConfig {
  enabled: boolean;
  debug: boolean;
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
  'nde-request-item',
  'prm-request-item',
  '.request-item-container',
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
    this.debugLog('hostComponent received', {
      hostKeys: this.describeKeys(value),
    });
    this.debugHostComponent(value);
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
  private lastDebugSignature = '';
  private lastInlinePlacementDebugSignature = '';
  private lastHostDebugSignature = '';

  constructor(
    @Optional() @Inject('MODULE_PARAMETERS') moduleParameters: SelfCollectionQrModuleParameters | null,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly ngZone: NgZone,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.config = this.buildConfig(moduleParameters);
    this.debugLog('initialized', {
      config: this.configForLog(),
      moduleParameterKeys: this.describeKeys(moduleParameters),
    });
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
    const raw = this.normaliseRawConfig(moduleParameters?.selfCollectionQr ?? moduleParameters ?? {});
    const eligibleStatuses = this.readStringList(
      raw.eligibleStatuses ?? raw.eligibleStatus,
      DEFAULT_ELIGIBLE_STATUSES,
    );

    return {
      enabled: this.readBoolean(raw.enabled, true),
      debug: this.readBoolean(raw.debug, false),
      placement: this.readPlacement(raw.placement, 'inline'),
      showSectionFallback: this.readBoolean(raw.showSectionFallback, true),
      serviceUrl: this.readString(raw.serviceUrl, DEFAULT_SERVICE_URL),
      qrUrlTemplate: this.readString(raw.qrUrlTemplate, ''),
      queryParamA: this.readString(raw.queryParamA ?? raw.queryparamA ?? raw.a, ''),
      queryParamB: this.readString(raw.queryParamB ?? raw.queryparamB ?? raw.b, ''),
      paramAName: this.readString(raw.paramAName, 'a'),
      paramBName: this.readString(raw.paramBName, 'b'),
      requestIdParamName: this.readString(raw.requestIdParamName, 'c'),
      eligibleStatuses,
      heading: this.readString(raw.heading, 'Self-collection QR'),
      subheading: this.readString(raw.subheading, 'Scan at the self-collection kiosk.'),
      imageAlt: this.readString(raw.imageAlt, 'Self-collection QR code'),
      unavailableText: this.readString(raw.unavailableText, 'QR unavailable'),
      observerSelector: this.readString(raw.observerSelector, 'nde-requests, prm-requests'),
      rowSelector: this.readString(raw.rowSelector, DEFAULT_ROW_SELECTOR),
      refreshIntervalMs: Math.max(this.readNumber(raw.refreshIntervalMs, 1000), 250),
      crossOrigin: this.readCrossOrigin(raw.crossOrigin, ''),
    };
  }

  private normaliseRawConfig(value: unknown): RawSelfCollectionQrConfig {
    if (typeof value === 'string') {
      return this.parseConfigString(value);
    }

    if (!this.isRecord(value)) {
      return {};
    }

    const config: RawSelfCollectionQrConfig = {};

    for (const [key, entryValue] of Object.entries(value)) {
      config[key] = typeof entryValue === 'string'
        ? this.parseConfigScalar(entryValue)
        : entryValue;
    }

    return config;
  }

  private parseConfigString(value: string): RawSelfCollectionQrConfig {
    const trimmed = value.trim();

    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (this.isRecord(parsed)) {
        return this.normaliseRawConfig(parsed);
      }
    } catch {
      // Alma Add-On Configuration can pass object parameters as "{key=value}" strings.
    }

    const body = trimmed.startsWith('{') && trimmed.endsWith('}')
      ? trimmed.slice(1, -1)
      : trimmed;
    const config: RawSelfCollectionQrConfig = {};

    for (const part of this.splitTopLevel(body, ',')) {
      const separatorIndex = this.findTopLevelSeparator(part, '=');

      if (separatorIndex < 0) {
        continue;
      }

      const key = part.slice(0, separatorIndex).trim();
      const entryValue = part.slice(separatorIndex + 1).trim();

      if (key) {
        config[key] = this.parseConfigScalar(entryValue);
      }
    }

    return config;
  }

  private parseConfigScalar(value: string): unknown {
    const trimmed = this.stripMatchingQuotes(value.trim());

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return this.splitTopLevel(trimmed.slice(1, -1), ',')
        .map(item => this.stripMatchingQuotes(item.trim()))
        .filter(item => item.length > 0);
    }

    if (/^true$/i.test(trimmed)) {
      return true;
    }

    if (/^false$/i.test(trimmed)) {
      return false;
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    return trimmed;
  }

  private splitTopLevel(value: string, separator: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let squareDepth = 0;
    let curlyDepth = 0;
    let quote: string | null = null;

    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      const previous = index > 0 ? value[index - 1] : '';

      if (quote) {
        if (character === quote && previous !== '\\') {
          quote = null;
        }

        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }

      if (character === '[') {
        squareDepth += 1;
        continue;
      }

      if (character === ']') {
        squareDepth = Math.max(squareDepth - 1, 0);
        continue;
      }

      if (character === '{') {
        curlyDepth += 1;
        continue;
      }

      if (character === '}') {
        curlyDepth = Math.max(curlyDepth - 1, 0);
        continue;
      }

      if (character === separator && squareDepth === 0 && curlyDepth === 0) {
        parts.push(value.slice(start, index));
        start = index + 1;
      }
    }

    parts.push(value.slice(start));

    return parts;
  }

  private findTopLevelSeparator(value: string, separator: string): number {
    let squareDepth = 0;
    let curlyDepth = 0;
    let quote: string | null = null;

    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      const previous = index > 0 ? value[index - 1] : '';

      if (quote) {
        if (character === quote && previous !== '\\') {
          quote = null;
        }

        continue;
      }

      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }

      if (character === '[') {
        squareDepth += 1;
        continue;
      }

      if (character === ']') {
        squareDepth = Math.max(squareDepth - 1, 0);
        continue;
      }

      if (character === '{') {
        curlyDepth += 1;
        continue;
      }

      if (character === '}') {
        curlyDepth = Math.max(curlyDepth - 1, 0);
        continue;
      }

      if (character === separator && squareDepth === 0 && curlyDepth === 0) {
        return index;
      }
    }

    return -1;
  }

  private stripMatchingQuotes(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  private readString(value: unknown, fallback: string): string {
    const text = this.scalarValueToText(value).trim();

    return text.length > 0 ? text : fallback;
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (/^true$/i.test(value.trim())) {
        return true;
      }

      if (/^false$/i.test(value.trim())) {
        return false;
      }
    }

    return fallback;
  }

  private readNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private readStringList(value: unknown, fallback: string[]): string[] {
    const values = Array.isArray(value) ? value : [value ?? fallback].flat();

    return values
      .flatMap(entry => this.scalarValueToText(entry).split(','))
      .map(status => status.trim())
      .filter(status => status.length > 0);
  }

  private readPlacement(value: unknown, fallback: SelfCollectionQrPlacement): SelfCollectionQrPlacement {
    const placement = this.scalarValueToText(value).trim();

    return placement === 'inline' || placement === 'section' || placement === 'both'
      ? placement
      : fallback;
  }

  private readCrossOrigin(
    value: unknown,
    fallback: '' | 'anonymous' | 'use-credentials',
  ): '' | 'anonymous' | 'use-credentials' {
    const crossOrigin = this.scalarValueToText(value).trim();

    return crossOrigin === '' || crossOrigin === 'anonymous' || crossOrigin === 'use-credentials'
      ? crossOrigin
      : fallback;
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

    this.debugRequestExtraction(extractedRequests, qrRequests, signature);
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
      'request-id',
      'requestIdentifier',
      'requestNumber',
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
    const recursiveRequestArrays = directRequestArrays.length > 0
      ? []
      : this.findRequestArrays(host, 0, new WeakSet<object>(), []);

    if (directRequestArrays.length > 0) {
      return [...directRequestArrays, ...domRequests];
    }

    return [
      ...recursiveRequestArrays.flat(),
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

      const candidateText = candidate.textContent ?? '';

      if (!/request\s*id\s*:/i.test(candidateText) && !this.statusIsEligible(candidateText)) {
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
    const requestId = this.findRequestIdFromDomRow(row);
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
        (/request\s*id\s*:/i.test(text) || this.statusIsEligible(text) || this.findRequestIdFromDomRow(current))
        && this.findStatusFromDomRow(current)
        && this.findTitleFromDomRow(current)
      ) {
        return this.findSemanticRequestRow(current, root) ?? current;
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

  private findRequestIdFromDomRow(row: HTMLElement): string {
    const rowText = this.normalizeWhitespace(row.textContent ?? '');
    const textMatch = rowText.match(/request\s*id\s*:\s*([^\s]+)/i);

    if (textMatch?.[1]) {
      return textMatch[1];
    }

    const elements = [row, ...Array.from(row.querySelectorAll<HTMLElement>('*'))];

    for (const element of elements) {
      for (const attributeName of element.getAttributeNames()) {
        const attributeValue = element.getAttribute(attributeName) ?? '';
        const normalizedName = this.normalizeFieldKey(attributeName);

        if (normalizedName.includes('requestid') && attributeValue.trim().length > 0) {
          return attributeValue.trim();
        }

        const attributeMatch = attributeValue.match(/(?:requestId|request_id|request-id|request\s*id)\s*[:=]\s*([^&\s"']+)/i)
          ?? attributeValue.match(/[?&](?:requestId|request_id|request-id)=([^&\s"']+)/i);

        if (attributeMatch?.[1]) {
          return decodeURIComponent(attributeMatch[1]);
        }
      }
    }

    return '';
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

  private findRequestArrays(
    source: unknown,
    depth: number,
    seen: WeakSet<object>,
    arrays: unknown[][],
  ): unknown[][] {
    if (Array.isArray(source)) {
      if (source.some(item => this.looksLikeRequest(item))) {
        arrays.push(source);
      }

      return arrays;
    }

    if (!this.isRecord(source) || depth >= 4) {
      return arrays;
    }

    const sourceObject = source as object;

    if (seen.has(sourceObject)) {
      return arrays;
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

      this.findRequestArrays(child, depth + 1, seen, arrays);
    }

    return arrays;
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
      'request-id',
      'requestIdentifier',
      'requestNumber',
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

    return this.findTextByKey(record, keys, 0, new WeakSet<object>());
  }

  private findTextByKey(source: unknown, keys: string[], depth: number, seen: WeakSet<object>): string {
    if (!this.isRecord(source) || depth > 5) {
      return '';
    }

    const sourceObject = source as object;

    if (seen.has(sourceObject)) {
      return '';
    }

    seen.add(sourceObject);

    const normalizedKeys = new Set(keys.map(key => this.normalizeFieldKey(key)));

    for (const [key, value] of Object.entries(source)) {
      if (this.shouldSkipRecursiveKey(key)) {
        continue;
      }

      if (normalizedKeys.has(this.normalizeFieldKey(key))) {
        const text = this.scalarValueToText(value).trim();

        if (text.length > 0) {
          return text;
        }
      }
    }

    for (const [key, value] of Object.entries(source)) {
      if (this.shouldSkipRecursiveKey(key)) {
        continue;
      }

      const text = this.findTextByKey(value, keys, depth + 1, seen);

      if (text.length > 0) {
        return text;
      }
    }

    return '';
  }

  private scalarValueToText(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.scalarValueToText(item)).filter(text => text.length > 0).join(' ');
    }

    if (this.isRecord(value)) {
      for (const key of ['display', 'desc', 'description', 'label', 'value', 'code', 'name']) {
        const text = this.scalarValueToText(value[key]).trim();

        if (text.length > 0) {
          return text;
        }
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

      const row = this.findRequestRow(root, request);

      if (!row) {
        continue;
      }

      const inlineQr = this.createInlineQrElement(request);
      const placementTarget = this.findInlinePlacementTarget(row);

      if (placementTarget) {
        placementTarget.container.insertBefore(inlineQr, placementTarget.before);
      } else {
        row.appendChild(inlineQr);
      }

      if (inlineQr.isConnected) {
        placedRequestIds.add(request.requestId);
      }
    }

    this.inlinePlacedRequestIds = placedRequestIds;
    this.debugInlinePlacement(validRequestIds, placedRequestIds);
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

  private findRequestRow(root: HTMLElement, request: SelfCollectionRequest): HTMLElement | null {
    return this.findRequestRowByRequestId(root, request.requestId)
      ?? this.findRequestRowByTitle(root, request.title);
  }

  private findRequestRowByRequestId(root: HTMLElement, requestId: string): HTMLElement | null {
    const normalizedRequestId = this.normalizeWhitespace(requestId);

    if (!normalizedRequestId) {
      return null;
    }

    const candidates = Array.from(root.querySelectorAll<HTMLElement>(
      '[data-qa*="request_id" i], [data-qa*="request-id" i], [data-request-id], span, div, p, a, button',
    ));

    for (const candidate of candidates) {
      if (this.elementRef.nativeElement.contains(candidate)) {
        continue;
      }

      const candidateRequestId = this.findRequestIdFromDomRow(candidate);
      const candidateText = this.normalizeWhitespace(candidate.textContent ?? '');
      const candidateLooksLikeRequestIdField = /request\s*id\s*:/i.test(candidateText)
        || /request[_-]?id/i.test(candidate.getAttribute('data-qa') ?? '')
        || candidate.hasAttribute('data-request-id');

      if (
        candidateRequestId !== normalizedRequestId
        && !(candidateLooksLikeRequestIdField && this.textContainsToken(candidateText, normalizedRequestId))
      ) {
        continue;
      }

      const row = this.findNearestRequestRow(candidate, root);

      if (row) {
        return row;
      }
    }

    return null;
  }

  private findRequestRowByTitle(root: HTMLElement, title: string): HTMLElement | null {
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
    const semanticRow = this.findSemanticRequestRow(candidate, root);

    if (semanticRow) {
      return semanticRow;
    }

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

  private findSemanticRequestRow(candidate: HTMLElement, root: HTMLElement): HTMLElement | null {
    const selectors = [
      'nde-request-item',
      'prm-request-item',
      '.request-item-container',
      '[data-qa="requests-item"]',
    ];

    for (const selector of selectors) {
      const row = candidate.closest(selector);

      if (
        row instanceof HTMLElement
        && row !== root
        && root.contains(row)
        && !this.elementRef.nativeElement.contains(row)
      ) {
        return row;
      }
    }

    return null;
  }

  private findActionAnchor(row: HTMLElement): HTMLElement | null {
    const actionSelectors = [
      'button[data-qa="request-item-cancel-btn"]',
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

  private findInlinePlacementTarget(row: HTMLElement): { container: HTMLElement; before: ChildNode | null } | null {
    const actionAnchor = this.findActionAnchor(row);

    if (actionAnchor?.parentElement) {
      return {
        container: actionAnchor.parentElement,
        before: actionAnchor.nextSibling,
      };
    }

    const actionContainer = row.querySelector<HTMLElement>(
      '[data-qa="requests_actions_container"], .request-actions',
    );

    if (actionContainer) {
      return {
        container: actionContainer,
        before: null,
      };
    }

    const requestContainer = row.querySelector<HTMLElement>('.request-item-container');

    if (requestContainer) {
      return {
        container: requestContainer,
        before: null,
      };
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
      'margin:8px 0 0 16px',
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

  private textContainsToken(text: string, token: string): boolean {
    return new RegExp(`(^|\\D)${this.escapeRegExp(token)}($|\\D)`).test(text);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private normalizeFieldKey(key: string): string {
    return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  private describeKeys(value: unknown): string[] {
    if (!this.isRecord(value)) {
      return [];
    }

    return Object.keys(value).slice(0, 40);
  }

  private debugHostComponent(host: unknown): void {
    if (!this.config.debug) {
      return;
    }

    const candidates = this.collectHostArrayCandidates(host);
    const signature = JSON.stringify({
      hostKeys: this.describeKeys(host),
      candidates,
    });

    if (signature === this.lastHostDebugSignature) {
      return;
    }

    this.lastHostDebugSignature = signature;
    this.debugLog('host component data candidates', {
      hostKeys: this.describeKeys(host),
      candidates,
    });
  }

  private collectHostArrayCandidates(host: unknown): Array<Record<string, unknown>> {
    const candidates: Array<Record<string, unknown>> = [];

    this.visitHostArrayCandidates(host, [], 0, new WeakSet<object>(), candidates);

    return candidates;
  }

  private visitHostArrayCandidates(
    source: unknown,
    path: string[],
    depth: number,
    seen: WeakSet<object>,
    candidates: Array<Record<string, unknown>>,
  ): void {
    if (candidates.length >= 20) {
      return;
    }

    if (Array.isArray(source)) {
      const sample = source.find(item => this.isRecord(item)) as Record<string, unknown> | undefined;

      if (!sample) {
        return;
      }

      const pathText = path.join('.') || '<root>';
      const sampleKeys = this.describeKeys(sample);
      const requestLike = source.some(item => this.looksLikeRequest(item));
      const pathLooksRelevant = /request|hold|booking|item/i.test(pathText);
      const sampleLooksRelevant = sampleKeys.some(key => /request|hold|booking|status|title|item/i.test(key));

      if (requestLike || pathLooksRelevant || sampleLooksRelevant) {
        candidates.push({
          path: pathText,
          length: source.length,
          requestLike,
          sampleKeys,
          sampleRequestId: this.textFromFirst(sample, [
            'requestId',
            'requestID',
            'request_id',
            'request-id',
            'requestIdentifier',
            'requestNumber',
            'id',
          ]),
          sampleTitle: this.textFromFirst(sample, [
            'title',
            'displayTitle',
            'recordTitle',
            'itemTitle',
          ]),
          sampleStatus: this.textFromFirst(sample, [
            'status',
            'statusText',
            'displayStatus',
            'requestStatus',
          ]),
        });
      }

      return;
    }

    if (!this.isRecord(source) || depth >= 4) {
      return;
    }

    const sourceObject = source as object;

    if (seen.has(sourceObject)) {
      return;
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

      this.visitHostArrayCandidates(child, [...path, key], depth + 1, seen, candidates);
    }
  }

  private configForLog(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      placement: this.config.placement,
      showSectionFallback: this.config.showSectionFallback,
      hasQrUrlTemplate: this.config.qrUrlTemplate.trim().length > 0,
      hasQueryParamA: this.config.queryParamA.trim().length > 0,
      hasQueryParamB: this.config.queryParamB.trim().length > 0,
      eligibleStatuses: this.config.eligibleStatuses,
      observerSelector: this.config.observerSelector,
      rowSelector: this.config.rowSelector,
      crossOrigin: this.config.crossOrigin,
    };
  }

  private debugInlinePlacement(validRequestIds: Set<string>, placedRequestIds: Set<string>): void {
    if (!this.config.debug) {
      return;
    }

    const missingRequestIds = Array.from(validRequestIds)
      .filter(requestId => !placedRequestIds.has(requestId));
    const signature = [
      Array.from(placedRequestIds).join(','),
      missingRequestIds.join(','),
    ].join('|');

    if (signature === this.lastInlinePlacementDebugSignature) {
      return;
    }

    this.lastInlinePlacementDebugSignature = signature;
    this.debugLog('inline placement', {
      placedRequestIds: Array.from(placedRequestIds),
      missingRequestIds,
    });
  }

  private debugRequestExtraction(
    extractedRequests: unknown[],
    qrRequests: SelfCollectionRequest[],
    signature: string,
  ): void {
    if (!this.config.debug) {
      return;
    }

    const debugSignature = [
      extractedRequests.length,
      qrRequests.length,
      signature,
      this.isConfigured(),
      this.describeKeys(this.host).join(','),
    ].join('|');

    if (debugSignature === this.lastDebugSignature) {
      return;
    }

    this.lastDebugSignature = debugSignature;
    this.debugLog('request extraction', {
      isConfigured: this.isConfigured(),
      rawRequestCount: extractedRequests.length,
      qrRequestCount: qrRequests.length,
      hostKeys: this.describeKeys(this.host),
      qrRequests: qrRequests.map(request => ({
        requestId: request.requestId,
        title: request.title,
        status: request.status,
      })),
    });
  }

  private debugLog(message: string, details?: unknown): void {
    if (!this.config?.debug) {
      return;
    }

    console.info(`[SelfCollectionQr] ${message}`, details ?? '');
  }
}

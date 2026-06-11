# Self-Collection QR Add-On

This add-on recreates the previous Primo behavior for self-collection locker QR codes in the NDE Requests tab.

## Behavior

- Reads the host Requests component through the NDE `hostComponent` input.
- Filters requests whose status contains a ready-for-collection label such as `On Hold Shelf`, `Available for Pickup`, or `Ready for Collection`.
- Builds the locker service image URL with query parameters `a`, `b`, and `c`, where `c` is the Primo request ID.
- Places the QR code inline on the matching request row when the NDE markup exposes a row anchor.
- Shows a fallback QR card per eligible request if the inline row cannot be found.

## Alma Add-On Parameters

Keep locker service secrets in Alma add-on configuration, not in source control.

```json
{
  "selfCollectionQr": {
    "serviceUrl": "https://lockerwebservice.message.sg/npa_ws/apiPublic.aspx",
    "queryParamA": "<locker-service-a-token>",
    "queryParamB": "<locker-service-b-token>",
    "eligibleStatuses": ["On Hold Shelf", "Available for Pickup", "Ready for Collection"],
    "placement": "inline",
    "showSectionFallback": true,
    "heading": "Self-collection QR",
    "subheading": "Scan at the self-collection kiosk."
  }
}
```

If the NDE Requests customization hook differs in a tenant, update `REQUESTS_TAB_SELECTOR` in `src/app/custom1-module/customComponentMappings.ts`.

If the NDE request row markup differs, keep the add-on hook as-is and override `rowSelector` in Alma parameters with a selector that matches one request row.

## Preferred Deployment Mode

Prefer Alma **Add-On Configuration** when available. This matches the PayNow-style deployment model:

- Build the project with `npm run build`.
- Host the built static folder, for example `dist/65SPO_NP-NP_NDE/`, on an HTTPS location that Primo can reach.
- In Alma Add-On Configuration, set the add-on name to `primo_nde_self_collection_qr`.
- Use the hosted folder URL as the add-on URL. If Alma asks for a full remote entry URL instead of a folder URL, use the same hosted path ending in `/remoteEntry.js`.
- Put test or production JSON in Alma configuration parameters.

The add-on already reads Alma parameters through `MODULE_PARAMETERS`, so no rebuild is needed when switching between placeholder QR testing and the real locker service, as long as the Alma Add-On Configuration flow is used.

### Placeholder Test Configuration

```json
{
  "selfCollectionQr": {
    "qrUrlTemplate": "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={requestId}",
    "eligibleStatuses": ["On Hold Shelf"]
  }
}
```

### Production Locker Configuration

```json
{
  "selfCollectionQr": {
    "serviceUrl": "https://lockerwebservice.message.sg/npa_ws/apiPublic.aspx",
    "queryParamA": "<locker-service-a-token>",
    "queryParamB": "<locker-service-b-token>",
    "eligibleStatuses": ["On Hold Shelf"]
  }
}
```

## Customization Package Fallback

Use **Manage Customization Package** only when the NDE add-on configuration path is unavailable. This route is simpler to upload because it accepts `dist/65SPO_NP-NP_NDE.zip`, but it is less convenient for operations because configuration cannot be changed as cleanly as Alma add-on JSON.

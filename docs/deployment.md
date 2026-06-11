# primo_nde_self_collection_qr Deployment Notes

## Hosted Add-On

Use hosted add-on deployment for this module. Alma stores the add-on URL and runtime JSON, while GitHub Pages serves the built JavaScript bundle.

Required hosting behavior:

- HTTPS URL reachable from patron browsers.
- Static serving of `remoteEntry.js`, JavaScript chunks, CSS, and assets.
- No authentication wall in front of the add-on bundle.
- CORS headers that allow Primo NDE to load the module.

## Alma Add-On Configuration

Use:

- Add-on name: `primo_nde_self_collection_qr`
- URL: `https://venkikannadasan.github.io/primo_nde_self_collection_qr/`

For placeholder QR testing:

```json
{
  "selfCollectionQr": {
    "qrUrlTemplate": "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={requestId}",
    "eligibleStatuses": ["On Hold Shelf"],
    "debug": true
  }
}
```

Alma may display the nested `selfCollectionQr` object as a single string such as `{qrUrlTemplate=..., eligibleStatuses=[On Hold Shelf], debug=true}` in the browser console. The add-on supports that serialized form as well as normal JSON-style objects.

Remove `"debug": true` after testing. When enabled, the browser console logs the host component keys, request extraction counts, and matched request IDs without printing locker tokens.

For production locker QR codes:

```json
{
  "selfCollectionQr": {
    "serviceUrl": "https://lockerwebservice.message.sg/npa_ws/apiPublic.aspx",
    "queryParamA": "<locker-service-a-token>",
    "queryParamB": "<locker-service-b-token>",
    "eligibleStatuses": ["On Hold Shelf"],
    "debug": false
  }
}
```

## Validation

Before production activation:

1. Confirm the NDE hook selector `nde-record-actions-bottom`, `nde-requests`, or `nde-requests-after` renders in the Requests tab.
2. Confirm ready requests expose a request ID through the host component or expanded row.
3. Confirm placeholder QR mode renders only for `On Hold Shelf` requests.
4. Confirm production locker mode returns a valid QR for a request that exists in the locker system.

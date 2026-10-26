# Clock-in photo: what the mobile app sends

**For:** backend team · **From:** Employee app (React Native) · **Status:** the app sends it today; the API does not store it yet.

## In one paragraph

When an employee clocks in from the app, the phone's camera opens and they take a photo. The app burns a location stamp onto the photo, compresses it to a small JPEG and sends it **inside the normal clock-in JSON body**, as a base64 data URI, next to `latitude`/`longitude`. There is no separate upload call and no multipart request. Clock-out and breaks do **not** send a photo. As far as we can tell the gateway currently drops unknown keys, so the photo is discarded today and the punch works as before. Turning it on is a backend change only.

## The request

`POST /attendance/clock-in` · `Content-Type: application/json` · `Authorization: Bearer <access token>`

| Field | Type | Always sent? | Meaning |
|---|---|---|---|
| `source` | `"mobile"` | yes | Where the punch came from |
| `client_timestamp` | ISO-8601 string | yes | Phone clock at the moment of sending |
| `work_mode` | `office` · `remote` · `field` | only for a hybrid contract | The mode the person picked |
| `latitude`, `longitude` | number | only when the phone got a GPS fix | Where they are |
| `photo` | string | only when a photo was taken | `data:image/jpeg;base64,<…>`, the stamped JPEG |
| `photo_captured_at` | ISO-8601 string | with `photo` | Phone clock when the shutter was pressed |
| `metadata.geo_accuracy` | number (metres) | with a GPS fix | Accuracy radius of the fix |
| `metadata.mock_location` | `true` | only when Android reports a mocked location | The fix came from a mock-location app |
| `metadata.punch_photo` | object | when the camera step ran | Facts about the photo, below |
| `device_proof` | object | when the org requires device trust | The signed device challenge (existing contract) |

`metadata.punch_photo`:

| Key | Type | Meaning |
|---|---|---|
| `captured_at` | ISO-8601 | Same as `photo_captured_at` |
| `width`, `height` | number | Size of the **original camera image**, not of the JPEG that was sent |
| `location_stamped` | boolean | `true` when the location stamp was burned in; `false` if stamping failed and the plain photo was sent |
| `address` | string | Present only when a street address was found (Google Geocoding, falling back to OpenStreetMap Nominatim, looked up on the phone) |
| `attached` | boolean | Whether `photo` is in this body. It can be `false`: see "When there is no photo" |

### Example

```json
{
  "source": "mobile",
  "client_timestamp": "2026-10-22T03:44:12.501Z",
  "latitude": 18.520431,
  "longitude": 73.856743,
  "photo": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD…",
  "photo_captured_at": "2026-10-22T03:44:05.118Z",
  "metadata": {
    "geo_accuracy": 14.2,
    "punch_photo": {
      "captured_at": "2026-10-22T03:44:05.118Z",
      "width": 1200,
      "height": 1600,
      "location_stamped": true,
      "address": "Shivaji Nagar, Pune, Maharashtra 411005",
      "attached": true
    }
  }
}
```

## The image itself

- **Format:** JPEG, quality 0.6, **720 px wide**, height kept in proportion (usually 720×960 portrait). That is about **60–120 KB**, or roughly **80–160 KB once base64-encoded**.
- **Hard cap on the phone:** if the base64 string is longer than **400,000 characters (≈300 KB of JPEG)**, the app does not send `photo` at all (`attached: false`). So no request carries a photo larger than that.
- **Source:** the back camera, through the system camera app. There is no gallery picker, so an old photo cannot be chosen. The photo is not saved to the phone's gallery.
- **The stamp is part of the pixels.** A band along the bottom of the image shows an OpenStreetMap tile with a pin, the address (or the coordinates when no address was found, or "Location not available" with no fix), the accuracy, the date and time, and the person's name. Any copy of the image carries it.

## When there is no photo

A missing photo must never stop someone clocking in, so the app sends the punch anyway in each of these cases:

| Situation | What the body has |
|---|---|
| The phone has no camera, or the camera can't open | No `photo`, no `metadata.punch_photo` |
| The person backs out of the camera | **Nothing is sent.** The clock-in is abandoned |
| Stamping failed | `photo` is the unstamped JPEG; `location_stamped: false` |
| The JPEG is over the 400,000-character cap | No `photo`; `metadata.punch_photo` is present with `attached: false` |

### The automatic retry, which your error responses can trigger

If the clock-in fails with **HTTP 413**, or with **HTTP 400** whose `message` contains `photo`, `payload`, `too large` or `entity`, the app **sends the same punch again without `photo`**. It tells the person they were clocked in without a photo. Two consequences:

- A body-size limit below ~200 KB on this route silently turns every photo punch into a no-photo punch.
- Don't use those words in an unrelated 400 from this endpoint, or the app will retry when it shouldn't.

## Trust: what the photo proves, and what it doesn't

- **The device signature does not cover the photo.** `device_proof` signs the challenge fields (`challenge_id`, `challenge`, `operation`, `device_id`, `user_id`, `org_id`), not the request body. A modified client could swap the image. If the photo needs to be tamper-evident, the challenge would have to include a hash of the photo, which needs changes on both sides.
- **`photo_captured_at` and `client_timestamp` come from the phone's clock** and can be set by hand. Use the server's receive time as the punch time. The two client times are only for comparing (a gap of many minutes between the shutter and the send is worth flagging).
- **Developer mode is blocked on Android.** Since 2026-10-21 the app refuses clock-in, clock-out and breaks while Android Developer options is on, because that is where mock locations and fake clocks are set. `metadata.mock_location: true` still arrives if Android flags a mocked fix some other way.
- **The address is resolved on the phone** from the same coordinates. Re-resolve it on the server if you need it to be authoritative.

## What the backend needs to do to keep it

What the app needs from the API, as we see it. The storage choices are yours.

1. **Accept the fields:** allow `photo`, `photo_captured_at` and `metadata.punch_photo` through request validation on `POST /attendance/clock-in`.
2. **Allow the size:** a body limit of at least **1 MB** on this route. The app's own cap keeps real requests under ~420 KB.
3. **Validate:** the string starts with `data:image/jpeg;base64,`, decodes cleanly, and the decoded bytes are a JPEG under ~350 KB. Reject anything else with a 400 that does **not** use the retry words above, so a bad image fails visibly instead of being dropped.
4. **Store it outside the database:** decode it, put it in object storage, and save a reference (`photo_url` or a key) on the clock-in attendance log. Base64 in a database row is ~33% bigger and slows every read of that table.
5. **Show it back:** return the reference on the clock-in entry of `GET /attendance/daily-log` (`logs[].photo_url`) and in the HR and manager daily-log reads. The web and both apps can then show it beside the punch. Use a short-lived signed URL if the bucket is private.
6. **Decide retention:** these are photos of people at their workplace. Agree how long to keep them, and say so in the org's privacy notice.

## Where this lives in the app

| What | File |
|---|---|
| Camera, stamp, compression, size cap | `src/features/attendance/components/PunchPhotoCapture.jsx` |
| Building the body, the no-photo retry | `src/features/attendance/components/PunchCard.jsx` (`sendClockIn`) |
| Coordinates and `geo_accuracy` / `mock_location` | `src/lib/location.js` (`locationPayload`) |
| `device_proof` | `src/features/devices/deviceKey.js` (`punchWithDeviceProof`) |
| Developer-mode block | `src/lib/developerMode.js` |

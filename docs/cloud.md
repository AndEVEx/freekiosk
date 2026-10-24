# FreeKiosk Cloud

FreeKiosk Cloud is an optional service that manages a fleet of FreeKiosk devices from a web
dashboard. **The app does not need it**: every kiosk feature, the REST API and the MQTT integration
work without an account, and nothing leaves the device until you enroll it.

- Status: **open beta**, self-service sign-up at [cloud.freekiosk.app](https://cloud.freekiosk.app).
- The app itself (`v2.0.0`) is stable.
- Prices and a calculator: [freekiosk.app/cloud](https://freekiosk.app/cloud).

## What it does

- **Fleet dashboard**: battery, network, screen and storage of every device, updated live, with an
  activity log you can export to CSV.
- **Remote commands** on one device, a group or the whole fleet.
- **Groups and configuration profiles**: apply the same settings to many devices.
- **Alerts and notifications** when a device changes state.
- **Remote screenshots** and **APK distribution** (paid licence, see [Pricing](#pricing-and-billing)).
- **Digital signage** (beta): playlists of videos, images, web pages and YouTube videos played by a
  screen, with schedules, see [Digital signage](digital-signage.md). It needs the app `2.1.0-beta.1`
  or later, available as a [GitHub pre-release](https://github.com/RushB-fr/freekiosk/releases)
  (Google Play still has `2.0.0`).

## Enroll a device

Three ways, all start from the dashboard (*Add device*):

1. **Token, on the tablet.** In the dashboard, generate a one-time enrollment token. On the tablet,
   open FreeKiosk, then *Settings > Advanced > Cloud Management*, and enter the server address and
   the token. Tokens are valid for 24 hours.
2. **ADB**, for many tablets: `--es cloud_token "TOKEN"`, see
   [ADB Configuration](adb-configuration.md#cloud-enrollment).
3. **Provisioning QR, on a new or factory-reset tablet.** The dashboard shows a QR code. Scan it from
   the Android setup wizard (tap six times on the welcome screen to open the QR reader): FreeKiosk is
   installed as **Device Owner** and enrolls itself, with no code to type.

To remove a tablet from the cloud, unenroll it in *Settings > Advanced > Cloud*.

## What the tablet sends

Once enrolled, the app sends a status report every 30 seconds (in the code:
`src/utils/CloudSyncService.ts`). It contains:

- battery level and charging state (only on a device that has a battery);
- network: Wi-Fi name and signal, IP address, Ethernet, and the state of the mobile connection;
- screen on or off and brightness;
- the page being shown, kiosk mode, whether FreeKiosk is Device Owner, and the list of what the app
  is allowed to do on this device (its capabilities);
- model, manufacturer, Android and app versions, form factor (tablet or TV), free storage and
  memory, uptime and time zone;
- when they apply, the state of the offline media cache and the version of the signage playlist.

The same request also carries **the configuration of the app**, so the dashboard can back it up and
apply changes. It includes the secrets stored in the app, **the MQTT password, the REST API key and
the HTTP basic-auth password**, which the server stores **encrypted**. The PIN is never sent from the
tablet.

The report does **not** contain the GPS position of the device.

In the other direction, the cloud sends configuration changes and commands. Over-the-air app updates
exist only in builds that are not the Google Play build (the Play build has no self-update).

## Pricing and billing

The terms that apply are the [Terms of Sale](https://cloud.freekiosk.app/terms/) of the service;
this is a summary.

- **The first device is free**, with no payment method required. It has the whole service except
  APK distribution, remote screenshots, the scheduler, renaming the organization and additional team
  members, which come with the first paid licence.
- **One offer, no plans**: every feature is included from the first paid licence, whatever the number
  of devices. One licence corresponds to one device enrolled at a time.
- **Rates** per licence and month, excluding VAT: see [freekiosk.app/cloud](https://freekiosk.app/cloud).
- **No free trial**: enrolling beyond the free device is billed immediately, from the first day.
- **Paid in advance**, monthly or annually. The annual subscription is paid in one instalment for the
  twelve months ahead and carries a 10% discount on the monthly rate.
- **Adding licences part-way through a period** is billed immediately, prorated over the time remaining
  until the next due date. No minimum amount applies.
- **Digital signage media**: the media library has a storage quota of 100 MiB for an organization with
  only the free allowance, and 1 GiB for each licence held once one licence is paid.

## If the cloud is unavailable

The app runs on its own. An interruption of the service does not stop a device that is already
configured: only remote management is affected while it lasts.

## If you cancel

The subscription runs until its end date and nothing changes until then. After that the organization
goes back to its free allowance: enrolled devices keep running and reporting, and enrolling new ones
needs a licence. You can resume the subscription until the end date without paying again.

## Security

Accounts support two-factor authentication (TOTP). Each device authenticates with its own API key,
stored as a SHA-256 hash on the server, and each organization's data is isolated from the others.

## Self-hosting

The management server is planned to be released as open source in 2027. Until then the cloud is the
hosted service above; the app can point to another address with `cloud_url`
([ADB Configuration](adb-configuration.md#cloud-enrollment)).

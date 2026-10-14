# Android TV, Google TV and Fire TV

FreeKiosk installs on Android TV and Google TV, appears in the apps row, and can be driven with a remote control only. This page says what works, what does not, and how to set a TV up.

> **Status: tested on emulators only.** Android TV and Google TV system images (API 36, 1080p), with commands sent as remote keys through `adb`. Not tested yet on a physical TV or box, on Fire TV, with HDMI-CEC or with an infrared remote. Anything below marked *not verified* is a reading of the code or of Android's behaviour, not a result.

## What works

| | |
|---|---|
| Install and start | The APK installs; FreeKiosk shows in the Android TV / Google TV apps row (`LEANBACK_LAUNCHER`) with its own banner. |
| Remote only | OK presses a button, the arrows move the focus, and **the focused element is outlined in amber**. OK toggles a switch row. Typed text reaches the fields and Enter validates the PIN (checked with keys sent through `adb`, not with the TV's on-screen keyboard). |
| Open the PIN screen | On the kiosk screen, press **Back 5 times**, each press within 2 seconds of the previous one. The PIN is still asked. |
| Leave the settings | **Back** asks *Leave settings?* (stay, or leave without saving). Save is the button at the end of each tab. |
| Media player | A video URL plays full screen on the Android TV emulator at 1080p. **Offline cache, on by default on a TV:** each video and image is downloaded to the device and played from there, so a network drop does not stop the playlist (see below). Videos and images from storage cannot be added on a TV (no file picker): use URLs. |
| Apps that are made for TVs | An app that only declares a TV launcher (no phone launcher) can be picked as an external app, launched, relaunched and started on boot. |
| No battery | A device with no battery sends no battery to the cloud (no made-up level, no battery alert), reports `present: false` over REST and MQTT, and hides the battery in the status bar. |
| Ethernet | A box on Ethernet is reported online (`ethernet` in the status, `network.ethernet_connected` in the cloud heartbeat). |
| What a TV does not have | The brightness settings are hidden (checked on screen). The quick brightness, rotation and torch buttons on the PIN screen and the camera and battery-optimisation permission steps are hidden too (from the code, not checked on screen). |

On a tablet or a phone nothing changes: the TV behaviour only exists when Android reports a television.

## Offline cache of the Media Player

With **Settings > General > Playback > Play from the device (offline cache)** on, every http(s) video and image of the playlist is downloaded once to the device's private storage and played from the file. It is **on by default on a TV and off everywhere else**, so a tablet or a phone plays from the URL exactly as before. Under the switch, the settings show how many files are on the device and their size, and a **Clear the cache** button.

- A file is written as `.part` and renamed only when complete and of the expected size, so a cut download never leaves a half file that would be played.
- **A cut download is resumed** where it stopped (`Range`, guarded by `If-Range`): if the file changed on the server in the meantime, it starts again instead of mixing two versions.
- Each file is checked again every 10 minutes with a conditional request (ETag, Last-Modified): an unchanged file is not downloaded again, a changed one is.
- A failed check (offline, server down) leaves the files that are there. A device that starts offline plays what it has.
- A file that is no longer in the playlist is deleted, and so is anything else left in the cache folder. A half download nobody finished in a week is deleted too.
- **The cache has a limit, 2 GB by default.** A file that would pass it is not downloaded and plays from its URL. The limit is a per-device value, `media_player_cache_limit_mb`, over ADB (see [adb-configuration.md](adb-configuration.md)); a download that would leave less than 100 MB free is refused whatever the limit.
- The first play of a new item waits for its download. Items from the device's own storage are already local and untouched.
- **The cloud sees the state of the cache** (`system.media_cache` in the heartbeat, shown as an *Offline media* tile on the device page): files the playlist needs and files present, their size, the time of the last check, and a short error code when the last check failed. It is sent once the cache has been on, and again as "off" when it is switched off (also after a restart, when files of the earlier cache are still on the device); a device that never used the cache sends nothing. Checked on a tablet emulator against a local cloud: 2 of 2 files and 13,372,429 bytes (the sum of the files on the device), 1 of 3 with a missing file and a refused connection, and "off" after a restart with the cache disabled.
- Integrity relies on TCP and on the size check. There is no checksum yet: that belongs with the playlist the cloud will send (URL, size, checksum).

Checked against a local test server (ETag, Range, faults), on a tablet emulator: a download cut at 3 MB resumes with `Range: bytes=...` and `If-Range` and ends **byte for byte identical** to the source; a file changed on the server during a resume is downloaded again whole, without mixing versions; a half download that is already complete (416) starts again; a 12 MB file is refused under a 5 MB limit while a small one is cached; an unchanged file gets a 304 and is not touched; a changed one is downloaded again; a removed file, a stray file and an orphan `.part` are deleted. Also: no cache folder and no call to the cache with the option off, playback from the cache with the network really cut, and the cache on by default on the Android TV emulator. **On the emulator, a connection closed by the server loses about one byte per 8,640 in the last ~170 KB before the close** (an emulator network artifact: the same file arrives intact when the server keeps the connection open); the size check refused such a download instead of accepting it. Not tested on a physical device, with a very large video, or on a full storage.

## Unattended playback of the Media Player

**Settings > General > Playback > Unattended playback** is for a screen nobody watches. **On by default on a TV, off everywhere else**, so a tablet plays exactly as before.

- **No error text on screen.** The player used to show `Failed to load video: <URL>` on the wall, with the URL in clear (a signed URL carries its token). It now shows nothing and goes on to the next item after 3 seconds, as it did.
- **An item that does not load, or whose video freezes, is skipped after 30 seconds.** Neither case fires an error event in the page, so without this the screen stayed on the dead item for good. A video counts as frozen when it has data but its position has not moved for 30 seconds while it should be playing; an item counts as not loading when it has no data after 30 seconds. An image is only watched while it loads.

Checked on a tablet emulator against a local test server, with the setting off and then on: a 404 shows the message and the URL with the setting off and a black screen with it on; a server that accepts the request and never answers keeps the player on that item for good with the setting off, and with it on the player goes past it and loops; a first video whose stream stops after 300 KB stays frozen for 85 seconds with the setting off, and with it on the second video of the playlist is requested and played after about 40 seconds. Not covered: a playlist of one item whose server keeps the dead connection open (the player asks again, but the browser can hold the new request behind the old one until the connection ends), and nothing was tried on a real TV.

## What does not work yet

- **Volume Up ×5 does not work on a TV.** On the emulators the volume keys never reach the app. Use Back ×5. The tap escape does not exist either (no touch).
- **External App mode is not offered on a TV.** While another app is in front, FreeKiosk gets no key, so Back ×5 cannot bring the PIN screen back. The option is hidden in Settings > General; a device already in that mode (set from the cloud or `adb`) keeps it, and the settings then say how to get out: the REST API, MQTT, a FreeKiosk Cloud command, or `adb shell am start -n com.freekiosk/.MainActivity`. A key filter in the accessibility service would do it, but it changes what the service asks of every device, tablets included, and could not be checked on the emulators (injected keys do not go through it), so it was left out.
- **The user agent on a TV has no `Mobile` token** (header and `navigator.userAgent`, checked on the emulators), so a site serves its tablet or desktop layout instead of a phone layout stretched over the screen. A custom user agent in Settings still wins.
- **A web page made for touch** may not be usable with arrows and OK. Chromium's own focus navigation applies; there is no virtual pointer. A mouse click counts toward the tap sequence (from the code, not verified).
- **Not verified:** HDMI-CEC (turning the TV off and on from the cloud), the TV's own sleep timer (`attentive_timeout`), fixed or CEC-controlled volume, USB cameras (the MJPEG stream only looks for front and back cameras), Fire OS.

## Setting a TV up

### Install

Sideload the APK like on any device (`adb install`). On a Google TV, enable *Developer options* and *USB debugging* (or *Wireless debugging*) first. FreeKiosk then appears in the apps row.

### Device Owner

Device Owner gives Lock Mode and silent permissions. QR provisioning is not offered by TV setup wizards, so use `adb`:

```bash
adb shell dpm set-device-owner com.freekiosk/.DeviceAdminReceiver
```

It needs **no account on the device**, and what happens depends on the TV:

| Device | Result |
|---|---|
| Google TV image (emulator), no account | Works. |
| Android TV AOSP image (emulator) | **Fails**: the image lacks `android.software.device_admin`. Many cheap boxes are in the same case; see *ROM does not declare `android.software.device_admin`* in [adb-configuration.md](adb-configuration.md) and `scripts/set-device-owner.ps1`. |
| A real Google TV with a Google account | Not verified. Remove the account first, or use FreeKiosk without Device Owner. |

Without Device Owner there is no Lock Mode: the Home key leaves FreeKiosk, as it does on any device.

### Special permissions

The TV Settings app lacks some of the screens FreeKiosk opens on a tablet (battery optimisation, write settings, display, Bluetooth, and the document picker; checked on both images). The ones that exist: display over other apps, usage access, accessibility, default launcher, unknown sources. For the others, or to skip the screens, grant over `adb`:

```bash
adb shell appops set com.freekiosk SYSTEM_ALERT_WINDOW allow   # display over other apps
adb shell appops set com.freekiosk GET_USAGE_STATS allow       # usage access (External App mode)
```

**Grant display over other apps on a TV without Device Owner.** Without it, after an ADB configuration the app stops and Android blocks its relaunch (*Background activity launch blocked*); with it, the relaunch works. Checked on the Android TV emulator.

**Start at boot, and after a power cut.** Settings > Security > Launch on Boot is not enough on a TV without Device Owner. Checked on the Android TV emulator (API 36) with a real reboot (`adb reboot`):

| Device state | After the reboot |
|---|---|
| Launch on Boot on, *display over other apps* granted | FreeKiosk is in front within 10 seconds and loads its page. |
| Launch on Boot on, *display over other apps* **not** granted | **FreeKiosk does not start**: the TV home screen stays, no request reaches the server after 70 seconds. |
| Launch on Boot on, permission not granted, FreeKiosk set as the Home app (`adb shell cmd package set-home-activity com.freekiosk/.MainActivity`) | FreeKiosk is in front and loads its page. |

So on a TV, grant the permission once (command above) or make FreeKiosk the Home app. Under Launch on Boot the settings now say which case the TV is in: a warning with the command when the permission is missing, a confirmation when it is granted. Not checked: Device Owner on a TV image (the restriction may not apply to it), the in-app *Set FreeKiosk as default launcher* button on a TV (only the command above was used), a power cut on a real box (the emulator reboot is a clean one), and a box whose Home app cannot be changed.

### Configure over ADB

The remote makes typing long values slow. Set the start URL and the PIN once over `adb`, then open the PIN screen with Back ×5 for the rest:

```bash
adb shell am start -n com.freekiosk/.MainActivity \
  --es url "https://example.com" --es pin "1234"
```

See [adb-configuration.md](adb-configuration.md) for every key.

### FreeKiosk Cloud

There is no camera to scan a QR code, so enroll by typing the cloud URL and the enrollment token in Settings > Advanced > Cloud, with the remote and the TV keyboard. A TV sends no battery, and the dashboard shows an empty battery cell for it.

## Reporting a problem

Tell us the model of the TV or box, its Android version, and whether Device Owner is set. If something does not work with a remote, the key you pressed and what happened are what we need.

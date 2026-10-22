# Digital signage

A screen plays a playlist of videos, images, web pages and YouTube videos that you build in the FreeKiosk Cloud dashboard
(**Digital signage**), instead of typing the list on the device. It works on a tablet as well
as on an Android TV, and it is open to every FreeKiosk Cloud account: one device is one screen.

## How it works

1. In the dashboard, create a playlist and add the address (URL) of each video or image. An
   image can have its own duration; a video plays to its end.
2. Pick the devices, or a group of devices, that play it. A device's own playlist wins over its
   group's.
3. The device learns about it at its next heartbeat (every 30 seconds), downloads the list, goes
   into Media Player mode and plays it. It keeps the files on the device (see the offline cache
   in [android-tv.md](android-tv.md)), so it goes on playing when the network drops.
4. The dashboard shows, for each screen, whether it is **up to date**, **waiting** for the
   screen, or has **not reported yet** (an app that predates this feature).

When you change the playlist (add, remove, reorder, change a duration) the screens follow within
a minute. When you remove a screen from a playlist, it goes back to the mode it was in before
(for example a web page).

## Files from the media library

A playlist item can be a file the customer uploaded to the cloud's **media library**, instead of an
address they host themselves. For the device the manifest looks the same: it gives the file's `https`
address, and the offline cache downloads and keeps it like any other item. The files are private, so
that address is **signed** and valid 7 days. Its path is **stable and never reused** (a file in the
library is never overwritten), so a file kept on the device is the right one for good, and a download
that is resumed cannot mix two versions. The cache leaves the signature (the `X-Amz-*` parameters) out
when it names a file, so a renewed manifest, which carries new signatures, downloads nothing again; the
cloud renews it every 3 days.

Checked on a tablet emulator, against a real library: a playlist of two images and a video, made from
the dashboard, was played in order from the cloud's storage, and the three files were in the device's
cache with exactly the sizes of the library's files. Not checked: a large video (the cache was
exercised on large files separately), a device offline from the start with a library playlist, and a
physical device.

## Schedules

A playlist can play at certain times instead of the screen's default one: on chosen **days of the
week**, between two **times**, within a **date range**, with a **priority**. Add them in the
playlist's page in the dashboard (**Schedules**).

- **The screen decides, not the cloud.** The cloud hands the device every playlist that can play and
  the rules, and the device picks the right one itself, in its local time zone. It changes playlist
  on time even when it is offline, and it keeps the files of all those playlists in its offline cache
  for that.
- **A clock that is off.** A TV box often has no battery-backed clock and no network time, and can be
  hours wrong. Every heartbeat answer carries the cloud's time (`server_time`): the app keeps the gap
  and reads the schedule with the device's clock corrected by it (`src/utils/ServerClock.ts`). A gap
  under a minute is ignored, an exchange slower than 15 seconds is not measured with, and the gap is
  kept across restarts: a screen that boots without network is as right as it was, and measures
  again at its first heartbeat. Only the schedule uses it; the device's own timers keep its clock. Checked
  on an Android TV emulator whose clock is ten hours behind: against a rule at 16:03 UTC it switched to
  the scheduled playlist at 16:03 UTC (before the fix it followed its own wrong time and never did).
- **Precedence.** When several rules match, the highest priority wins; at equal priority a rule on
  the screen itself wins over one on its group, then the most recent. When no rule matches, the
  default playlist plays, or **a blank screen** when there is none (for example outside opening
  hours).
- **Hours.** The start time is included and the end time excluded. An end time earlier than the start
  time runs past midnight (22:00 to 02:00): the evening belongs to the day you ticked, the hours
  after midnight to the next day. Empty times mean the whole day, empty dates no limit.
- **How fast.** The screen looks at its clock every 30 seconds, so a playlist changes within about
  30 seconds of the time you set.

Checked on a tablet emulator against a local cloud, with the device clock: a default playlist
(a red image) and a rule for another (a blue image) from 10:18 to 10:22. The screen showed the red
one, turned blue 26 seconds after the start of the slot, and **went back to red at the end of the
slot with the network cut** (it had been cut during the slot). The rules themselves (precedence,
bounds, midnight, dates, malformed rules) are covered by 32 unit tests on the device and 53 on the
cloud (precedence, version, manifest, validation, permissions). Not checked: a physical device, a time zone change or a clock set by hand while a rule is
running, and a daylight-saving change.

## On the device

- **Settings > General > Media Playlist** says that the playlist comes from FreeKiosk Cloud
  while one is assigned. The list shown there is then not the one that plays, and it is kept
  for the day the playlist is removed.
- Mode: assigning a playlist puts the device in Media Player mode and remembers the mode it
  had. Removing the playlist puts that mode back, unless you changed the mode by hand in the
  meantime.
- A failed download (no network, server down) changes nothing and is tried again at the next
  heartbeat. The device keeps the playlist it already has.
- An item that is not a well-formed `http` or `https` video or image is skipped; the rest of the
  playlist plays.

## What is checked, and what is not

Checked on a tablet emulator against a local FreeKiosk Cloud: a playlist of two videos assigned
to a device in Web mode is downloaded, the device switches to Media Player mode and plays it
(the screen changes, the files are revalidated by the offline cache), the dashboard shows it up
to date; removing an item from the playlist brings the device to the new version; removing the
assignment brings it back to Web mode and the device reports none.

Images in a cloud playlist were checked in the schedule test below. Not checked: a physical
device or an Android TV with a playlist, a long playlist, and a network drop while a playlist is
playing for the first time (the offline cache is checked separately, in [android-tv.md](android-tv.md)).

## Screensaver and scheduled sleep

A screen that plays a playlist from the cloud is not covered by the screensaver (inactivity timer): it
would hide the playlist for good. The scheduled sleep (Screen Scheduler) still applies: the screen is
black during the window and the playlist resumes after it. Checked on a tablet emulator against the cloud.

## Web pages and YouTube videos

A playlist item can also be a **web page** (shown full screen for a duration, 30 seconds when none is
set, never less than 5) or a **YouTube video** (it plays to its end, with an optional cap). Both need
the network and are **never kept in the offline cache**: a screen that is offline skips them, with no
error on the screen, and plays the rest.

- **A web page** is shown in a frame of the player page that takes no taps and cannot navigate away
  from the player (`sandbox`, no top navigation, no popups). A site that forbids being shown inside
  another page (`X-Frame-Options`, or a CSP `frame-ancestors`) shows an error page where it should be,
  and the app cannot tell: the dashboard reads the site's headers when the page is added and warns.
- **A YouTube video** is played by a page of the cloud (`/player/youtube/?v=<id>`), not by the player
  itself: YouTube refuses to play for a page that has no origin (error 153), which is the case of the
  player page of the app. The cloud's page holds the YouTube player and tells the player when the video
  has ended or cannot be played; the player only listens to messages from that page's origin.
- **An older app** drops what it does not know and plays the rest; the dashboard says "App too old" for
  such a screen (the app reports `signage_web` and `signage_youtube` in its capabilities).

Checked on an Android TV emulator against a local cloud: a playlist made of a web page, a YouTube video
of 19 seconds and a page that forbids framing played in order and looped; the video item ended with the
video, and a long video (Big Buck Bunny) also played; the framing refusal shows an empty frame. Not
checked: the optional cap of a YouTube video, a physical device or box, a long run, a video that cannot be
embedded, a live stream, and the terms of YouTube for use on a business's public screens (read them before relying on this).

## Not in this version

A checksum of each file, several zones on one screen, and a playback report. The contract between the
app and the cloud is in the cloud repository (`ANDROID_INTEGRATION.md`, section 1d).

# Digital signage

A screen plays a playlist of videos and images that you build in the FreeKiosk Cloud dashboard
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

Not checked: a physical device or an Android TV with a playlist, a long playlist, images in a
cloud playlist (the unit tests cover them), and a network drop while a playlist is playing for
the first time (the offline cache is checked separately, in [android-tv.md](android-tv.md)).

## Not in this version

Schedules (days, hours, priorities), files uploaded to the cloud (items are URLs for now), a
checksum of each file, web pages and YouTube as items, several zones on one screen, and a
playback report. The contract between the app and the cloud is in the cloud repository
(`ANDROID_INTEGRATION.md`, section 1d).

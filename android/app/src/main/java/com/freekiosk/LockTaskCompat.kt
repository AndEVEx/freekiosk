package com.freekiosk

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.os.Build

/**
 * What the lock task whitelist API cannot do on the oldest Android versions FreeKiosk installs on.
 *
 * minSdk is 24 (Android 7.0), but DevicePolicyManager.getLockTaskPackages only exists from
 * Android 8.0 (API 26). Calling it on Android 7 throws NoSuchMethodError, an Error that a
 * `catch (e: Exception)` does not catch.
 */
object LockTaskCompat {
    /**
     * The current lock task whitelist, or null where it cannot be read back (Android 7).
     *
     * The callers only use it to add a package for a moment and restore the list afterwards.
     * With null they leave the whitelist as the lock task start built it: that whitelist is
     * set from scratch with setLockTaskPackages, which exists since API 21.
     */
    fun readPackages(dpm: DevicePolicyManager, admin: ComponentName): Array<String>? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) dpm.getLockTaskPackages(admin) else null
}

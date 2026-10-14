package com.freekiosk

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.BatteryManager

/**
 * Android TV helpers. Everything TV-specific in the native layer goes through here so a
 * TV is detected the same way everywhere.
 */
object TvSupport {
    /** True on Android TV, Google TV and Fire TV (UI mode television, or the leanback feature). */
    fun isTelevision(context: Context): Boolean {
        val uiMode = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiMode?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    /**
     * False on a device with no battery (a TV or a box). Without this check such a device
     * still reports some level, often 0 or 100, and the cloud raises a critical-battery
     * alert for it. Unknown counts as present, so a tablet is never hidden by mistake.
     */
    fun hasBattery(context: Context): Boolean {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        return intent?.getBooleanExtra(BatteryManager.EXTRA_PRESENT, true) ?: true
    }
}

/**
 * Launch intent for [packageName]: the regular launcher activity, or the leanback one for
 * apps that only declare LEANBACK_LAUNCHER (many TV and signage apps). Plain
 * getLaunchIntentForPackage() returns null for those, so they would be missing from the
 * app pickers and could not be launched, relaunched or started on boot.
 */
fun PackageManager.launchIntentFor(packageName: String): Intent? =
    getLaunchIntentForPackage(packageName) ?: getLeanbackLaunchIntentForPackage(packageName)

package com.freekiosk

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration

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
}

/**
 * Launch intent for [packageName]: the regular launcher activity, or the leanback one for
 * apps that only declare LEANBACK_LAUNCHER (many TV and signage apps). Plain
 * getLaunchIntentForPackage() returns null for those, so they would be missing from the
 * app pickers and could not be launched, relaunched or started on boot.
 */
fun PackageManager.launchIntentFor(packageName: String): Intent? =
    getLaunchIntentForPackage(packageName) ?: getLeanbackLaunchIntentForPackage(packageName)

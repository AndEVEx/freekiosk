package com.freekiosk

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import android.view.WindowManager

/**
 * BroadcastReceiver for Screen Sleep Scheduler
 * 
 * Triggered by AlarmManager to reliably wake the screen at the scheduled time,
 * even when the screen was turned off via lockNow() (Device Owner mode).
 * 
 * This is necessary because JavaScript timers (setInterval) are suspended
 * when the screen is locked/off, so we can't rely on JS-side timers for wake.
 * 
 * Strategy:
 *   1. Acquire a FULL_WAKE_LOCK with ACQUIRE_CAUSES_WAKEUP to turn screen on
 *   2. Add window flags to show over the lock screen and dismiss keyguard
 *   3. Restore FLAG_KEEP_SCREEN_ON and brightness on the activity window
 *   4. Send JS event so React Native can update its state
 */
class ScreenSchedulerReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ScreenSchedulerReceiver"
        const val ACTION_SCREEN_WAKE = "com.freekiosk.ACTION_SCHEDULED_SCREEN_WAKE"
        const val ACTION_SCREEN_SLEEP = "com.freekiosk.ACTION_SCHEDULED_SCREEN_SLEEP"
        private const val WAKE_LOCK_TIMEOUT = 60_000L // 60 seconds to let JS react
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_SCREEN_WAKE -> handleWake(context)
            ACTION_SCREEN_SLEEP -> handleSleep(context)
            else -> Log.w(TAG, "Unknown action: ${intent.action}")
        }
    }

    private fun handleWake(context: Context) {
        Log.d(TAG, "⏰ Scheduled WAKE alarm fired — turning screen ON")
        try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

            // 1. Acquire a WakeLock to physically turn the screen on
            @Suppress("DEPRECATION")
            val wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                PowerManager.ACQUIRE_CAUSES_WAKEUP or
                PowerManager.ON_AFTER_RELEASE,
                "FreeKiosk:ScheduledWake"
            )
            wakeLock.acquire(WAKE_LOCK_TIMEOUT)
            Log.d(TAG, "WakeLock acquired — screen should be turning on")

            // 2. High-importance full-screen-intent notification + launch MainActivity
            // Modern Android (10, 11, 12, 13, 14+) uses fullScreenIntent (the incoming-call/alarm pattern)
            // to wake the display and immediately present the activity over the lock screen without user interaction.
            try {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                val channelId = "freekiosk_wake"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val channel = android.app.NotificationChannel(
                        channelId, "Screen wake", android.app.NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        setSound(null, null)
                        enableVibration(false)
                        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    }
                    nm.createNotificationChannel(channel)
                }
                val fsIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    )
                    putExtra("from_screen_scheduler_wake", true)
                }
                val piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) android.app.PendingIntent.FLAG_IMMUTABLE else 0)
                val pi = android.app.PendingIntent.getActivity(context, 0, fsIntent, piFlags)
                val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    android.app.Notification.Builder(context, channelId)
                else @Suppress("DEPRECATION") android.app.Notification.Builder(context)
                val notif = builder
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("FreeKiosk")
                    .setContentText("Waking screen")
                    .setCategory(android.app.Notification.CATEGORY_ALARM)
                    .setFullScreenIntent(pi, true)
                    .setAutoCancel(true)
                    .build()
                nm.notify(0xF00D, notif)
                context.startActivity(fsIntent)
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    try { nm.cancel(0xF00D) } catch (_: Exception) {}
                }, 3000)
                Log.d(TAG, "MainActivity launched via FullScreenIntent + startActivity for scheduled wake")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start MainActivity on scheduled wake: ${e.message}", e)
            }

            // 3. Dismiss keyguard / show over lock screen on the activity
            //    This is needed if the user has a PIN/pattern lock.
            try {
                val reactApp = context.applicationContext
                if (reactApp is com.facebook.react.ReactApplication) {
                    val reactHost = reactApp.reactNativeHost
                    val reactContext = reactHost.reactInstanceManager?.currentReactContext
                    val activity = reactContext?.currentActivity
                    if (activity != null) {
                        activity.runOnUiThread {
                            try {
                                // Show over lock screen
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                                    activity.setShowWhenLocked(true)
                                    activity.setTurnScreenOn(true)
                                    // Dismiss keyguard
                                    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
                                    keyguardManager.requestDismissKeyguard(activity, null)
                                } else {
                                    @Suppress("DEPRECATION")
                                    activity.window.addFlags(
                                        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                    )
                                }

                                // Restore FLAG_KEEP_SCREEN_ON only if not in system-managed mode
                                val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
                                val keepScreenOn = prefs.getBoolean("keep_screen_on", true)
                                if (keepScreenOn) {
                                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                }

                                // Set brightness to 1.0 (Maximum) on wake
                                val layoutParams = activity.window.attributes
                                layoutParams.screenBrightness = 1.0f
                                activity.window.attributes = layoutParams
                                BrightnessPrefs.applyToWindow(context, activity.window)

                                Log.d(TAG, "Activity flags restored: KEEP_SCREEN_ON, brightness 1.0, keyguard dismissed")
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to set activity flags: ${e.message}")
                            }
                        }
                    } else {
                        Log.d(TAG, "Activity not yet running in memory — launched via Intent above")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not access activity for flags: ${e.message}")
            }

            // 4. Send event to JS via KioskModule's static method
            KioskModule.sendEventFromNative("onScheduledWake", null)

            Log.d(TAG, "Screen wake triggered successfully, JS event sent")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to wake screen: ${e.message}", e)
        }
    }

    private fun handleSleep(context: Context) {
        Log.d(TAG, "⏰ Scheduled SLEEP alarm fired")
        try {
            val prefs = context.getSharedPreferences("FreeKioskSettings", Context.MODE_PRIVATE)
            val sleepMode = prefs.getString("screen_scheduler_sleep_mode", "dim") ?: "dim"
            Log.d(TAG, "Sleep mode configured: $sleepMode")

            // Dismiss soft keyboard if open
            try {
                val reactApp = context.applicationContext
                if (reactApp is com.facebook.react.ReactApplication) {
                    val activity = reactApp.reactNativeHost.reactInstanceManager?.currentReactContext?.currentActivity
                    if (activity != null) {
                        KeyboardUtils.dismiss(activity)
                        if (sleepMode == "turn_off") {
                            // Physical screen off via Device Owner or Admin
                            try {
                                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? android.app.admin.DevicePolicyManager
                                val adminComponent = android.content.ComponentName(context, DeviceAdminReceiver::class.java)
                                if (dpm != null && (dpm.isDeviceOwnerApp(context.packageName) || dpm.isAdminActive(adminComponent))) {
                                    ScreenStateReceiver.markDeliberateScreenOff(context)
                                    dpm.lockNow()
                                    Log.d(TAG, "Screen turned OFF via lockNow() in receiver")
                                }
                            } catch (e: Exception) {
                                Log.w(TAG, "Could not lock screen directly: ${e.message}")
                            }
                        } else {
                            // Dim the screen instead of locking — keeps app in foreground/RAM
                            activity.runOnUiThread {
                                try {
                                    val layoutParams = activity.window.attributes
                                    layoutParams.screenBrightness = 0.001f
                                    activity.window.attributes = layoutParams
                                    activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                                    Log.d(TAG, "Screen dimmed to near-zero in receiver (app stays in RAM)")
                                } catch (e: Exception) {
                                    Log.w(TAG, "Could not dim screen: ${e.message}")
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not dismiss keyboard / handle sleep: ${e.message}")
            }

            // Send event to JS so the app can handle the sleep properly
            KioskModule.sendEventFromNative("onScheduledSleep", null)

            Log.d(TAG, "Sleep event sent to JS")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger sleep: ${e.message}", e)
        }
    }
}

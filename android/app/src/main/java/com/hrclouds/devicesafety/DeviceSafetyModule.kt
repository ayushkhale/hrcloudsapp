// ─────────────────────────────────────────────────────────────────────────────
// DeviceSafetyModule.kt — "is this phone in developer mode?"
//
// User, 2026-10-21: don't allow clock in, clock out or a break while the
// phone's Developer options are switched on, and tell them to turn it off.
// Developer options is where mock locations and a faked clock live, so a punch
// from such a phone says nothing reliable about where or when it happened.
//
// Two calls, both tiny:
//   isDeveloperModeOn()      → Promise<boolean>, Settings.Global
//                              DEVELOPMENT_SETTINGS_ENABLED
//   openDeveloperSettings()  → opens Settings › Developer options (or the
//                              Settings app, where that screen can't be
//                              opened directly), so turning it off is one tap
//
// The JS side is src/lib/developerMode.js. A phone without this module (an old
// build, iOS) reads as "off" there — the check is a gate on a punch, never a
// reason the app fails to start.
// ─────────────────────────────────────────────────────────────────────────────

package com.hrclouds.devicesafety

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DeviceSafetyModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "HRDeviceSafety"

  @ReactMethod
  fun isDeveloperModeOn(promise: Promise) {
    try {
      val on = Settings.Global.getInt(
        ctx.contentResolver,
        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
        0,
      ) != 0
      promise.resolve(on)
    } catch (e: Exception) {
      promise.reject("DEV_MODE_UNKNOWN", e.message, e)
    }
  }

  @ReactMethod
  fun openDeveloperSettings(promise: Promise) {
    val flags = Intent.FLAG_ACTIVITY_NEW_TASK
    try {
      ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).addFlags(flags))
      promise.resolve(true)
    } catch (e: Exception) {
      try {
        ctx.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(flags))
        promise.resolve(true)
      } catch (e2: Exception) {
        promise.reject("SETTINGS_UNAVAILABLE", e2.message, e2)
      }
    }
  }
}

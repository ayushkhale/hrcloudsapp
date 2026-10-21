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
//
//   confirmIdentity(title, subtitle) → Promise<true>; the phone's own
//                              fingerprint / face / PIN sheet, no key involved
//                              (user, 2026-10-21: My Pay stays hidden until
//                              this passes — src/lib/payPrivacy.js). Rejects
//                              CANCELLED · LOCKED_OUT · NOT_AVAILABLE ·
//                              NO_ACTIVITY · AUTH_FAILED.
//
// Unlike HRDeviceKey's prompt this binds no CryptoObject, so WEAK biometrics
// and the screen lock are both fine on every Android version.
// ─────────────────────────────────────────────────────────────────────────────

package com.hrclouds.devicesafety

import android.content.Intent
import android.provider.Settings
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
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
  fun confirmIdentity(title: String, subtitle: String, promise: Promise) {
    val activity = ctx.currentActivity as? FragmentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "The app isn’t in the foreground.")
      return
    }
    activity.runOnUiThread {
      val callback = object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          promise.resolve(true)
        }

        override fun onAuthenticationError(code: Int, message: CharSequence) {
          val mapped = when (code) {
            BiometricPrompt.ERROR_USER_CANCELED,
            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
            BiometricPrompt.ERROR_CANCELED -> "CANCELLED"
            BiometricPrompt.ERROR_LOCKOUT,
            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "LOCKED_OUT"
            BiometricPrompt.ERROR_NO_BIOMETRICS,
            BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL,
            BiometricPrompt.ERROR_HW_NOT_PRESENT,
            BiometricPrompt.ERROR_HW_UNAVAILABLE -> "NOT_AVAILABLE"
            else -> "AUTH_FAILED"
          }
          promise.reject(mapped, message.toString())
        }
        // onAuthenticationFailed = one unrecognised finger; the prompt stays up.
      }

      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(title)
        .setSubtitle(subtitle)
        .setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL)
        .build()

      try {
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback).authenticate(info)
      } catch (e: Exception) {
        promise.reject("NOT_AVAILABLE", e.message, e)
      }
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

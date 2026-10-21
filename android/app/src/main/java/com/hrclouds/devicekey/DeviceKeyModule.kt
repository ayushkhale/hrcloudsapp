// ─────────────────────────────────────────────────────────────────────────────
// DeviceKeyModule.kt — the phone's half of attendance device trust.
//
// The backend's `device_key` credential (ref docs: device_trust_frontend_guide
// §8): a NON-EXPORTABLE P-256 key pair in the Android Keystore. The public key
// goes to the server once, at registration, as SPKI DER; the private key never
// leaves the secure hardware, and every use of it needs the person's
// fingerprint, face or screen lock (BiometricPrompt + CryptoObject, so the
// unlock is bound to THIS signature, not to a time window).
//
// The JS side (features/devices/deviceKey.js) builds the canonical bytes; this
// module only creates, signs with and deletes keys. Kept deliberately small:
// it is the one piece of the flow that cannot be checked from JavaScript.
//
// Traps, all from the guide:
//  • SHA256withECDSA emits DER (70–72 bytes) — what the server wants. Never
//    convert it; a 64-byte raw r‖s signature is rejected without a reason.
//  • setInvalidatedByBiometricEnrollment(true): adding a fingerprint destroys
//    the key. That is EXPECTED. It surfaces as KEY_INVALIDATED and the JS side
//    treats the phone as unregistered — never a crash, never a retry loop.
//  • Below Android 11 a CryptoObject cannot be unlocked with the screen lock,
//    only with a strong biometric, so there the prompt is biometric-only.
// ─────────────────────────────────────────────────────────────────────────────

package com.hrclouds.devicekey

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class DeviceKeyModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "HRDeviceKey"

  private val keyStore: KeyStore
    get() = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  /** What can unlock a key on this phone. See the header for the Android 11 split. */
  private fun authenticators(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_STRONG or DEVICE_CREDENTIAL
    else BIOMETRIC_STRONG

  /** `{ supported, reason }` — reason is NONE_ENROLLED, NO_HARDWARE or UNAVAILABLE. */
  @ReactMethod
  fun isSupported(promise: Promise) {
    val out = Arguments.createMap()
    val reason = when (BiometricManager.from(ctx).canAuthenticate(authenticators())) {
      BiometricManager.BIOMETRIC_SUCCESS -> null
      BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "NONE_ENROLLED"
      BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "NO_HARDWARE"
      else -> "UNAVAILABLE"
    }
    out.putBoolean("supported", reason == null)
    if (reason != null) out.putString("reason", reason) else out.putNull("reason")
    promise.resolve(out)
  }

  @ReactMethod
  fun hasKey(alias: String, promise: Promise) {
    try {
      promise.resolve(keyStore.containsAlias(alias))
    } catch (e: Exception) {
      promise.reject("KEYSTORE", e.message, e)
    }
  }

  /**
   * A fresh key pair under `alias` (any old one is replaced). Resolves
   * `{ publicKey, strongBox }`: the SPKI DER public key, base64, and whether
   * it landed in a StrongBox chip rather than the TEE.
   */
  @ReactMethod
  fun createKey(alias: String, promise: Promise) {
    try {
      if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
      var strongBox = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
      val pair = try {
        generate(alias, strongBox)
      } catch (e: Exception) {
        // StrongBox is optional hardware; the TEE is still non-exportable.
        if (!strongBox || !isStrongBoxMissing(e)) throw e
        strongBox = false
        generate(alias, false)
      }
      val out = Arguments.createMap()
      out.putString("publicKey", Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP))
      out.putBoolean("strongBox", strongBox)
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("KEY_CREATE_FAILED", e.message, e)
    }
  }

  private fun isStrongBoxMissing(e: Exception) =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && e is StrongBoxUnavailableException

  private fun generate(alias: String, strongBox: Boolean) =
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE).run {
      val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setUserAuthenticationRequired(true)
        .setInvalidatedByBiometricEnrollment(true)
        .apply {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // 0 = every use needs its own unlock, bound to the CryptoObject.
            setUserAuthenticationParameters(
              0,
              KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
            )
          }
          if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setIsStrongBoxBacked(true)
        }
        .build()
      initialize(spec)
      generateKeyPair()
    }

  @ReactMethod
  fun deleteKey(alias: String, promise: Promise) {
    try {
      if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("KEYSTORE", e.message, e)
    }
  }

  /**
   * Sign `payloadBase64` (the canonical bytes) with SHA256withECDSA behind a
   * BiometricPrompt. Resolves the DER signature, base64. Rejects with one of:
   * NO_KEY · KEY_INVALIDATED · CANCELLED · LOCKED_OUT · NOT_AVAILABLE ·
   * NO_ACTIVITY · AUTH_FAILED.
   */
  @ReactMethod
  fun sign(alias: String, payloadBase64: String, title: String, subtitle: String, promise: Promise) {
    val activity = ctx.currentActivity as? FragmentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "The app isn’t in the foreground.")
      return
    }
    val payload = try {
      Base64.decode(payloadBase64, Base64.NO_WRAP)
    } catch (e: IllegalArgumentException) {
      promise.reject("BAD_PAYLOAD", e.message, e)
      return
    }
    val signature = try {
      val key = keyStore.getKey(alias, null) as? PrivateKey
      if (key == null) {
        promise.reject("NO_KEY", "There is no device key on this phone.")
        return
      }
      Signature.getInstance("SHA256withECDSA").apply { initSign(key) }
    } catch (e: KeyPermanentlyInvalidatedException) {
      promise.reject("KEY_INVALIDATED", "The device key was reset by a change to the phone’s security.", e)
      return
    } catch (e: Exception) {
      promise.reject("KEYSTORE", e.message, e)
      return
    }

    activity.runOnUiThread {
      val callback = object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          try {
            val unlocked = result.cryptoObject?.signature ?: signature
            unlocked.update(payload)
            promise.resolve(Base64.encodeToString(unlocked.sign(), Base64.NO_WRAP))
          } catch (e: Exception) {
            promise.reject("AUTH_FAILED", e.message, e)
          }
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
        .setAllowedAuthenticators(authenticators())
        .apply {
          // A negative button is REQUIRED without DEVICE_CREDENTIAL and FORBIDDEN with it.
          if (authenticators() and DEVICE_CREDENTIAL == 0) setNegativeButtonText("Cancel")
        }
        .build()

      try {
        BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback)
          .authenticate(info, BiometricPrompt.CryptoObject(signature))
      } catch (e: Exception) {
        promise.reject("NOT_AVAILABLE", e.message, e)
      }
    }
  }

  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
  }
}

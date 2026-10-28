# Mindclean end-to-end test environment

Runs the **real Mindclean mobile app** in an Android emulator against the real
website and database. Instagram, LinkedIn and X are replaced by **mock
platforms** (`mock-platforms.mjs`): look-alike login pages and logged-in feeds
with real cookie sessions. Real accounts can't be used in automated tests.

What `device-e2e.mjs` verifies (21 checks):
- **Sign-up and connect:** sign up in the app; tap **Connect**, see the platform's login screen inside the app, get the platform's own wrong-password error, sign in, and watch the screen close by itself.
- **Reading feeds:** the hidden reader opens the logged-in feed with the same session, reads it on the phone and uploads it. Ads and sponsored posts are skipped, and Reels keep their images.
- **Cancelling:** backing out of a login (Android back button) is handled.
- **Plan and feed:** Focus setup, then the 8 + 2 plan, then the feed shows the real (mock) Reels and LinkedIn posts in the planned spacing.
- **Expired sessions:** Mindclean asks the user to log in again.
- **Shared phone:** user B never sees or syncs user A's platforms. An existing platform login asks B to confirm instead of connecting silently. A gets everything back on signing in again.

## Run it

```bash
# 1. Mock platforms (login: tester / mindclean123)
node testenv/mock-platforms.mjs 4100 &

# 2. The website, reachable from the emulator (10.0.2.2 = your computer)
npm run build && APP_SECRET=test-secret npx next start -H 0.0.0.0 -p 3200 &

# 3. An emulator (any Android 14+ image), e.g.
$ANDROID_HOME/emulator/emulator -avd mindclean_test -no-window -no-audio -gpu swiftshader_indirect &
adb wait-for-device

# 4. The app in Expo Go, built against the mock platforms
cd mobile && CI=1 EXPO_PUBLIC_MINDCLEAN_URL=http://10.0.2.2:3200 \
  MINDCLEAN_TEST_PLATFORMS=http://10.0.2.2:4100 npm run android -- --port 8081 &
cd ..

# 5. Attach to the app's in-app browsers and run the test
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof host.exp.exponent | tr -d '\r')
node testenv/device-e2e.mjs testenv/screenshots

# 6. Restore the production reader build afterwards
node scripts/build-readers.mjs
```

## Real platforms (no mocks)

With the app built normally (no `MINDCLEAN_TEST_PLATFORMS`):

```bash
SITE_FROM_DEVICE=http://10.0.2.2:3200 node testenv/real-platforms-e2e.mjs testenv/screenshots
```

## With your own accounts (emulator or a real iPhone/Android phone)

1. Start the site (step 2 above) and run `cd mobile && EXPO_PUBLIC_MINDCLEAN_PORT=3200 npx expo start --lan`.
2. On a phone, open **Expo Go** and scan the QR code (`testenv/expo-go-qr.png` encodes `exp://<your-computer's-IP>:8081`).
   In the emulator, forward the ports and open it on localhost:
   `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3200 tcp:3200 && adb shell am start -a android.intent.action.VIEW -d exp://localhost:8081 host.exp.exponent`
3. Sign up, open **Sources**, tap **Connect** on your platforms, and log in on their own screens.
4. Run `node testenv/check-real-feeds.mjs [your-email]` to see what each platform delivered.

`MINDCLEAN_TEST_PLATFORMS` only affects the generated `mobile/src/readers.generated.ts`, and the file says "TEST BUILD" at the top when it's set. Always regenerate without it (step 6) before building the app for release.

### Troubleshooting
- **Emulators on Intel Macs are slow.** Android may show "Process system isn't responding". Run `adb shell settings put global hide_error_dialogs 1`.
- **Expo Go shows "Something went wrong" or "Packager is not running":** use the `adb reverse` + `exp://localhost:8081` route above.
- **Expo Go's developer menu covers the app:** open the project with `?__expo_disable_onboarding=1` added to the URL.

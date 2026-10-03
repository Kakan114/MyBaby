# MyBaby

MyBaby is an Expo and React Native application. Node.js 24.21.0 and npm 11.19.0 are the currently tested and recommended development versions.

## Setup

Install the tracked dependency tree on a fresh checkout:

```bash
npm ci
```

Run the routine project checks:

```bash
npm run check
```

This checks tracked changes for whitespace errors, runs the strict TypeScript check, and runs the unit tests.

## Windows, GitHub, and macOS workflow

Only one machine should actively make commits and pushes at a time.

Before starting work on a machine:

1. Pull the latest `master`.
2. Run `npm ci` if `package.json` or `package-lock.json` changed after the pull.
3. Run `npm run check`.
4. Start new work only after these steps pass.

When switching machines:

1. Finish the current work and run `npm run check`.
2. Commit and push from the currently active machine.
3. On the other machine, pull before continuing.
4. Run `npm ci` if `package.json` or `package-lock.json` changed.
5. Run `npm run check`, then continue development.

## Change policy

### Source-only changes

TypeScript, React components, UI, domain/application/business logic, and tests normally require only:

```bash
npm run check
```

A native rebuild is normally not required.

### Non-native dependency changes

For dependency or lockfile changes that do not affect native code or configuration, run:

```bash
npm ci
npm run check
```

Not every `package.json` or `package-lock.json` change requires a native rebuild.

### Native-affecting changes

Native-affecting changes include adding or updating an Expo or React Native module with native code, Expo config plugins, native `app.json` settings, permissions, SQLCipher, SecureStore native configuration, native build properties, and anything else that alters generated native projects.

Run `npm ci` first when dependencies changed. Then regenerate and build only the affected platform through Expo CNG:

```bash
# Android
npx expo prebuild --clean --platform android
npm run android

# iOS
npx expo prebuild --clean --platform ios
npm run ios
```

Run `npm run check` afterward. Regenerate and build both platforms when a change affects both.

## Native prerequisites and CNG policy

- Before Android native builds, `java -version` must report JDK 17 and `JAVA_HOME` must point to the JDK 17 installation used for the build.
- iOS native development currently uses Xcode 27 and CocoaPods.
- `ios/` and `android/` are generated locally through Expo Continuous Native Generation (CNG), ignored by Git, and not tracked.
- Do not make project configuration depend on manual edits inside generated native directories. Durable native configuration belongs in tracked Expo/app configuration or config plugins.
- A clean prebuild may delete and recreate generated native directories. That is intentional for this project.

SQLCipher cannot be verified in Expo Go. Its verification harness requires a native development or production build configured with SQLCipher.

Keep secrets and machine-specific absolute paths out of tracked files.

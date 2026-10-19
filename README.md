# Glenbrook 1 Android resident release

This branch contains only the approved mobile/shared build source.
It does not contain the HOA API, database, credentials or resident records.

Pushing an increased Android versionCode to this branch runs the production-signed APK workflow using the protected android-release environment. Never distribute a debug/test APK. Verified APKs transfer to private App Storage staging only; do not create public GitHub build artifacts.

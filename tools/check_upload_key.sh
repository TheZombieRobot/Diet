#!/usr/bin/env bash
# Checks the Play upload key in CI's four signing secrets before anything is signed with it
# (android.yml): all four are set, MOSHPOINT_KEYSTORE decodes (base64) to a keystore that opens
# with MOSHPOINT_KEYSTORE_PASSWORD, MOSHPOINT_KEY_ALIAS is a key in it, and MOSHPOINT_KEY_PASSWORD
# opens that key (it signs a throwaway file, as the bundle's signing will). Prints only what's
# wrong, never a value: the passwords go to keytool and jarsigner through the environment.
#
# Environment: KEYSTORE_B64 (the MOSHPOINT_KEYSTORE secret), MOSHPOINT_KEYSTORE_PASSWORD,
# MOSHPOINT_KEY_ALIAS, MOSHPOINT_KEY_PASSWORD. Exit status 1 (with ::error::) when it won't sign.
set -uo pipefail
missing=()
[ -n "${KEYSTORE_B64:-}" ] || missing+=(MOSHPOINT_KEYSTORE)
[ -n "${MOSHPOINT_KEYSTORE_PASSWORD:-}" ] || missing+=(MOSHPOINT_KEYSTORE_PASSWORD)
[ -n "${MOSHPOINT_KEY_ALIAS:-}" ] || missing+=(MOSHPOINT_KEY_ALIAS)
[ -n "${MOSHPOINT_KEY_PASSWORD:-}" ] || missing+=(MOSHPOINT_KEY_PASSWORD)
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Signing secrets missing: ${missing[*]}. All four are needed (docs/RELEASE_CHECKLIST.md, the upload key)."
  exit 1
fi
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
ks="$dir/upload.jks"
# Decoded exactly as the bundle step decodes it.
if ! printf '%s' "$KEYSTORE_B64" | base64 -d > "$ks" 2> /dev/null || [ ! -s "$ks" ]; then
  echo "::error::MOSHPOINT_KEYSTORE isn't base64 (make it with: base64 -w0 upload.jks)."
  exit 1
fi
if ! keytool -list -keystore "$ks" -storepass:env MOSHPOINT_KEYSTORE_PASSWORD > /dev/null 2>&1; then
  echo "::error::MOSHPOINT_KEYSTORE isn't a keystore that opens with MOSHPOINT_KEYSTORE_PASSWORD."
  exit 1
fi
if ! keytool -list -keystore "$ks" -storepass:env MOSHPOINT_KEYSTORE_PASSWORD -alias "$MOSHPOINT_KEY_ALIAS" > /dev/null 2>&1; then
  echo "::error::MOSHPOINT_KEY_ALIAS isn't the name of a key in the keystore."
  exit 1
fi
# keytool would ignore a wrong key password for a PKCS12 keystore; signing doesn't, so sign.
python3 -c 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1], "w"); z.writestr("check.txt", "upload key check"); z.close()' "$dir/check.jar"
if ! jarsigner -keystore "$ks" -storepass:env MOSHPOINT_KEYSTORE_PASSWORD -keypass:env MOSHPOINT_KEY_PASSWORD "$dir/check.jar" "$MOSHPOINT_KEY_ALIAS" > /dev/null 2>&1; then
  echo "::error::MOSHPOINT_KEY_PASSWORD doesn't open the key (with keytool's default PKCS12 keystore it's the same as the keystore password)."
  exit 1
fi
echo "OK: the upload key decodes, its alias is in the keystore, and both passwords work"

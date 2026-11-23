#!/usr/bin/env python3
"""Generate/validate the GitHub secrets used by .github/workflows/build.yml.

  scripts/setup-android-secrets.py                      # make upload keystore + secret files in .secrets/android/
  scripts/setup-android-secrets.py --service-account sa.json
  scripts/setup-android-secrets.py --push [--repo owner/name]   # also run `gh secret set` for each

Secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
         ANDROID_KEY_PASSWORD, PLAY_SERVICE_ACCOUNT_JSON
Nothing is printed to the terminal except names; values live in .secrets/ (git-ignored, 0600).
"""
import argparse, base64, json, os, secrets, shutil, subprocess, sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / ".secrets" / "android"
KEYSTORE = OUT / "upload.jks"

MANUAL_STEPS = """
Manual steps (cannot be scripted):
  1. Play Console: create the app (package pt.meshcore.gdfu) and upload the FIRST .aab by hand
     to the Internal testing track; enable Play App Signing and add testers.
  2. Google Cloud: create a service account, enable the "Google Play Android Developer API",
     create a JSON key for it.
  3. Play Console > Users and permissions: invite the service-account email and grant the app
     "Release apps to testing tracks" (add "Release to production" later for the prod workflow).
  4. Re-run with --service-account <key.json> [--push].
"""


def save(name, value):
    p = OUT / name
    p.write_text(value)
    p.chmod(0o600)


def make_keystore():
    if KEYSTORE.exists():
        sys.exit(f"{KEYSTORE} exists; refusing to overwrite (delete it deliberately to regenerate)")
    if not shutil.which("keytool"):
        sys.exit("keytool not found; install a JDK")
    # PKCS12 uses one password for store and key, so both secrets get the same value.
    password, alias = secrets.token_urlsafe(24), "upload"
    subprocess.run(
        ["keytool", "-genkeypair", "-v", "-storetype", "PKCS12", "-keystore", str(KEYSTORE),
         "-alias", alias, "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000",
         "-storepass:env", "UPLOAD_PW", "-keypass:env", "UPLOAD_PW",  # env, not argv: argv is world-readable via /proc
         "-dname", "CN=GDFU Upload, O=Meshcore Portugal, C=PT"],
        check=True, capture_output=True, env={**os.environ, "UPLOAD_PW": password})
    KEYSTORE.chmod(0o600)
    save("ANDROID_KEYSTORE_BASE64", base64.b64encode(KEYSTORE.read_bytes()).decode())
    save("ANDROID_KEYSTORE_PASSWORD", password)
    save("ANDROID_KEY_PASSWORD", password)
    save("ANDROID_KEY_ALIAS", alias)


def check_service_account(path):
    try:
        d = json.loads(Path(path).read_text())
    except (OSError, ValueError) as e:
        sys.exit(f"cannot read service account JSON: {e}")
    missing = {"type", "client_email", "private_key", "project_id"} - d.keys()
    if missing or d["type"] != "service_account":
        sys.exit(f"not a service-account key (missing/invalid: {sorted(missing) or 'type'})")
    save("PLAY_SERVICE_ACCOUNT_JSON", json.dumps(d))
    print(f"service account OK: {d['client_email']} (grant it release permission in Play Console)")


def push(repo):
    for f in sorted(OUT.glob("*")):
        if f.suffix == ".jks":
            continue
        cmd = ["gh", "secret", "set", f.name] + (["--repo", repo] if repo else [])
        subprocess.run(cmd, input=f.read_bytes(), check=True)
        print(f"pushed {f.name}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--service-account", help="path to Play service-account JSON key")
    ap.add_argument("--push", action="store_true", help="upload generated secrets with gh")
    ap.add_argument("--repo", help="owner/name (default: gh's current repo)")
    a = ap.parse_args()
    if a.service_account and not Path(a.service_account).is_file():
        sys.exit(f"{a.service_account}: no such file. It is the Google Cloud key you download yourself.\n{MANUAL_STEPS}")

    OUT.mkdir(parents=True, exist_ok=True)
    OUT.chmod(0o700)
    if not KEYSTORE.exists():
        make_keystore()
        print(f"created {KEYSTORE}\nBACK IT UP somewhere safe (password manager); Play can reset a lost upload key, but it takes support time.")
    else:
        print(f"keeping existing {KEYSTORE}")
    if a.service_account:
        check_service_account(a.service_account)
    if a.push:
        if not shutil.which("gh"):
            sys.exit("gh CLI not found")
        push(a.repo)
    print("secret files:", ", ".join(sorted(p.name for p in OUT.glob("*") if p.suffix != ".jks")))
    if not (OUT / "PLAY_SERVICE_ACCOUNT_JSON").exists():
        print(MANUAL_STEPS)


if __name__ == "__main__":
    main()

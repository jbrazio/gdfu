"""App source validation: strict-typing and GATT-contract invariants.

Runs against the rebuilt Capacitor + Next.js app in ``app/`` (skipped when
the app directory is absent). The heavyweight checks (tsc, eslint, prettier,
next build, codec vectors) run through npm scripts wired into CI; these
tests give the Python suite a fast structural safety net.
"""

from pathlib import Path
import re
import unittest

APP_DIR = Path(__file__).parents[1]
GATT_SERVICE = "7e4c2a10-8b31-4f9d-a600-000000000000"


def app_sources() -> list[Path]:
    lib = APP_DIR / "lib"
    components = APP_DIR / "components"
    files: list[Path] = []
    for directory in (lib, components, APP_DIR / "app"):
        if directory.is_dir():
            files.extend(sorted(directory.glob("*.ts")))
            files.extend(sorted(directory.glob("*.tsx")))
    return files


@unittest.skipUnless(APP_DIR.is_dir(), "app not present")
class AppSourceValidationTests(unittest.TestCase):
    def test_typescript_sources_contain_no_any_types(self) -> None:
        """Catches lax typing regressions in the mobile/web frontend."""
        any_pattern = re.compile(r":\s*any\b|\bas\s+any\b")
        for ts_file in app_sources():
            content = ts_file.read_text(encoding="utf-8")
            matches = any_pattern.findall(content)
            self.assertEqual(len(matches), 0, f"Found 'any' type in {ts_file.name}")

    def test_bluetooth_layer_uses_gatt_service_uuid(self) -> None:
        """The BLE client must target the documented proxy service."""
        bluetooth = APP_DIR / "lib" / "bluetooth.ts"
        self.assertTrue(bluetooth.is_file(), "lib/bluetooth.ts missing")
        content = bluetooth.read_text(encoding="utf-8")
        self.assertIn(GATT_SERVICE, content)

    def test_dfu_chunk_size_matches_rf_payload_bound(self) -> None:
        """PROTOCOL_DFU_GFSK.md caps RF payload at 192 bytes; the app must match."""
        dfu = APP_DIR / "lib" / "dfu.ts"
        content = dfu.read_text(encoding="utf-8")
        self.assertRegex(content, r"CHUNK_SIZE\s*=\s*192")

    def test_unexpected_disconnect_clears_stale_dfu_selection(self) -> None:
        """A disconnected proxy must not leave a target selected for retry."""
        page = (APP_DIR / "app" / "page.tsx").read_text(encoding="utf-8")
        start = page.index("onUnexpectedDisconnect: () => {")
        handler = page[start : page.index("\n      },", start)]
        for reset in (
            "setSelectedTarget(null);",
            "setProxies([]);",
            "setScanningProxies(false);",
            "setRadioConfig(null);",
            "setProgress(null);",
            "setSessionError(null);",
        ):
            self.assertIn(reset, handler)
        progress_start = page.index("onProgress: (value) => {")
        callback = page[progress_start : page.index("    });", progress_start)]
        self.assertIn("if (sessionRef.current !== session)", callback)
        catch_start = page.index("    } catch (error) {", progress_start)
        catch = page[catch_start : page.index("  }, [selectedTarget", catch_start)]
        self.assertIn("if (sessionRef.current === session)", catch)

    def test_card_title_is_reused_for_card_headers(self) -> None:
        """Card headers share centered icon and compact muted help styling."""
        card_title = (APP_DIR / "components" / "CardTitle.tsx").read_text(encoding="utf-8")
        self.assertIn('alignItems: "center"', card_title)
        self.assertIn('color="text.secondary"', card_title)
        self.assertIn('backgroundColor: "action.selected"', card_title)
        self.assertIn('borderRadius: 1', card_title)
        for name in ("ProxySection.tsx", "TargetSection.tsx", "FirmwareSection.tsx", "DfuSection.tsx", "StorageManager.tsx"):
            content = (APP_DIR / "components" / name).read_text(encoding="utf-8")
            self.assertIn('from "@/components/CardTitle"', content)
            self.assertIn("<CardTitle", content)
        update = (APP_DIR / "components" / "DfuSection.tsx").read_text(encoding="utf-8")
        self.assertNotIn("Select a validated firmware image to enable the update.", update)

    def test_capacitor_webdir_matches_static_export(self) -> None:
        """Capacitor must consume the Next.js static export directory."""
        config = (APP_DIR / "capacitor.config.ts").read_text(encoding="utf-8")
        self.assertRegex(config, r"webDir:\s*['\"]out['\"]")


if __name__ == "__main__":
    unittest.main()

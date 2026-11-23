import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGES, pickLocale, translate } from "./i18n";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
for (const [locale, messages] of Object.entries(MESSAGES)) {
  for (const [key, en] of Object.entries(MESSAGES["en-GB"])) {
    const text = messages[key as keyof typeof MESSAGES["en-GB"]];
    assert.ok(text, `${locale} missing ${key}`);
    assert.deepEqual(placeholders(text), placeholders(en), `${locale} placeholder mismatch in ${key}`);
  }
}
assert.equal(pickLocale(["pt-BR"]), "pt-BR");
assert.equal(pickLocale(["pt-PT"]), "pt-PT");
assert.equal(pickLocale(["zh-TW"]), "zh-Hans");
assert.equal(pickLocale(["de-AT"]), "de");
assert.equal(pickLocale(["ja", "ko-KR"]), "ko");
assert.equal(pickLocale(["en-US", "pt-PT"]), "en-GB");
assert.equal(pickLocale(["sv", "pt"]), "pt-PT");
assert.equal(pickLocale(["fr-CA"]), "fr");
assert.equal(pickLocale(["ja"]), "en-GB");
assert.equal(translate("pt-PT", "uploaded", { name: "a.zip" }), "a.zip enviado");
assert.equal(translate("en-GB", "version", { version: "1" }), "Version 1");

const project = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
for (const locale of ["en-GB", "pt-PT", "pt-BR", "zh-Hans", "fr", "de", "ko", "es"]) {
  const strings = readFileSync(`ios/App/App/${locale}.lproj/InfoPlist.strings`, "utf8");
  assert.match(strings, /^"NSBluetoothAlwaysUsageDescription" = ".+";\s*$/);
  assert.ok(project.includes(`path = "${locale}.lproj/InfoPlist.strings"`));
}
assert.match(project, /InfoPlist\.strings in Resources/);

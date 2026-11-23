#!/usr/bin/env python3
"""Release notes from CHANGELOG.md, and the post-promotion changelog cut.

  release-notes.py CHANGELOG.md OUT_DIR
      OUT_DIR/github.md                              [Unreleased] body (GitHub release body)
      OUT_DIR/android/<locale>/changelogs/default.txt  fixed Play notes (fastlane supply layout)
      OUT_DIR/ios.json                               fixed App Store notes, keyed by Apple locale
  release-notes.py cut CHANGELOG.md VERSION DATE TAGGED_CHANGELOG
      Move the [Unreleased] entries that were already in TAGGED_CHANGELOG (the promoted build's
      copy) into a new "## [VERSION] - DATE" section. Entries merged after that build stay unreleased.
      No-op when VERSION is already cut or the build shipped no entries.
  release-notes.py --selftest
"""
import json, re, sys
from pathlib import Path

# Store notes are fixed text per locale: Play language tag -> (Apple locale, text).
STORE_NOTES = {
    "en-GB": ("en-GB", "We've fixed some bugs, improved performance, and made enhancements to keep the app running smoothly."),
    "pt-PT": ("pt-PT", "Corrigimos alguns erros, melhorámos o desempenho e fizemos melhorias para garantir que a aplicação continua a funcionar sem problemas."),
    "pt-BR": ("pt-BR", "Corrigimos alguns erros, melhoramos o desempenho e fizemos aprimoramentos para manter o aplicativo funcionando sem problemas."),
    "zh-CN": ("zh-Hans", "我们修复了部分问题，提升了性能，并进行了多项改进，以确保应用稳定流畅地运行。"),
    "fr-FR": ("fr-FR", "Nous avons corrigé certains bogues, amélioré les performances et apporté des optimisations afin d'assurer le bon fonctionnement de l'application."),
    "de-DE": ("de-DE", "Wir haben Fehler behoben, die Leistung verbessert und Optimierungen vorgenommen, um einen reibungslosen Betrieb der App sicherzustellen."),
    "ko-KR": ("ko", "일부 오류를 수정하고 성능을 개선했으며, 앱이 원활하게 작동하도록 여러 기능을 향상했습니다."),
    "es-ES": ("es-ES", "Hemos corregido algunos errores, mejorado el rendimiento e introducido mejoras para garantizar el correcto funcionamiento de la aplicación."),
}
UNRELEASED = re.compile(r"^## \[Unreleased\][^\n]*\n(.*?)(?=^## |\Z)", re.M | re.S)
NO_CHANGES = "No user-facing changes."


def unreleased(changelog):
    m = UNRELEASED.search(changelog)
    if not m:
        sys.exit("CHANGELOG.md: missing '## [Unreleased]' section")
    return m


def entries(body):
    """[(section, bullet line)] in order. ponytail: single-line bullets only; wrapped bullets would lose their continuation lines."""
    section, out = None, []
    for line in body.splitlines():
        if line.startswith("### "):
            section = line[4:].strip()
        elif line.startswith("- "):
            out.append((section, line))
    return out


def render(items):
    sections = {}
    for section, line in items:
        sections.setdefault(section, []).append(line)
    return "".join((f"### {s}\n\n" if s else "") + "\n".join(lines) + "\n\n" for s, lines in sections.items())


def cut(changelog, version, date, tagged):
    if re.search(rf"^## \[{re.escape(version)}\]", changelog, re.M):
        return changelog  # already cut: re-running promotion is a no-op
    shipped = {line for _, line in entries(unreleased(tagged).group(1))}
    m = unreleased(changelog)
    items = entries(m.group(1))
    if not any(line in shipped for _, line in items):
        return changelog  # build shipped no user-facing changes
    head = "## [Unreleased]\n\n" + render([i for i in items if i[1] not in shipped])
    head += f"## [{version}] - {date}\n\n" + render([i for i in items if i[1] in shipped])
    return changelog[:m.start()] + head + changelog[m.end():]


def write_notes(changelog, out):
    body = unreleased(changelog).group(1).strip() or NO_CHANGES
    out.mkdir(parents=True, exist_ok=True)
    (out / "github.md").write_text(body + "\n")
    for play, (_, text) in STORE_NOTES.items():
        d = out / "android" / play / "changelogs"
        d.mkdir(parents=True, exist_ok=True)
        (d / "default.txt").write_text(text + "\n", encoding="utf-8")
    (out / "ios.json").write_text(json.dumps(dict(STORE_NOTES.values()), ensure_ascii=False, indent=1))


def selftest():
    import tempfile
    tagged = "# C\n\n## [Unreleased]\n\n### Added\n\n- a\n\n### Fixed\n\n- f\n\n## [1.0] - 2026\n\n- old\n"
    now = "# C\n\n## [Unreleased]\n\n### Added\n\n- a\n- later\n\n### Fixed\n\n- f\n\n## [1.0] - 2026\n\n- old\n"
    got = cut(now, "2.0", "2026-11-23", tagged)
    assert got == ("# C\n\n## [Unreleased]\n\n### Added\n\n- later\n\n## [2.0] - 2026-11-23\n\n"
                   "### Added\n\n- a\n\n### Fixed\n\n- f\n\n## [1.0] - 2026\n\n- old\n"), got
    assert cut(got, "2.0", "x", tagged) == got  # idempotent
    assert cut(got, "3.0", "x", "## [Unreleased]\n\n- zzz\n") == got  # nothing shipped
    with tempfile.TemporaryDirectory() as d:
        write_notes("## [Unreleased]\n\n## [1.0]\n\n- old\n", Path(d))
        assert (Path(d) / "github.md").read_text() == NO_CHANGES + "\n"
        assert json.loads((Path(d) / "ios.json").read_text())["zh-Hans"]
        assert (Path(d) / "android/ko-KR/changelogs/default.txt").exists()
    assert all(len(t) <= 500 for _, t in STORE_NOTES.values())  # Play limit
    print("selftest ok")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--selftest"]:
        selftest()
    elif len(a) == 2:
        write_notes(Path(a[0]).read_text(), Path(a[1]))
    elif len(a) == 5 and a[0] == "cut":
        p = Path(a[1])
        p.write_text(cut(p.read_text(), a[2], a[3], Path(a[4]).read_text()))
    else:
        sys.exit(__doc__)

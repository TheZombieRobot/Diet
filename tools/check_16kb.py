#!/usr/bin/env python3
"""
Checks that every native library in an Android package works on phones with 16 KB memory pages
(Google Play requires it for new apps and updates from 1 November 2025, and for the MapLibre
build this app ships from 1 February 2027: docs/PLAY_STORE.md).

    python3 tools/check_16kb.py app-release.apk [app.aab ...]

Works on an APK, an AAB or an AAR (all three are zip files). For each .so file it checks:
  - 64-bit libraries (arm64-v8a, x86_64): every LOAD segment of the ELF file is aligned to at
    least 16 KB (p_align >= 16384). 16 KB-page phones are all 64-bit, so 32-bit libraries
    (armeabi-v7a, x86) are only reported, as Google's own check_elf_alignment.sh does.
  - In an APK, a library stored uncompressed (Android maps it straight from the APK) must also
    start at a 16 KB boundary inside the zip. Compressed ones are unpacked at install, so their
    position doesn't matter. (An AAB has no such rule: Play builds the APKs from it.)

Exits 1 if any 64-bit library fails, 0 otherwise (also when there are no native libraries).
Plain Python, no Android tools needed, so it can't be fooled by an old zipalign or objdump.
"""
import struct
import sys
import zipfile

PAGE = 16384
SIXTY_FOUR = ("arm64-v8a", "x86_64")


def abi_of(name):
    parts = name.split("/")
    # APK: lib/<abi>/x.so   AAB: base/lib/<abi>/x.so   AAR: jni/<abi>/x.so
    for i, p in enumerate(parts[:-1]):
        if p in ("lib", "jni") and i + 1 < len(parts) - 1:
            return parts[i + 1]
    return "?"


def load_alignments(data):
    """The p_align of every PT_LOAD segment, or raises ValueError if this isn't an ELF file."""
    if data[:4] != b"\x7fELF":
        raise ValueError("not an ELF file")
    cls, enc = data[4], data[5]
    end = "<" if enc == 1 else ">"
    if cls == 2:  # 64-bit
        phoff = struct.unpack_from(end + "Q", data, 0x20)[0]
        phentsize, phnum = struct.unpack_from(end + "HH", data, 0x36)
        out = []
        for i in range(phnum):
            off = phoff + i * phentsize
            p_type = struct.unpack_from(end + "I", data, off)[0]
            if p_type == 1:  # PT_LOAD
                out.append(struct.unpack_from(end + "Q", data, off + 48)[0])
        return out
    if cls == 1:  # 32-bit
        phoff = struct.unpack_from(end + "I", data, 0x1C)[0]
        phentsize, phnum = struct.unpack_from(end + "HH", data, 0x2A)
        out = []
        for i in range(phnum):
            off = phoff + i * phentsize
            p_type = struct.unpack_from(end + "I", data, off)[0]
            if p_type == 1:
                out.append(struct.unpack_from(end + "I", data, off + 28)[0])
        return out
    raise ValueError("unknown ELF class %d" % cls)


def data_offset(path, info):
    """Where an entry's bytes start inside the zip file (after its local header)."""
    with open(path, "rb") as f:
        f.seek(info.header_offset)
        head = f.read(30)
        name_len, extra_len = struct.unpack_from("<HH", head, 26)
        return info.header_offset + 30 + name_len + extra_len


def check(path):
    failures = 0
    is_apk = path.endswith(".apk")
    with zipfile.ZipFile(path) as z:
        libs = [i for i in z.infolist() if i.filename.endswith(".so")]
        if not libs:
            print("%s: no native libraries" % path)
            return 0
        for info in sorted(libs, key=lambda i: i.filename):
            abi = abi_of(info.filename)
            must = abi in SIXTY_FOUR
            problems = []
            try:
                aligns = load_alignments(z.read(info.filename))
                small = min(aligns) if aligns else 0
                if small < PAGE:
                    problems.append("LOAD segments aligned to %d bytes" % small)
                elf = "ELF %d KB" % (small // 1024) if small >= 1024 else "ELF %d bytes" % small
            except ValueError as e:
                problems.append(str(e))
                elf = "?"
            where = ""
            if is_apk:
                if info.compress_type == zipfile.ZIP_STORED:
                    off = data_offset(path, info)
                    where = ", stored at %d" % off
                    if off % PAGE:
                        problems.append("stored uncompressed but not at a 16 KB boundary in the APK (offset %d)" % off)
                else:
                    where = ", compressed"
            if problems and must:
                failures += 1
                print("::error::%s: %s is not 16 KB aligned: %s" % (path, info.filename, "; ".join(problems)))
            elif problems:
                print("  32-bit, not required: %s (%s%s)" % (info.filename, elf, where))
            else:
                print("  OK %s (%s%s)" % (info.filename, elf, where))
    print("%s: %d native libraries, %s" % (path, len(libs), "all 64-bit ones 16 KB aligned" if not failures else "%d NOT 16 KB aligned" % failures))
    return failures


def main(args):
    if not args:
        print(__doc__)
        return 2
    bad = sum(check(p) for p in args)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

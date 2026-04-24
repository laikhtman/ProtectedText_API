#!/usr/bin/env python3
"""
export_site.py — Export a ProtectedText.com site to local .txt files.

Single-site usage:
    python export_site.py [siteId]

Batch usage (CSV):
    python export_site.py --import sites.csv

CSV format (no header row required):
    siteId,password[,masterDirectory]

    Column 1 — site ID  (required)
    Column 2 — password (required)
    Column 3 — master directory (optional).
               When given, files are saved to <masterDirectory>/<siteId>/
               instead of the default ./<siteId>/

Example CSV:
    mynotes,secret123
    worknotes,pass456,backup
    family,pa$$w0rd,D:\\exports

Each tab in the site becomes a .txt file inside the output folder.
The file name is the first non-whitespace line of the tab content (the tab title).
"""

import sys
import os
import re
import csv
import hashlib
import base64
import argparse
import getpass
import urllib.request
import urllib.error


# ---------------------------------------------------------------------------
# Dependency check / auto-install
# ---------------------------------------------------------------------------

def _ensure(package, import_name=None):
    import importlib, subprocess
    try:
        importlib.import_module(import_name or package)
    except ImportError:
        print(f"[*] Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])


_ensure("argon2-cffi", "argon2")
_ensure("pycryptodome", "Crypto")

from argon2.low_level import hash_secret_raw, Type as Argon2Type
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad


# ---------------------------------------------------------------------------
# Constants (match protectedtext.com JS exactly)
# ---------------------------------------------------------------------------

ARGON2_MEM    = 32 * 1024   # 32 MB
ARGON2_TIME   = 2
ARGON2_PAR    = 1
ARGON2_HLEN   = 32          # bytes → 32-byte raw hash
ARGON2_ITERS  = 10          # max chain iterations

# SHA512("-- tab separator --") — computed once at import time
TAB_SEPARATOR = hashlib.sha512(b"-- tab separator --").hexdigest()  # 128-char hex


# ---------------------------------------------------------------------------
# Crypto helpers
# ---------------------------------------------------------------------------

def sha512_hex(text: str) -> str:
    """SHA-512 of a UTF-8 string, returned as lowercase hex (matches CryptoJS)."""
    return hashlib.sha512(text.encode("utf-8")).hexdigest()


def argon2id_b64(password: str, salt_str: str) -> str:
    """
    Argon2id( password, salt=siteHash ) → base64(raw 32-byte hash).
    Mirrors JS: btoa(String.fromCharCode(...res.hash))
    """
    raw = hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt_str.encode("utf-8"),
        time_cost=ARGON2_TIME,
        memory_cost=ARGON2_MEM,
        parallelism=ARGON2_PAR,
        hash_len=ARGON2_HLEN,
        type=Argon2Type.ID,
    )
    return base64.b64encode(raw).decode("ascii")


def evp_bytes_to_key(passphrase: bytes, salt: bytes, key_len=32, iv_len=16):
    """OpenSSL EVP_BytesToKey (MD5, 1 iter) — used by CryptoJS when key is a string."""
    d, d_i = b"", b""
    while len(d) < key_len + iv_len:
        d_i = hashlib.md5(d_i + passphrase + salt).digest()
        d += d_i
    return d[:key_len], d[key_len : key_len + iv_len]


def cryptojs_aes_decrypt(ciphertext_b64: str, passphrase: str) -> str:
    """
    Decrypt a CryptoJS AES ciphertext (OpenSSL Salted__ format) using a string passphrase.
    Raises ValueError on bad padding or non-UTF-8 output.
    """
    raw = base64.b64decode(ciphertext_b64)
    if raw[:8] != b"Salted__":
        raise ValueError("Not a CryptoJS Salted block")
    salt       = raw[8:16]
    ciphertext = raw[16:]
    key, iv    = evp_bytes_to_key(passphrase.encode("utf-8"), salt)
    cipher     = AES.new(key, AES.MODE_CBC, iv)
    plaintext  = unpad(cipher.decrypt(ciphertext), AES.block_size)
    return plaintext.decode("utf-8")


# ---------------------------------------------------------------------------
# Decryption: Argon2id chain + legacy fallback
# ---------------------------------------------------------------------------

def decrypt_content(e_content: str, password: str, site_hash: str) -> str | None:
    """
    Try Argon2id-chained keys (iters 1..ARGON2_ITERS), then legacy plaintext password.
    Returns decrypted content (with siteHash stripped) or None if wrong password.
    """
    # --- Argon2id chain ---
    prev = password
    for i in range(1, ARGON2_ITERS + 1):
        key_b64 = argon2id_b64(prev, site_hash)
        prev    = key_b64
        sys.stdout.write(f"\r[*] Trying Argon2id key (iteration {i}/{ARGON2_ITERS})...")
        sys.stdout.flush()
        try:
            plain = cryptojs_aes_decrypt(e_content, key_b64)
            if plain.endswith(site_hash):
                print(f"  ✓ (iter {i})")
                return plain[: -len(site_hash)]
        except Exception:
            pass

    # --- Legacy: password used directly ---
    print("\r[*] Trying legacy (plain-password) decryption...          ")
    try:
        plain = cryptojs_aes_decrypt(e_content, password)
        if plain.endswith(site_hash):
            print("  ✓ (legacy)")
            return plain[: -len(site_hash)]
    except Exception:
        pass

    return None


# ---------------------------------------------------------------------------
# Tab parsing
# ---------------------------------------------------------------------------

def get_tab_title(content: str) -> str:
    """
    Mirrors JS getTitleFromContent: first non-whitespace line, full length.
    Returns 'Empty Tab' if content is blank.
    """
    for i, ch in enumerate(content[:500]):
        if ch not in (" ", "\n", "\t", "\r", "\v", "\f"):
            newline = content.find("\n", i + 1)
            end     = newline if newline != -1 else len(content)
            title   = content[i:end].rstrip()
            return title if title else "Empty Tab"
    return "Empty Tab"


def parse_tabs(content: str) -> list[tuple[str, str]]:
    """
    Split content by the tab separator and return [(title, body), ...].
    Skips mobile-app metadata tabs.
    """
    mobile_marker = "\u267B Reload this website to hide mobile app metadata! \u267B"
    tabs = []
    for chunk in content.split(TAB_SEPARATOR):
        if chunk.startswith(mobile_marker):
            continue
        title = get_tab_title(chunk)
        tabs.append((title, chunk))
    return tabs


# ---------------------------------------------------------------------------
# File-system helpers
# ---------------------------------------------------------------------------

def safe_filename(name: str, max_len=80) -> str:
    """Strip characters that are invalid in Windows/Linux filenames."""
    name = name.strip()
    name = re.sub(r'[\\/:*?"<>|]', "_", name)
    name = name[:max_len].rstrip(". ")
    return name or "Untitled"


def unique_path(folder: str, stem: str, ext=".txt") -> str:
    """Return a path that doesn't clash with existing files."""
    candidate = os.path.join(folder, stem + ext)
    if not os.path.exists(candidate):
        return candidate
    i = 2
    while True:
        candidate = os.path.join(folder, f"{stem} ({i}){ext}")
        if not os.path.exists(candidate):
            return candidate
        i += 1


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def fetch_site_html(site_id: str) -> dict:
    """
    GET the protectedtext.com HTML page and extract ClientState args embedded in it.
    Returns dict with keys: site_url, e_content, is_new.
    """
    url = f"https://www.protectedtext.com/{site_id}"
    req = urllib.request.Request(url, headers=_BROWSER_HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    # No ClientState at all → page is blank / unavailable
    if "new ClientState(" not in html:
        return {"is_new": True, "site_url": f"/{site_id.lower()}", "e_content": None}

    # Extract siteURL (1st arg, quoted)
    m_site = re.search(r'new ClientState\s*\(\s*"([^"]+)"', html)
    # Extract eContent (2nd arg, quoted — allow empty string for new/blank sites)
    m_ec = re.search(
        r'new ClientState\s*\(\s*"[^"]+"\s*,\s*"([^"]*)"', html, re.DOTALL
    )
    # Extract isNew (3rd arg, true/false)
    m_rest = re.search(
        r'new ClientState\s*\(\s*"[^"]+"\s*,\s*"[^"]*"\s*,\s*(true|false)',
        html, re.DOTALL,
    )

    if not m_site or not m_ec:
        raise ValueError("Could not parse ClientState from page HTML.")

    e_content = re.sub(r"\s+", "", m_ec.group(1))  # strip all whitespace
    is_new    = (m_rest.group(1) == "true") if m_rest else (e_content == "")

    return {
        "is_new":    is_new,
        "site_url":  m_site.group(1),   # e.g. "/kaseyguidelines"
        "e_content": e_content or None,
    }


# ---------------------------------------------------------------------------
# Core export logic (reused by both single-site and batch modes)
# ---------------------------------------------------------------------------

def export_one_site(site_id: str, password: str, master_dir: str | None = None) -> bool:
    """
    Fetch, decrypt, and export a single protectedtext.com site to .txt files.

    Args:
        site_id:    The protectedtext.com site identifier.
        password:   The site password.
        master_dir: Optional parent directory. When given, files are written to
                    <master_dir>/<site_id>/. When None, files are written to
                    ./<site_id>/ relative to the current working directory.

    Returns:
        True on success, False on any error (error is printed to stdout).
    """
    print(f"\n{'─'*50}")
    print(f"[>] Site: {site_id}")

    # --- Fetch ---
    print(f"[*] Fetching https://www.protectedtext.com/{site_id} ...")
    try:
        data = fetch_site_html(site_id)
    except urllib.error.HTTPError as e:
        print(f"    Error: HTTP {e.code} — {e.reason}")
        return False
    except Exception as e:
        print(f"    Error fetching site: {e}")
        return False

    if data["is_new"]:
        print("    This site does not exist yet (empty / new site). Skipping.")
        return False

    e_content = data["e_content"]
    if not e_content:
        print("    Error: no encrypted content found in page.")
        return False

    # --- Decrypt ---
    site_hash = sha512_hex(data["site_url"])
    print(f"[*] Decrypting (siteHash = {site_hash[:16]}...)...")
    content = decrypt_content(e_content, password, site_hash)

    if content is None:
        print("\n    Error: wrong password or unsupported encryption scheme.")
        return False

    # --- Parse tabs ---
    tabs = parse_tabs(content)
    print(f"[*] Found {len(tabs)} tab(s).")

    # --- Resolve output folder ---
    if master_dir:
        out_folder = os.path.join(master_dir, site_id)
    else:
        out_folder = site_id

    os.makedirs(out_folder, exist_ok=True)

    # --- Export ---
    for i, (title, body) in enumerate(tabs, 1):
        filename = safe_filename(title)
        filepath = unique_path(out_folder, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"    [{i}/{len(tabs)}] {os.path.basename(filepath)}")

    print(f"✓  Exported {len(tabs)} file(s) to '{out_folder}{os.sep}'")
    return True


# ---------------------------------------------------------------------------
# Batch CSV import
# ---------------------------------------------------------------------------

# Column indices in the CSV
_COL_SITE_ID  = 0
_COL_PASSWORD = 1
_COL_MASTER   = 2

# First-row values that indicate a header row — skip automatically
_HEADER_NAMES = {"siteid", "site_id", "site", "id", "name"}


def import_from_csv(csv_path: str) -> None:
    """
    Read a CSV file and export every site listed in it.

    Expected columns (no header required):
        1. site ID   — required
        2. password  — required
        3. master directory — optional; when present, output goes to <master>/<siteId>/

    Rows with fewer than two columns, blank site IDs, or blank passwords are skipped.
    A likely header row (first cell matches common header names) is skipped automatically.
    Failures on individual sites are reported but do not stop the batch.
    """
    if not os.path.isfile(csv_path):
        print(f"Error: file not found: {csv_path}")
        sys.exit(1)

    rows = []
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh)
        for lineno, row in enumerate(reader, 1):
            # Skip short or fully-blank rows
            if len(row) < 2:
                continue

            site_id  = row[_COL_SITE_ID].strip()
            password = row[_COL_PASSWORD].strip()
            master   = row[_COL_MASTER].strip() if len(row) > _COL_MASTER else ""

            # Skip likely header row
            if lineno == 1 and site_id.lower() in _HEADER_NAMES:
                print(f"[*] Skipping header row: {row}")
                continue

            if not site_id or not password:
                print(f"[!] Line {lineno}: empty site ID or password — skipped.")
                continue

            rows.append((site_id, password, master or None))

    if not rows:
        print("No valid rows found in CSV.")
        sys.exit(0)

    print(f"[*] Found {len(rows)} site(s) in '{csv_path}'.")

    success_count = 0
    for site_id, password, master_dir in rows:
        ok = export_one_site(site_id, password, master_dir)
        if ok:
            success_count += 1

    print(f"\n{'═'*50}")
    print(f"✓  Batch complete: {success_count}/{len(rows)} site(s) exported successfully.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="export_site.py",
        description="Export ProtectedText.com sites to local .txt files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  # Single site (interactive password prompt)
  python export_site.py mynotes

  # Batch export from a CSV file
  python export_site.py --import sites.csv

CSV format:
  siteId,password[,masterDirectory]
  mynotes,secret123
  worknotes,pass456,backup
        """
    )

    parser.add_argument(
        "site_id",
        nargs="?",
        metavar="SITE_ID",
        help="Site ID to export (single-site mode)",
    )
    parser.add_argument(
        "--import", "-import",
        dest="import_csv",
        metavar="FILE",
        help="CSV file to batch-export (columns: siteId, password[, masterDir])",
    )

    args = parser.parse_args()

    # --- Batch mode ---
    if args.import_csv:
        import_from_csv(args.import_csv)
        return

    # --- Single-site mode ---
    site_id = args.site_id
    if not site_id:
        site_id = input("Enter site ID: ").strip()
    if not site_id:
        print("Error: site ID cannot be empty.")
        sys.exit(1)

    password = getpass.getpass(f"Password for '{site_id}': ")
    if not password:
        print("Error: password cannot be empty.")
        sys.exit(1)

    ok = export_one_site(site_id, password)
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()

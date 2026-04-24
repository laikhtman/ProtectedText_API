#!/usr/bin/env python3
"""
export_site.py — Export a ProtectedText.com site to local .txt files.

Usage:
    python export_site.py [siteId]

Each tab in the site becomes a .txt file inside a folder named after the siteId.
The file name is the first non-whitespace line of the tab content (the tab title).
"""

import sys
import os
import re
import hashlib
import base64
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

    # Check if this is a new (non-existent) site — no ClientState call present
    if "new ClientState(" not in html:
        return {"is_new": True, "site_url": f"/{site_id.lower()}", "e_content": None}

    # Extract siteURL (1st arg, quoted)
    m_site = re.search(r'new ClientState\s*\(\s*"([^"]+)"', html)
    # Extract eContent (2nd arg, quoted, may span multiple lines)
    m_ec = re.search(
        r'new ClientState\s*\(\s*"[^"]+"\s*,\s*"([^"]+)"', html, re.DOTALL
    )
    # Extract isNew (3rd arg, true/false)
    m_rest = re.search(
        r'new ClientState\s*\(\s*"[^"]+"\s*,\s*"[^"]+"\s*,\s*(true|false)',
        html, re.DOTALL,
    )

    if not m_site or not m_ec:
        raise ValueError("Could not parse ClientState from page HTML.")

    e_content = re.sub(r"\s+", "", m_ec.group(1))  # strip all whitespace
    is_new    = m_rest.group(1) == "true" if m_rest else False

    return {
        "is_new":   is_new,
        "site_url": m_site.group(1),   # e.g. "/kaseyguidelines"
        "e_content": e_content,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # --- Site ID ---
    if len(sys.argv) >= 2:
        site_id = sys.argv[1].strip()
    else:
        site_id = input("Enter site ID: ").strip()

    if not site_id:
        print("Error: site ID cannot be empty.")
        sys.exit(1)

    # --- Password ---
    password = getpass.getpass(f"Password for '{site_id}': ")
    if not password:
        print("Error: password cannot be empty.")
        sys.exit(1)

    # --- Fetch ---
    print(f"[*] Fetching https://www.protectedtext.com/{site_id} ...")
    try:
        data = fetch_site_html(site_id)
    except urllib.error.HTTPError as e:
        print(f"Error: HTTP {e.code} — {e.reason}")
        sys.exit(1)
    except Exception as e:
        print(f"Error fetching site: {e}")
        sys.exit(1)

    if data["is_new"]:
        print("This site does not exist yet (empty / new site).")
        sys.exit(0)

    e_content = data["e_content"]
    if not e_content:
        print("Error: no encrypted content found in page.")
        sys.exit(1)

    # --- Decrypt ---
    # siteHash = SHA512(site_url) where site_url is e.g. "/kaseyguidelines"
    site_hash = sha512_hex(data["site_url"])
    print(f"[*] Decrypting (siteHash = {site_hash[:16]}...)...")
    content = decrypt_content(e_content, password, site_hash)

    if content is None:
        print("\nError: wrong password or unsupported encryption scheme.")
        sys.exit(1)

    # --- Parse tabs ---
    tabs = parse_tabs(content)
    print(f"[*] Found {len(tabs)} tab(s).")

    # --- Export ---
    out_folder = site_id
    os.makedirs(out_folder, exist_ok=True)

    for i, (title, body) in enumerate(tabs, 1):
        filename = safe_filename(title)
        filepath = unique_path(out_folder, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"    [{i}/{len(tabs)}] {os.path.basename(filepath)}")

    print(f"\n✓ Exported {len(tabs)} file(s) to '{out_folder}{os.sep}'")


if __name__ == "__main__":
    main()

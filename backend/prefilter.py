"""
Yerel on-filtre: API maliyeti SIFIR.
Gereksiz mesajlari eleyerek Haiku'ya gidecek mesaj sayisini azaltir.
100K mesajdan ~40K'ya dusurmeyi hedefler.
"""

import re

# Tek basina anlamsiz kisa yanıtlar
SKIP_EXACT = {
    "ok", "okay", "tamam", "tm", "tamamdır", "tmm", "tmm.", "tmmdr",
    "evet", "hayır", "hayir", "yok", "var", "he", "hee", "heh",
    "aha", "oha", "eyw", "eyv", "saol", "sağol", "tesekkurler",
    "teşekkürler", "tşk", "tsk", "👍", "👎", "🙏", "✅", "❌",
    "selam", "merhaba", "naber", "nbr", "sa", "as", "selamun aleyküm",
    "günaydın", "gunaydin", "iyi geceler", "iyi aksamlar",
    "hoşgeldin", "hosgeldin", "hoşbulduk", "hosbulduk",
    "+1", "+", ".", "..", "...", "?", "??", "!", "!!", "haha", "hahaha",
    "lol", "xd", "ajshdj", "sksks", "bruh",
    "geliyorum", "geldim", "çıktım", "ciktim", "yoldayım", "yoldayim",
    "bende", "ben de", "aynen", "kesinlikle", "tabii", "tabi",
}

# Emoji-only mesaj pattern
EMOJI_PATTERN = re.compile(
    r"^[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F"
    r"\U0000200D\U00002640\U00002642\U0000231A-\U0000231B"
    r"\U000023E9-\U000023F3\U000025AA-\U000025FE\U00002600-\U000026FF"
    r"\U00002700-\U000027BF\s]+$"
)

# URL-only mesaj
URL_PATTERN = re.compile(r"^https?://\S+$")


def should_skip(text: str) -> bool:
    """
    Mesajin atlanip atlanmayacagini belirle.
    True = bu mesaj onemsiz, API'ye gonderme.
    """
    if not text:
        return True

    stripped = text.strip().lower()

    # Cok kisa mesajlar (5 karakter ve alti)
    if len(stripped) <= 5:
        return True

    # Bilinen gereksiz mesajlar
    if stripped in SKIP_EXACT:
        return True

    # Sadece emoji
    if EMOJI_PATTERN.match(text.strip()):
        return True

    # Sadece URL (link paylasimi)
    if URL_PATTERN.match(stripped):
        return True

    # Sadece sayi (telefon numarasi, miktar vs - baglam olmadan anlamsiz)
    if stripped.replace(" ", "").replace("-", "").replace("+", "").isdigit():
        return True

    # Cok kisa ve soru/cevap formati (10 karakter alti)
    if len(stripped) < 10 and not any(c.isalpha() for c in stripped):
        return True

    return False


def has_keyword_match(text: str, keywords: set[str]) -> list[str]:
    """Keyword eslesmesi kontrol et."""
    if not text or not keywords:
        return []
    text_lower = text.lower()
    return [kw for kw in keywords if kw in text_lower]

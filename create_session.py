"""
Telegram Session Olusturucu
Bir kez calistirin, telefon numarasi ve dogrulama kodu girin.
Sonra session dosyasi olusacak ve bir daha giris yapmaniza gerek kalmayacak.
"""
import asyncio
from telethon import TelegramClient

API_ID = 34340998
API_HASH = "7c02612127f4fb371f94edc581140895"
SESSION_PATH = "session"  # session.session dosyasi olusacak

async def main():
    print("=" * 50)
    print("  Telegram Session Olusturucu")
    print("=" * 50)
    print()
    print("Simdi telefon numaranizi ve Telegram'dan gelecek")
    print("dogrulama kodunu girmeniz istenecek.")
    print()

    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()

    me = await client.get_me()
    print()
    print(f"Basarili! Giris yapilan hesap:")
    print(f"  Ad: {me.first_name} {me.last_name or ''}")
    print(f"  Kullanici: @{me.username or 'yok'}")
    print(f"  ID: {me.id}")
    print()
    print(f"Session dosyasi olusturuldu: session.session")
    print(f"Admin Chat ID'niz: {me.id}")
    print()
    print("Bu pencereyi kapatabilirsiniz.")

    await client.disconnect()

asyncio.run(main())

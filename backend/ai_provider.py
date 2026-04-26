"""
Multi-Provider AI Client
Desteklenen: anthropic, openai, gemini
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AIProvider:
    def __init__(self, api_key: str, provider: str = "anthropic", model: str = None):
        self.api_key  = api_key
        self.provider = provider.lower().strip()
        self.model    = model or self._default_model()
        self._client  = None
        self._init_client()

    def _default_model(self) -> str:
        return {
            "anthropic": "claude-haiku-4-5-20251001",
            "openai":    "gpt-4o-mini",
            "gemini":    "gemini-2.5-flash",
        }.get(self.provider, "gpt-4o-mini")

    def _init_client(self):
        try:
            if self.provider == "anthropic":
                from anthropic import AsyncAnthropic
                self._client = AsyncAnthropic(api_key=self.api_key)
            elif self.provider == "openai":
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self.api_key)
            elif self.provider == "gemini":
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                self._client = genai
            else:
                raise ValueError(f"Bilinmeyen provider: {self.provider}")
            logger.info(f"AI provider: {self.provider} / {self.model}")
        except ImportError as e:
            logger.error(f"{self.provider} kutuphanesi yok: {e}")
            raise

    async def complete(self, prompt: str, system: str = None,
                       max_tokens: int = 1000, model: str = None) -> str:
        use_model = model or self.model
        if not prompt or not prompt.strip():
            return ""  # Bos prompt -> bos cevap (Gemini "content empty" hatasini onler)
        try:
            if self.provider == "anthropic":
                kwargs = dict(model=use_model, max_tokens=max_tokens,
                              messages=[{"role": "user", "content": prompt}])
                if system:
                    kwargs["system"] = system
                resp = await self._client.messages.create(**kwargs)
                return resp.content[0].text

            elif self.provider == "openai":
                messages = []
                if system:
                    messages.append({"role": "system", "content": system})
                messages.append({"role": "user", "content": prompt})
                resp = await self._client.chat.completions.create(
                    model=use_model, messages=messages, max_tokens=max_tokens)
                return resp.choices[0].message.content

            elif self.provider == "gemini":
                import google.generativeai as genai
                kwargs = {"model_name": use_model}
                if system and system.strip():
                    kwargs["system_instruction"] = system
                m = genai.GenerativeModel(**kwargs)
                resp = await m.generate_content_async(prompt)
                # Empty/blocked icerik durumunda guvenli fallback
                try:
                    return resp.text or ""
                except Exception:
                    return ""

        except Exception as e:
            logger.error(f"[{self.provider}] complete() hata: {e}")
            raise

    async def image_complete(self, prompt: str, image_b64: str,
                             mime_type: str = "image/jpeg",
                             max_tokens: int = 4096) -> str:
        """Vision (image+text) completion. Tum 3 provider destekliyor."""
        try:
            if self.provider == "anthropic":
                resp = await self._client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=max_tokens,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": image_b64}},
                            {"type": "text", "text": prompt},
                        ],
                    }],
                )
                return resp.content[0].text

            elif self.provider == "openai":
                resp = await self._client.chat.completions.create(
                    model="gpt-4o-mini",
                    max_tokens=max_tokens,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url",
                             "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                        ],
                    }],
                )
                return resp.choices[0].message.content

            elif self.provider == "gemini":
                import google.generativeai as genai
                m = genai.GenerativeModel("gemini-2.5-flash")
                resp = await m.generate_content_async([
                    prompt,
                    {"mime_type": mime_type, "data": image_b64},
                ])
                try:
                    return resp.text or ""
                except Exception:
                    return ""

        except Exception as e:
            logger.error(f"[{self.provider}] image_complete hata: {e}")
            raise

    async def haiku_filter(self, prompt: str) -> str:
        fast = {"anthropic": "claude-haiku-4-5-20251001",
                "openai": "gpt-4o-mini", "gemini": "gemini-2.5-flash"}
        return await self.complete(prompt, max_tokens=500,
                                   model=fast.get(self.provider, self.model))

    async def sonnet_analyze(self, prompt: str, system: str = None) -> str:
        # Gemini 2.5-pro ucretsiz tier'da cok dusuk RPM (2 dk limit). flash daha esnek.
        # Kullanici ai_model belirlemisse onu kullanir; yoksa flash default.
        strong = {"anthropic": "claude-sonnet-4-20250514",
                  "openai": "gpt-4o", "gemini": "gemini-2.5-flash"}
        return await self.complete(prompt, system=system, max_tokens=4000,
                                   model=self.model or strong.get(self.provider, "gpt-4o"))

    @staticmethod
    def detect_provider(api_key: str) -> str:
        if not api_key:
            return "anthropic"
        k = api_key.strip()
        if k.startswith("sk-ant-"):
            return "anthropic"
        elif k.startswith("sk-"):
            return "openai"
        elif k.startswith("AIza"):
            return "gemini"
        return "anthropic"

    @staticmethod
    def available_models(provider: str) -> list:
        return {
            "anthropic": [
                {"id": "claude-haiku-4-5-20251001", "name": "Claude Haiku (Hizli, Ucuz)"},
                {"id": "claude-sonnet-4-20250514",  "name": "Claude Sonnet (Guclu)"},
            ],
            "openai": [
                {"id": "gpt-4o-mini",   "name": "GPT-4o Mini (Hizli, Ucuz)"},
                {"id": "gpt-4o",        "name": "GPT-4o (Guclu)"},
                {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo (En Ucuz)"},
            ],
            "gemini": [
                {"id": "gemini-2.5-flash",      "name": "Gemini 2.5 Flash (Hizli, Ucretsiz tier)"},
                {"id": "gemini-2.5-pro",        "name": "Gemini 2.5 Pro (Guclu)"},
                {"id": "gemini-2.0-flash",      "name": "Gemini 2.0 Flash"},
                {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash Lite (En Ucuz)"},
            ],
        }.get(provider, [])


def get_provider_for_user(user: dict) -> Optional[AIProvider]:
    api_key  = user.get("api_key", "") or ""
    provider = user.get("ai_provider") or AIProvider.detect_provider(api_key)
    model    = user.get("ai_model")
    if not api_key:
        return None
    try:
        return AIProvider(api_key=api_key, provider=provider, model=model)
    except Exception as e:
        logger.error(f"Provider olusturulamadi user={user.get('id')}: {e}")
        return None

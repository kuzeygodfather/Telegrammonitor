from supabase import create_client, Client
from config import config

supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)


def get_db() -> Client:
    """Supabase client referansi dondur."""
    return supabase

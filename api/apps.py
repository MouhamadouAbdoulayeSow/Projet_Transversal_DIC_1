from django.apps import AppConfig
import logging


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        from django.conf import settings
        # Connexion à MongoDB (lazy + tolérante aux erreurs en phase de setup)
        try:
            import mongoengine
            mongoengine.connect(**settings.MONGODB_SETTINGS)
        except Exception as e:
            # Éviter de bloquer des commandes Django ne nécessitant pas Mongo (ex: createsuperuser)
            logging.getLogger(__name__).warning(f"MongoDB non connecté au démarrage (ignorable pour certaines commandes): {e}")
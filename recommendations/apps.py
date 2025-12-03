from django.apps import AppConfig
import logging
import threading

logger = logging.getLogger(__name__)


class RecommendationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'recommendations'

    def ready(self):
        # Initialiser le système de recommandation content-based au démarrage
        try:
            from .engine import initialize_recommender
            initialize_recommender()
        except Exception as e:
            logger.warning(f"Impossible d'initialiser le modèle content-based au démarrage: {e}")
        
        # Auto-initialisation du modèle collaborative filtering en arrière-plan
        # Cela évite de bloquer le démarrage du serveur car l'entraînement peut prendre du temps
        def init_cf_background():
            try:
                from .engine import initialize_cf_recommender, get_global_cf_recommender
                from api.models import Event
                from mongoengine import get_db
                from django.conf import settings
                import mongoengine
                
                # Vérifier d'abord s'il y a des événements dans MongoDB
                try:
                    db = get_db()
                except:
                    try:
                        mongoengine.connect(**settings.MONGODB_SETTINGS)
                        db = get_db()
                    except Exception as e:
                        logger.warning(f"Impossible de se connecter à MongoDB pour vérifier les événements: {e}")
                        return
                
                events_collection = db['events']
                event_count = events_collection.count_documents({})
                
                if event_count == 0:
                    logger.info("Aucun événement trouvé dans MongoDB, le modèle CF ne sera pas initialisé automatiquement")
                    return
                
                # Vérifier si le modèle est déjà initialisé
                cf_recommender = get_global_cf_recommender()
                if cf_recommender and cf_recommender.is_fitted:
                    logger.info("Modèle CF déjà initialisé, pas besoin de réentraînement")
                    return
                
                logger.info(f"Initialisation automatique du modèle CF en arrière-plan ({event_count:,} événements détectés)...")
                logger.info("  (Cela peut prendre plusieurs minutes selon le volume de données)")
                
                # Initialiser avec des paramètres par défaut raisonnables
                # Utiliser un échantillonnage si trop d'événements pour accélérer
                sample_ratio = 1.0
                max_events = None
                
                # Si plus de 500k événements, utiliser un échantillonnage pour accélérer
                if event_count > 500000:
                    sample_ratio = 0.5  # Utiliser 50% des données pour l'auto-init
                    logger.info(f"  - Échantillonnage: 50% des données pour accélérer l'initialisation")
                
                initialize_cf_recommender(
                    max_events=max_events,
                    sample_ratio=sample_ratio,
                    min_interactions=2
                )
                
                cf_recommender = get_global_cf_recommender()
                if cf_recommender and cf_recommender.is_fitted:
                    logger.info(" Modèle CF initialisé automatiquement avec succès")
                else:
                    logger.warning("Échec de l'initialisation automatique du modèle CF")
                    
            except Exception as e:
                logger.error(f"Erreur lors de l'initialisation automatique du modèle CF: {e}", exc_info=True)
        
        # Lancer l'initialisation CF en arrière-plan dans un thread séparé
        # Cela permet au serveur de démarrer rapidement même si l'entraînement prend du temps
        try:
            cf_thread = threading.Thread(target=init_cf_background, daemon=True)
            cf_thread.start()
            logger.info("Thread d'initialisation CF lancé en arrière-plan")
        except Exception as e:
            logger.warning(f"Impossible de lancer l'initialisation CF en arrière-plan: {e}")
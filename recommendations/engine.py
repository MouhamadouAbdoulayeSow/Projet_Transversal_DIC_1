"""
Moteur de recommandation Content-Based Filtering et Collaborative Filtering
"""
import pandas as pd
import numpy as np
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from scipy.sparse import hstack, csr_matrix, coo_matrix, csr_matrix, coo_matrix
import logging
import threading
from collections import defaultdict
from collections import defaultdict

logger = logging.getLogger(__name__)

class ContentBasedRecommender:
    def __init__(self):
        self.tfidf = TfidfVectorizer(stop_words='english')
        self.scaler = MinMaxScaler()
        self.cosine_sim = None
        self.indices = None
        self.cb_df = None
    
    def fit(self, products_data):
        """
        Entraîne le modèle avec les données produits
        products_data: DataFrame avec colonnes ['itemid', 'name', 'ratings', 'discount_price', 'actual_price']
        """
        self.cb_df = products_data.copy()
        
        # 1. TF-IDF sur le nom du produit
        tfidf_matrix = self.tfidf.fit_transform(self.cb_df['name'])
        
        # 2. Normalisation des colonnes numériques
        numeric_features = self.cb_df[['ratings', 'discount_price', 'actual_price']]
        numeric_scaled = self.scaler.fit_transform(numeric_features)
        
        # 3. Fusion des caractéristiques texte + numériques
        combined_features = hstack([tfidf_matrix, numeric_scaled])
        
        # 4. Calcul des similarités cosinus
        self.cosine_sim = cosine_similarity(combined_features, combined_features)
        
        # 5. Indexation par itemid
        self.indices = pd.Series(self.cb_df.index, index=self.cb_df['itemid']).drop_duplicates()
    
    def get_recommendations_by_id(self, itemid, top_n=5):
        """
        FONCTION PRINCIPALE DE RECOMMANDATION
        """
        # Convertir itemid en string pour assurer la compatibilité
        itemid = str(itemid)
        if itemid not in self.indices:
            return f"L'identifiant produit {itemid} n'existe pas dans les données."
        
        # Index du produit
        idx = self.indices[itemid]
        
        # Scores de similarité
        sim_scores = list(enumerate(self.cosine_sim[idx]))
        sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
        
        # Exclure le produit lui-même et prendre les top_n suivants
        sim_scores = sim_scores[1:top_n+1]
        product_indices = [i[0] for i in sim_scores]
        
        # Retourner les produits recommandés
        return self.cb_df[['itemid', 'name', 'ratings', 'discount_price', 'actual_price']].iloc[product_indices]

    def get_recommendations_with_scores(self, itemid, top_n=5):
        """
        Retourne une liste de dicts incluant le score de similarité pour les explications
        """
        # Convertir itemid en string pour assurer la compatibilité
        itemid = str(itemid)
        if itemid not in self.indices:
            return f"L'identifiant produit {itemid} n'existe pas dans les données."
        idx = self.indices[itemid]
        sim_scores = list(enumerate(self.cosine_sim[idx]))
        sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)[1:top_n+1]
        results = []
        for i, score in sim_scores:
            row = self.cb_df.iloc[i]
            results.append({
                'itemid': row['itemid'],
                'name': row['name'],
                'ratings': float(row['ratings']),
                'discount_price': float(row['discount_price']),
                'actual_price': float(row['actual_price']),
                'similarity_score': float(score)
            })
        return results


# Instance globale du recommender
_global_recommender = None

def get_global_recommender():
    """Récupérer l'instance globale du recommender"""
    return _global_recommender

def initialize_recommender():
    """Initialiser le système de recommandation avec les données MongoDB"""
    global _global_recommender
    
    try:
        from api.models import Product
        
        # Récupérer tous les produits depuis MongoDB
        products = Product.objects.all()
        
        if not products:
            logger.warning("Aucun produit trouvé dans la base de données MongoDB")
            return
        
        # Convertir en DataFrame pandas
        products_data = []
        for product in products:
            products_data.append({
                'itemid': str(product.itemid),  # Convertir en string pour assurer la compatibilité
                'name': product.name,
                'ratings': product.ratings,
                'discount_price': float(product.discount_price),
                'actual_price': float(product.actual_price)
            })
        
        df = pd.DataFrame(products_data)
        
        # Créer et entraîner le recommender
        _global_recommender = ContentBasedRecommender()
        _global_recommender.fit(df)
        
        logger.info(f"Système de recommandation initialisé avec {len(df)} produits")
        
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du système de recommandation: {e}")

def retrain_recommender():
    """Réentraîner le système de recommandation (à appeler après ajout de nouveaux produits)"""
    initialize_recommender()


class CollaborativeFilteringRecommender:
    """
    Modèle de recommandation basé sur le filtrage collaboratif (item-based)
    S'entraîne directement sur les données MongoDB
    """
    def __init__(self, min_interactions=2, max_events=None, sample_ratio=1.0):
        """
        min_interactions: nombre minimum d'interactions pour qu'un item soit considéré
        max_events: nombre maximum d'événements à utiliser pour l'entraînement (None = tous)
        sample_ratio: ratio d'échantillonnage (0.0 à 1.0) - ex: 0.1 = 10% des données
        """
        self.min_interactions = min_interactions
        self.max_events = max_events
        self.sample_ratio = sample_ratio
        self.item_similarity_matrix = None
        self.item_index_map = None  # itemid -> index
        self.index_item_map = None  # index -> itemid
        self.user_item_matrix = None
        self.is_fitted = False
        self.training_stats = {}  # Statistiques sur l'entraînement
    
    @staticmethod
    def _normalize_itemid(itemid):
        """
        Normalise itemid en nombre (int) pour assurer la compatibilité avec MongoDB
        Gère les cas où itemid est déjà un nombre ou une string
        """
        if itemid is None:
            return None
        try:
            # Essayer de convertir en int
            return int(itemid)
        except (ValueError, TypeError):
            # Si la conversion échoue, retourner None
            return None

    def fit_from_mongodb(self):
        """
        Entraîne le modèle directement depuis MongoDB avec entraînement incrémental
        Utilise la collection 'events' pour construire la matrice utilisateur-item
        Gère les deux formats: nouveau (visitorid/itemid/event) et ancien (user_id/product_id/interaction_type)
        
        APPROCHE INCRÉMENTALE : Traite les données par batches et agrège progressivement
        pour pouvoir traiter de très grands volumes (1.2M+ lignes) sans saturer la mémoire.
        """
        try:
            from api.models import Product
            from mongoengine import get_db
            from django.conf import settings
            import mongoengine
            
            logger.info("Chargement des événements depuis MongoDB (mode incrémental)...")
            
            # Se connecter à MongoDB si pas déjà connecté
            try:
                db = get_db()
            except:
                mongoengine.connect(**settings.MONGODB_SETTINGS)
                db = get_db()
            
            # Lire directement depuis la collection pour éviter les problèmes de schéma
            events_collection = db['events']
            total_events = events_collection.count_documents({})
            
            if total_events == 0:
                logger.warning("Aucun événement trouvé dans MongoDB")
                return False
            
            # Déterminer combien d'événements utiliser
            events_to_use = total_events
            use_sampling = False
            if self.max_events and self.max_events < total_events:
                events_to_use = self.max_events
                logger.info(f"Limitation à {events_to_use} événements (sur {total_events} disponibles)")
            elif self.sample_ratio < 1.0:
                events_to_use = int(total_events * self.sample_ratio)
                use_sampling = True
                logger.info(f"Échantillonnage: utilisation de {events_to_use} événements ({self.sample_ratio*100:.1f}% de {total_events})")
            else:
                logger.info(f"Traitement de TOUS les {total_events} événements (mode incrémental)")
            
            # Fonction helper pour traiter un événement
            def process_event(event_doc):
                """Traite un document événement et retourne les données ou None"""
                try:
                    # Gérer les deux formats possibles
                    visitorid = None
                    itemid = None
                    event_type = None
                    
                    # Ancien format (UserInteraction) - basé sur les données de l'utilisateur
                    if 'user_id' in event_doc and 'product_id' in event_doc:
                        visitorid = str(event_doc.get('user_id', ''))
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(event_doc.get('product_id'))
                        event_type = str(event_doc.get('interaction_type', 'view'))
                    # Nouveau format (Event)
                    elif 'visitorid' in event_doc and 'itemid' in event_doc:
                        visitorid = str(event_doc.get('visitorid', ''))
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(event_doc.get('itemid'))
                        event_type = str(event_doc.get('event', 'view'))
                    else:
                        # Essayer de mapper les champs
                        visitorid = str(event_doc.get('visitorid') or event_doc.get('user_id') or '')
                        raw_itemid = event_doc.get('itemid') or event_doc.get('product_id')
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(raw_itemid)
                        event_type = str(event_doc.get('event') or event_doc.get('interaction_type') or 'view')
                    
                    if not visitorid or itemid is None:
                        return None
                    
                    # Normaliser le type d'événement
                    event_type = event_type.lower().strip()
                    # Mapper les types d'événements (ancien et nouveau format)
                    event_mapping = {
                        'view': 'view',
                        'addtocart': 'addtocart',
                        'add_to_cart': 'addtocart',
                        'transaction': 'transaction',
                        'purchase': 'transaction',
                        'removefromcart': 'view',  # Moins important
                        'like': 'view',  # Traiter comme une vue
                        'rating': 'view'  # Traiter comme une vue
                    }
                    event_type = event_mapping.get(event_type, 'view')
                    
                    # Pondérer les événements selon leur type
                    weight = 1.0
                    if event_type == 'transaction':
                        weight = 6.0
                    elif event_type == 'addtocart':
                        weight = 3.0
                    elif event_type == 'view':
                        weight = 1.0
                    
                    return {
                        'visitorid': visitorid,
                        'itemid': itemid,
                        'weight': weight
                    }
                except Exception as e:
                    logger.warning(f"Erreur lors du traitement d'un événement: {e}")
                    return None
            
            # ========================================================================
            # APPROCHE INCRÉMENTALE : Agrégation progressive par batches
            # ========================================================================
            # Au lieu de charger tous les événements en mémoire, on agrège directement
            # dans un dictionnaire qui accumule les poids par (visitorid, itemid)
            
            batch_size = 50000  # Traiter 50k événements à la fois
            aggregated_weights = defaultdict(float)  # (visitorid, itemid) -> poids cumulé
            processed_count = 0
            valid_events_count = 0
            
            logger.info(f"Début du traitement incrémental par batches de {batch_size} événements...")
            
            # Calculer le pas d'échantillonnage si nécessaire
            skip_step = None
            if use_sampling and events_to_use < total_events:
                skip_step = max(1, total_events // events_to_use)
                logger.info(f"Échantillonnage avec un pas de {skip_step} (1 événement tous les {skip_step})")
            
            # Traiter les événements par batches
            batch_num = 0
            for batch_start in range(0, total_events, batch_size):
                if processed_count >= events_to_use:
                    break
                
                batch_num += 1
                batch_events = list(events_collection.find().skip(batch_start).limit(batch_size))
                
                if not batch_events:
                    break
                
                # Traiter chaque événement du batch
                for i, event_doc in enumerate(batch_events):
                    if processed_count >= events_to_use:
                        break
                    
                    # Appliquer l'échantillonnage si nécessaire
                    if skip_step and (batch_start + i) % skip_step != 0:
                        continue
                    
                    event_data = process_event(event_doc)
                    if event_data:
                        # Agrégation incrémentale : accumuler les poids
                        key = (event_data['visitorid'], event_data['itemid'])
                        aggregated_weights[key] += event_data['weight']
                        valid_events_count += 1
                    
                    processed_count += 1
                
                # Log de progression tous les 10 batches
                if batch_num % 10 == 0:
                    logger.info(f"  Batch {batch_num}: {valid_events_count:,} événements valides traités / {processed_count:,} événements lus")
            
            if not aggregated_weights:
                logger.warning("Aucune donnée d'événement valide après agrégation")
                return False
            
            logger.info(f"Agrégation terminée: {len(aggregated_weights):,} paires (visitorid, itemid) uniques")
            logger.info(f"Total événements valides: {valid_events_count:,}")
            
            # Enregistrer les statistiques d'entraînement
            self.training_stats = {
                'total_events_in_db': total_events,
                'events_used': valid_events_count,
                'sample_ratio': valid_events_count / total_events if total_events > 0 else 0,
                'unique_pairs': len(aggregated_weights)
            }
            
            # Créer directement une matrice creuse (COO format) pour éviter les problèmes de mémoire
            # avec les grandes matrices pivot pandas
            logger.info("Creation de la matrice utilisateur-item (format creux)...")
            
            # Créer les mappings itemid et visitorid vers indices
            unique_items = sorted(set(i for (_, i) in aggregated_weights.keys()))
            unique_visitors = sorted(set(v for (v, _) in aggregated_weights.keys()))
            
            item_to_idx = {item: idx for idx, item in enumerate(unique_items)}
            visitor_to_idx = {visitor: idx for idx, visitor in enumerate(unique_visitors)}
            
            # Construire les listes pour la matrice COO (coordinate format)
            row_indices = []
            col_indices = []
            data_values = []
            
            for (visitor, item), weight in aggregated_weights.items():
                row_indices.append(item_to_idx[item])
                col_indices.append(visitor_to_idx[visitor])
                data_values.append(weight)
            
            # Libérer la mémoire du dictionnaire
            del aggregated_weights
            
            # Créer la matrice creuse COO puis convertir en CSR pour les opérations
            user_item_matrix_sparse = coo_matrix(
                (data_values, (row_indices, col_indices)),
                shape=(len(unique_items), len(unique_visitors))
            ).tocsr()
            
            # Filtrer les items avec trop peu d'interactions
            logger.info("Filtrage des items avec interactions insuffisantes...")
            # Compter les interactions par item (nombre de non-zéros par ligne)
            item_interaction_counts = pd.Series(
                (user_item_matrix_sparse > 0).sum(axis=1).A1,  # A1 pour convertir en array 1D
                index=unique_items
            )
            valid_items = item_interaction_counts[item_interaction_counts >= self.min_interactions].index.tolist()
            valid_item_indices = [item_to_idx[item] for item in valid_items]
            
            if len(valid_items) == 0:
                logger.warning("Aucun item avec suffisamment d'interactions")
                return False
            
            # Filtrer la matrice creuse pour ne garder que les items valides
            user_item_matrix_sparse = user_item_matrix_sparse[valid_item_indices, :]
            
            logger.info(f"Items valides apres filtrage: {len(valid_items):,}")
            logger.info(f"Utilisateurs uniques: {len(unique_visitors):,}")
            
            # Créer les mappings itemid <-> index (seulement pour les items valides)
            self.item_index_map = {itemid: idx for idx, itemid in enumerate(valid_items)}
            self.index_item_map = {idx: itemid for itemid, idx in self.item_index_map.items()}
            
            # La matrice est déjà en format CSR
            self.user_item_matrix = user_item_matrix_sparse
            
            # Calculer la similarité cosinus entre items (ITEM-BASED CF)
            logger.info(f"Calcul de la similarité cosinus entre {len(self.item_index_map):,} items...")
            logger.info("  (Cela peut prendre quelques minutes pour un grand nombre d'items...)")
            self.item_similarity_matrix = cosine_similarity(self.user_item_matrix)
            
            self.is_fitted = True
            
            # Mettre à jour les statistiques
            self.training_stats.update({
                'items_in_model': len(self.item_index_map),
                'users_in_model': self.user_item_matrix.shape[1],
                'matrix_shape': self.user_item_matrix.shape,
                'min_interactions': self.min_interactions,
                'similarity_matrix_shape': self.item_similarity_matrix.shape
            })
            
            logger.info("Modele collaborative filtering (ITEM-BASED) entraine avec succes!")
            logger.info(f"  - Items dans le modele: {len(self.item_index_map):,}")
            logger.info(f"  - Utilisateurs: {self.user_item_matrix.shape[1]:,}")
            logger.info(f"  - Evenements utilises: {self.training_stats['events_used']:,} / {total_events:,}")
            logger.info(f"  - Matrice de similarite: {self.item_similarity_matrix.shape}")
            
            return True
            
        except Exception as e:
            logger.error(f"Erreur lors de l'entraînement du modèle collaborative filtering: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False


    def get_recommendations_by_item(self, itemid, top_n=10):
        """
        Génère des recommandations basées sur un item spécifique (item-based)
        itemid: ID du produit
        top_n: nombre de recommandations à retourner
        """
        # Normaliser itemid en nombre pour assurer la compatibilité avec MongoDB
        itemid = self._normalize_itemid(itemid)
        if itemid is None:
            logger.warning(f"Itemid invalide, impossible de generer des recommandations")
            return []
        
        if not self.is_fitted:
            logger.warning(f"Modele non entraine, impossible de generer des recommandations pour {itemid}")
            return []
        
        if itemid not in self.item_index_map:
            logger.warning(f"Item {itemid} non trouve dans le modele (items disponibles: {len(self.item_index_map)})")
            # Retourner les items populaires comme fallback
            return self._get_popular_items(top_n)
        
        try:
            from api.models import Product
            
            item_idx = self.item_index_map[itemid]
            similarities = self.item_similarity_matrix[item_idx]
            
            # Trier par similarité (exclure l'item lui-même)
            similar_items = []
            for other_idx, similarity in enumerate(similarities):
                if other_idx == item_idx:
                    continue
                other_itemid = self.index_item_map[other_idx]
                similar_items.append((other_itemid, float(similarity)))
            
            similar_items.sort(key=lambda x: x[1], reverse=True)
            similar_items = similar_items[:top_n]
            
            # Récupérer les détails des produits
            results = []
            for other_itemid, score in similar_items:
                # other_itemid est déjà un nombre (normalisé lors de l'entraînement)
                product = Product.objects(itemid=other_itemid).first()
                if product:
                    results.append({
                        'itemid': product.itemid,
                        'name': product.name,
                        'ratings': float(product.ratings) if product.ratings else 0.0,
                        'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                        'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                        'similarity_score': score
                    })
            
            if not results:
                logger.warning(f"Aucun produit trouve pour les items similaires a {itemid}")
                # Fallback vers les items populaires
                return self._get_popular_items(top_n)
            
            return results
            
        except Exception as e:
            logger.error(f"Erreur lors de la generation de recommandations pour l'item {itemid}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Fallback vers les items populaires
            return self._get_popular_items(top_n)

    def _get_popular_items(self, top_n=10):
        """
        Retourne les items les plus populaires (basés sur le nombre d'interactions)
        Utilise directement la matrice du modèle si disponible, sinon compte depuis MongoDB
        """
        try:
            from api.models import Product
            from collections import Counter
            
            # Si le modèle est entraîné, utiliser la matrice pour trouver les items populaires
            if self.is_fitted and self.user_item_matrix is not None:
                # Compter les interactions par item (somme des valeurs non-nulles par ligne)
                item_interaction_counts = (self.user_item_matrix > 0).sum(axis=1).A1
                
                # Créer un dictionnaire itemid -> nombre d'interactions
                item_counts = {}
                for idx, count in enumerate(item_interaction_counts):
                    itemid = self.index_item_map[idx]
                    item_counts[itemid] = int(count)
                
                # Trier par popularité
                popular_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:top_n]
            else:
                # Fallback : utiliser MongoDB directement (mais seulement les champs Event)
                from api.models import Event
                from mongoengine import get_db
                from django.conf import settings
                import mongoengine
                
                try:
                    db = get_db()
                except:
                    mongoengine.connect(**settings.MONGODB_SETTINGS)
                    db = get_db()
                
                # Lire directement depuis la collection pour éviter les problèmes de schéma
                events_collection = db['events']
                item_counts = Counter()
                
                # Parcourir les événements par batches pour éviter les problèmes de mémoire
                batch_size = 10000
                total_events = events_collection.count_documents({})
                
                for batch_start in range(0, total_events, batch_size):
                    batch_events = list(events_collection.find().skip(batch_start).limit(batch_size))
                    for event_doc in batch_events:
                        # Utiliser les champs du modèle Event (visitorid, itemid, event)
                        raw_itemid = event_doc.get('itemid') or event_doc.get('product_id')
                        itemid = self._normalize_itemid(raw_itemid)
                        if itemid is not None:
                            item_counts[itemid] += 1
                
                popular_items = [itemid for itemid, _ in item_counts.most_common(top_n)]
                item_counts = dict(item_counts)
            
            # Récupérer les détails des produits
            results = []
            max_count = max(item_counts.values()) if item_counts else 1
            
            for itemid, count in popular_items:
                if isinstance(itemid, tuple):
                    itemid, count = itemid
                
                # Normaliser itemid en nombre pour la recherche MongoDB
                normalized_itemid = self._normalize_itemid(itemid)
                if normalized_itemid is None:
                    continue
                
                product = Product.objects(itemid=normalized_itemid).first()
                if product:
                    results.append({
                        'itemid': product.itemid,
                        'name': product.name,
                        'ratings': float(product.ratings) if product.ratings else 0.0,
                        'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                        'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                        'similarity_score': count / max_count if max_count > 0 else 0.0
                    })
            
            return results
            
        except Exception as e:
            logger.error(f"Erreur lors de la recuperation des items populaires: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []


# Instance globale du collaborative filtering recommender
_global_cf_recommender = None
_cf_initialization_lock = threading.Lock()
_cf_initialization_in_progress = False

def get_global_cf_recommender():
    """Récupérer l'instance globale du collaborative filtering recommender"""
    return _global_cf_recommender

def is_cf_initialization_in_progress():
    """Vérifier si une initialisation CF est en cours"""
    return _cf_initialization_in_progress

def initialize_cf_recommender(max_events=None, sample_ratio=1.0, min_interactions=2):
    """
    Initialiser le système de collaborative filtering avec les données MongoDB
    
    Args:
        max_events: Nombre maximum d'événements à utiliser (None = tous)
        sample_ratio: Ratio d'échantillonnage (0.0 à 1.0) - ex: 1.0 = 100% des données (défaut)
        min_interactions: Nombre minimum d'interactions par item
    
    Note: Par défaut, utilise TOUS les événements (sample_ratio=1.0) avec entraînement incrémental
    pour gérer de grands volumes de données (1.2M+ lignes) sans saturer la mémoire.
    """
    global _global_cf_recommender, _cf_initialization_in_progress
    
    # Vérifier si une initialisation est déjà en cours
    with _cf_initialization_lock:
        if _cf_initialization_in_progress:
            logger.info("Une initialisation CF est déjà en cours, attente...")
            return
        
        # Vérifier si le modèle est déjà initialisé
        if _global_cf_recommender and _global_cf_recommender.is_fitted:
            logger.info("Modèle CF déjà initialisé, pas besoin de réentraînement")
            return
        
        _cf_initialization_in_progress = True
    
    try:
        # Par défaut, utiliser TOUS les événements avec l'approche incrémentale
        _global_cf_recommender = CollaborativeFilteringRecommender(
            min_interactions=min_interactions,
            max_events=max_events,
            sample_ratio=sample_ratio
        )
        success = _global_cf_recommender.fit_from_mongodb()
        
        if success:
            logger.info("Système de collaborative filtering (ITEM-BASED) initialisé avec succès")
            if _global_cf_recommender.training_stats:
                stats = _global_cf_recommender.training_stats
                logger.info(f"  - Événements utilisés: {stats.get('events_used', 0):,} / {stats.get('total_events_in_db', 0):,}")
                logger.info(f"  - Items dans le modèle: {stats.get('items_in_model', 0):,}")
                logger.info(f"  - Utilisateurs: {stats.get('users_in_model', 0):,}")
        else:
            logger.warning("Échec de l'initialisation du collaborative filtering")
            _global_cf_recommender = None
        
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation du collaborative filtering: {e}")
        _global_cf_recommender = None
    finally:
        with _cf_initialization_lock:
            _cf_initialization_in_progress = False

def retrain_cf_recommender():
    """Réentraîner le système de collaborative filtering"""
    initialize_cf_recommender()


class CollaborativeFilteringRecommender:
    """
    Modèle de recommandation basé sur le filtrage collaboratif (item-based)
    S'entraîne directement sur les données MongoDB
    """
    def __init__(self, min_interactions=2, max_events=None, sample_ratio=1.0):
        """
        min_interactions: nombre minimum d'interactions pour qu'un item soit considéré
        max_events: nombre maximum d'événements à utiliser pour l'entraînement (None = tous)
        sample_ratio: ratio d'échantillonnage (0.0 à 1.0) - ex: 0.1 = 10% des données
        """
        self.min_interactions = min_interactions
        self.max_events = max_events
        self.sample_ratio = sample_ratio
        self.item_similarity_matrix = None
        self.item_index_map = None  # itemid -> index
        self.index_item_map = None  # index -> itemid
        self.user_item_matrix = None
        self.is_fitted = False
        self.training_stats = {}  # Statistiques sur l'entraînement
    
    @staticmethod
    def _normalize_itemid(itemid):
        """
        Normalise itemid en nombre (int) pour assurer la compatibilité avec MongoDB
        Gère les cas où itemid est déjà un nombre ou une string
        """
        if itemid is None:
            return None
        try:
            # Essayer de convertir en int
            return int(itemid)
        except (ValueError, TypeError):
            # Si la conversion échoue, retourner None
            return None

    def fit_from_mongodb(self):
        """
        Entraîne le modèle directement depuis MongoDB avec entraînement incrémental
        Utilise la collection 'events' pour construire la matrice utilisateur-item
        Gère les deux formats: nouveau (visitorid/itemid/event) et ancien (user_id/product_id/interaction_type)
        
        APPROCHE INCRÉMENTALE : Traite les données par batches et agrège progressivement
        pour pouvoir traiter de très grands volumes (1.2M+ lignes) sans saturer la mémoire.
        """
        try:
            from api.models import Product
            from mongoengine import get_db
            from django.conf import settings
            import mongoengine
            
            logger.info("Chargement des événements depuis MongoDB (mode incrémental)...")
            
            # Se connecter à MongoDB si pas déjà connecté
            try:
                db = get_db()
            except:
                mongoengine.connect(**settings.MONGODB_SETTINGS)
                db = get_db()
            
            # Lire directement depuis la collection pour éviter les problèmes de schéma
            events_collection = db['events']
            total_events = events_collection.count_documents({})
            
            if total_events == 0:
                logger.warning("Aucun événement trouvé dans MongoDB")
                return False
            
            # Déterminer combien d'événements utiliser
            events_to_use = total_events
            use_sampling = False
            if self.max_events and self.max_events < total_events:
                events_to_use = self.max_events
                logger.info(f"Limitation à {events_to_use} événements (sur {total_events} disponibles)")
            elif self.sample_ratio < 1.0:
                events_to_use = int(total_events * self.sample_ratio)
                use_sampling = True
                logger.info(f"Échantillonnage: utilisation de {events_to_use} événements ({self.sample_ratio*100:.1f}% de {total_events})")
            else:
                logger.info(f"Traitement de TOUS les {total_events} événements (mode incrémental)")
            
            # Fonction helper pour traiter un événement
            def process_event(event_doc):
                """Traite un document événement et retourne les données ou None"""
                try:
                    # Gérer les deux formats possibles
                    visitorid = None
                    itemid = None
                    event_type = None
                    
                    # Ancien format (UserInteraction) - basé sur les données de l'utilisateur
                    if 'user_id' in event_doc and 'product_id' in event_doc:
                        visitorid = str(event_doc.get('user_id', ''))
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(event_doc.get('product_id'))
                        event_type = str(event_doc.get('interaction_type', 'view'))
                    # Nouveau format (Event)
                    elif 'visitorid' in event_doc and 'itemid' in event_doc:
                        visitorid = str(event_doc.get('visitorid', ''))
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(event_doc.get('itemid'))
                        event_type = str(event_doc.get('event', 'view'))
                    else:
                        # Essayer de mapper les champs
                        visitorid = str(event_doc.get('visitorid') or event_doc.get('user_id') or '')
                        raw_itemid = event_doc.get('itemid') or event_doc.get('product_id')
                        itemid = CollaborativeFilteringRecommender._normalize_itemid(raw_itemid)
                        event_type = str(event_doc.get('event') or event_doc.get('interaction_type') or 'view')
                    
                    if not visitorid or itemid is None:
                        return None
                    
                    # Normaliser le type d'événement
                    event_type = event_type.lower().strip()
                    # Mapper les types d'événements (ancien et nouveau format)
                    event_mapping = {
                        'view': 'view',
                        'addtocart': 'addtocart',
                        'add_to_cart': 'addtocart',
                        'transaction': 'transaction',
                        'purchase': 'transaction',
                        'removefromcart': 'view',  # Moins important
                        'like': 'view',  # Traiter comme une vue
                        'rating': 'view'  # Traiter comme une vue
                    }
                    event_type = event_mapping.get(event_type, 'view')
                    
                    # Pondérer les événements selon leur type
                    weight = 1.0
                    if event_type == 'transaction':
                        weight = 6.0
                    elif event_type == 'addtocart':
                        weight = 3.0
                    elif event_type == 'view':
                        weight = 1.0
                    
                    return {
                        'visitorid': visitorid,
                        'itemid': itemid,
                        'weight': weight
                    }
                except Exception as e:
                    logger.warning(f"Erreur lors du traitement d'un événement: {e}")
                    return None
            
            # ========================================================================
            # APPROCHE INCRÉMENTALE : Agrégation progressive par batches
            # ========================================================================
            # Au lieu de charger tous les événements en mémoire, on agrège directement
            # dans un dictionnaire qui accumule les poids par (visitorid, itemid)
            
            batch_size = 50000  # Traiter 50k événements à la fois
            aggregated_weights = defaultdict(float)  # (visitorid, itemid) -> poids cumulé
            processed_count = 0
            valid_events_count = 0
            
            logger.info(f"Début du traitement incrémental par batches de {batch_size} événements...")
            
            # Calculer le pas d'échantillonnage si nécessaire
            skip_step = None
            if use_sampling and events_to_use < total_events:
                skip_step = max(1, total_events // events_to_use)
                logger.info(f"Échantillonnage avec un pas de {skip_step} (1 événement tous les {skip_step})")
            
            # Traiter les événements par batches
            batch_num = 0
            for batch_start in range(0, total_events, batch_size):
                if processed_count >= events_to_use:
                    break
                
                batch_num += 1
                batch_events = list(events_collection.find().skip(batch_start).limit(batch_size))
                
                if not batch_events:
                    break
                
                # Traiter chaque événement du batch
                for i, event_doc in enumerate(batch_events):
                    if processed_count >= events_to_use:
                        break
                    
                    # Appliquer l'échantillonnage si nécessaire
                    if skip_step and (batch_start + i) % skip_step != 0:
                        continue
                    
                    event_data = process_event(event_doc)
                    if event_data:
                        # Agrégation incrémentale : accumuler les poids
                        key = (event_data['visitorid'], event_data['itemid'])
                        aggregated_weights[key] += event_data['weight']
                        valid_events_count += 1
                    
                    processed_count += 1
                
                # Log de progression tous les 10 batches
                if batch_num % 10 == 0:
                    logger.info(f"  Batch {batch_num}: {valid_events_count:,} événements valides traités / {processed_count:,} événements lus")
            
            if not aggregated_weights:
                logger.warning("Aucune donnée d'événement valide après agrégation")
                return False
            
            logger.info(f"Agrégation terminée: {len(aggregated_weights):,} paires (visitorid, itemid) uniques")
            logger.info(f"Total événements valides: {valid_events_count:,}")
            
            # Enregistrer les statistiques d'entraînement
            self.training_stats = {
                'total_events_in_db': total_events,
                'events_used': valid_events_count,
                'sample_ratio': valid_events_count / total_events if total_events > 0 else 0,
                'unique_pairs': len(aggregated_weights)
            }
            
            # Créer directement une matrice creuse (COO format) pour éviter les problèmes de mémoire
            # avec les grandes matrices pivot pandas
            logger.info("Creation de la matrice utilisateur-item (format creux)...")
            
            # Créer les mappings itemid et visitorid vers indices
            unique_items = sorted(set(i for (_, i) in aggregated_weights.keys()))
            unique_visitors = sorted(set(v for (v, _) in aggregated_weights.keys()))
            
            item_to_idx = {item: idx for idx, item in enumerate(unique_items)}
            visitor_to_idx = {visitor: idx for idx, visitor in enumerate(unique_visitors)}
            
            # Construire les listes pour la matrice COO (coordinate format)
            row_indices = []
            col_indices = []
            data_values = []
            
            for (visitor, item), weight in aggregated_weights.items():
                row_indices.append(item_to_idx[item])
                col_indices.append(visitor_to_idx[visitor])
                data_values.append(weight)
            
            # Libérer la mémoire du dictionnaire
            del aggregated_weights
            
            # Créer la matrice creuse COO puis convertir en CSR pour les opérations
            user_item_matrix_sparse = coo_matrix(
                (data_values, (row_indices, col_indices)),
                shape=(len(unique_items), len(unique_visitors))
            ).tocsr()
            
            # Filtrer les items avec trop peu d'interactions
            logger.info("Filtrage des items avec interactions insuffisantes...")
            # Compter les interactions par item (nombre de non-zéros par ligne)
            item_interaction_counts = pd.Series(
                (user_item_matrix_sparse > 0).sum(axis=1).A1,  # A1 pour convertir en array 1D
                index=unique_items
            )
            valid_items = item_interaction_counts[item_interaction_counts >= self.min_interactions].index.tolist()
            valid_item_indices = [item_to_idx[item] for item in valid_items]
            
            if len(valid_items) == 0:
                logger.warning("Aucun item avec suffisamment d'interactions")
                return False
            
            # Filtrer la matrice creuse pour ne garder que les items valides
            user_item_matrix_sparse = user_item_matrix_sparse[valid_item_indices, :]
            
            logger.info(f"Items valides apres filtrage: {len(valid_items):,}")
            logger.info(f"Utilisateurs uniques: {len(unique_visitors):,}")
            
            # Créer les mappings itemid <-> index (seulement pour les items valides)
            self.item_index_map = {itemid: idx for idx, itemid in enumerate(valid_items)}
            self.index_item_map = {idx: itemid for itemid, idx in self.item_index_map.items()}
            
            # La matrice est déjà en format CSR
            self.user_item_matrix = user_item_matrix_sparse
            
            # Calculer la similarité cosinus entre items (ITEM-BASED CF)
            logger.info(f"Calcul de la similarité cosinus entre {len(self.item_index_map):,} items...")
            logger.info("  (Cela peut prendre quelques minutes pour un grand nombre d'items...)")
            self.item_similarity_matrix = cosine_similarity(self.user_item_matrix)
            
            self.is_fitted = True
            
            # Mettre à jour les statistiques
            self.training_stats.update({
                'items_in_model': len(self.item_index_map),
                'users_in_model': self.user_item_matrix.shape[1],
                'matrix_shape': self.user_item_matrix.shape,
                'min_interactions': self.min_interactions,
                'similarity_matrix_shape': self.item_similarity_matrix.shape
            })
            
            logger.info("Modele collaborative filtering (ITEM-BASED) entraine avec succes!")
            logger.info(f"  - Items dans le modele: {len(self.item_index_map):,}")
            logger.info(f"  - Utilisateurs: {self.user_item_matrix.shape[1]:,}")
            logger.info(f"  - Evenements utilises: {self.training_stats['events_used']:,} / {total_events:,}")
            logger.info(f"  - Matrice de similarite: {self.item_similarity_matrix.shape}")
            
            return True
            
        except Exception as e:
            logger.error(f"Erreur lors de l'entraînement du modèle collaborative filtering: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False


    def get_recommendations_by_item(self, itemid, top_n=10):
        """
        Génère des recommandations basées sur un item spécifique (item-based)
        itemid: ID du produit
        top_n: nombre de recommandations à retourner
        """
        if not self.is_fitted:
            logger.warning(f"Modele non entraine, impossible de generer des recommandations pour {itemid}")
            return []
        
        if itemid not in self.item_index_map:
            logger.warning(f"Item {itemid} non trouve dans le modele (items disponibles: {len(self.item_index_map)})")
            # Retourner les items populaires comme fallback
            return self._get_popular_items(top_n)
        
        try:
            from api.models import Product
            
            item_idx = self.item_index_map[itemid]
            similarities = self.item_similarity_matrix[item_idx]
            
            # Trier par similarité (exclure l'item lui-même)
            similar_items = []
            for other_idx, similarity in enumerate(similarities):
                if other_idx == item_idx:
                    continue
                other_itemid = self.index_item_map[other_idx]
                similar_items.append((other_itemid, float(similarity)))
            
            similar_items.sort(key=lambda x: x[1], reverse=True)
            similar_items = similar_items[:top_n]
            
            # Récupérer les détails des produits
            results = []
            for other_itemid, score in similar_items:
                product = Product.objects(itemid=other_itemid).first()
                if product:
                    results.append({
                        'itemid': product.itemid,
                        'name': product.name,
                        'ratings': float(product.ratings) if product.ratings else 0.0,
                        'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                        'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                        'similarity_score': score
                    })
            
            if not results:
                logger.warning(f"Aucun produit trouve pour les items similaires a {itemid}")
                # Fallback vers les items populaires
                return self._get_popular_items(top_n)
            
            return results
            
        except Exception as e:
            logger.error(f"Erreur lors de la generation de recommandations pour l'item {itemid}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Fallback vers les items populaires
            return self._get_popular_items(top_n)

    def _get_popular_items(self, top_n=10):
        """
        Retourne les items les plus populaires (basés sur le nombre d'interactions)
        Utilise directement la matrice du modèle si disponible, sinon compte depuis MongoDB
        """
        try:
            from api.models import Product
            from collections import Counter
            
            # Si le modèle est entraîné, utiliser la matrice pour trouver les items populaires
            if self.is_fitted and self.user_item_matrix is not None:
                # Compter les interactions par item (somme des valeurs non-nulles par ligne)
                item_interaction_counts = (self.user_item_matrix > 0).sum(axis=1).A1
                
                # Créer un dictionnaire itemid -> nombre d'interactions
                item_counts = {}
                for idx, count in enumerate(item_interaction_counts):
                    itemid = self.index_item_map[idx]
                    item_counts[itemid] = int(count)
                
                # Trier par popularité
                popular_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:top_n]
            else:
                # Fallback : utiliser MongoDB directement (mais seulement les champs Event)
                from api.models import Event
                from mongoengine import get_db
                from django.conf import settings
                import mongoengine
                
                try:
                    db = get_db()
                except:
                    mongoengine.connect(**settings.MONGODB_SETTINGS)
                    db = get_db()
                
                # Lire directement depuis la collection pour éviter les problèmes de schéma
                events_collection = db['events']
                item_counts = Counter()
                
                # Parcourir les événements par batches pour éviter les problèmes de mémoire
                batch_size = 10000
                total_events = events_collection.count_documents({})
                
                for batch_start in range(0, total_events, batch_size):
                    batch_events = list(events_collection.find().skip(batch_start).limit(batch_size))
                    for event_doc in batch_events:
                        # Utiliser les champs du modèle Event (visitorid, itemid, event)
                        raw_itemid = event_doc.get('itemid') or event_doc.get('product_id')
                        itemid = self._normalize_itemid(raw_itemid)
                        if itemid is not None:
                            item_counts[itemid] += 1
                
                popular_items = [itemid for itemid, _ in item_counts.most_common(top_n)]
                item_counts = dict(item_counts)
            
            # Récupérer les détails des produits
            results = []
            max_count = max(item_counts.values()) if item_counts else 1
            
            for itemid, count in popular_items:
                if isinstance(itemid, tuple):
                    itemid, count = itemid
                
                # Normaliser itemid en nombre pour la recherche MongoDB
                normalized_itemid = self._normalize_itemid(itemid)
                if normalized_itemid is None:
                    continue
                
                product = Product.objects(itemid=normalized_itemid).first()
                if product:
                    results.append({
                        'itemid': product.itemid,
                        'name': product.name,
                        'ratings': float(product.ratings) if product.ratings else 0.0,
                        'discount_price': float(product.discount_price) if product.discount_price else 0.0,
                        'actual_price': float(product.actual_price) if product.actual_price else 0.0,
                        'similarity_score': count / max_count if max_count > 0 else 0.0
                    })
            
            return results
            
        except Exception as e:
            logger.error(f"Erreur lors de la recuperation des items populaires: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return []


# La deuxième définition a été supprimée (duplication)
"""
Script de test pour le modèle Collaborative Filtering
Teste la lecture des données depuis MongoDB et l'entraînement du modèle
"""
import os
import sys
import django

# Ajouter le chemin du projet
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, project_root)

# Configuration Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ecommerce_api.settings.development')
django.setup()

print("=" * 80)
print("🧪 TEST DU MODÈLE COLLABORATIVE FILTERING")
print("=" * 80)
print("\n✅ Django configuré avec succès\n")

# Importer les modèles MongoDB
from api.models import Product, Event
import pandas as pd
import numpy as np
from collections import Counter
import logging

# Configurer le logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("✅ Modèles importés\n")
# 1. Lire les données de la collection Products
print("=" * 80)
print("📦 ÉTAPE 1: LECTURE DES PRODUITS DEPUIS MONGODB")
print("=" * 80)
print("\n📦 Lecture des produits depuis MongoDB...")

try:
    products = Product.objects.all()
    total_products = products.count()
    
    if total_products == 0:
        print("⚠️  Aucun produit trouvé dans MongoDB!")
        print("   Assurez-vous d'avoir importé des données avec:")
        print("   python manage.py import_csv_events --file data/final_df_copy.csv")
        sys.exit(1)
    
    # Convertir en DataFrame pour analyse
    products_data = []
    for product in products:
        products_data.append({
            'itemid': product.itemid,
            'name': product.name if product.name else f'Product {product.itemid}',
            'ratings': float(product.ratings) if product.ratings else 0.0,
            'discount_price': float(product.discount_price) if product.discount_price else 0.0,
            'actual_price': float(product.actual_price) if product.actual_price else 0.0,
            'category': product.category if hasattr(product, 'category') and product.category else None,
            'brand': product.brand if hasattr(product, 'brand') and product.brand else None,
        })
    
    df_products = pd.DataFrame(products_data)
    
    print(f"✅ {len(df_products)} produits chargés avec succès")
    print(f"\n📊 Aperçu des produits (10 premiers):")
    print(df_products[['itemid', 'name', 'ratings', 'discount_price']].head(10).to_string())
    print(f"\n📈 Statistiques numériques:")
    print(df_products[['ratings', 'discount_price', 'actual_price']].describe())
    print(f"\n🔍 Colonnes disponibles: {list(df_products.columns)}")
    print(f"\n📊 Produits avec catégorie: {df_products['category'].notna().sum()}")
    print(f"📊 Produits avec marque: {df_products['brand'].notna().sum()}")
    
except Exception as e:
    print(f"❌ Erreur lors de la lecture des produits: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 2. Lire les données de la collection Events
print("\n" + "=" * 80)
print("📊 ÉTAPE 2: LECTURE DES ÉVÉNEMENTS DEPUIS MONGODB")
print("=" * 80)
print("\n📊 Lecture des événements depuis MongoDB...")

try:
    # Utiliser l'accès direct à MongoDB pour éviter les problèmes de schéma
    from mongoengine import get_db
    from django.conf import settings
    import mongoengine
    
    # Se connecter à MongoDB si pas déjà connecté
    try:
        db = get_db()
    except:
        mongoengine.connect(**settings.MONGODB_SETTINGS)
        db = get_db()
    
    # Lire directement depuis la collection
    events_collection = db['events']
    total_events = events_collection.count_documents({})
    
    if total_events == 0:
        print("⚠️  Aucun événement trouvé dans MongoDB!")
        print("   Assurez-vous d'avoir importé des données avec:")
        print("   python manage.py import_csv_events --file data/final_df_copy.csv")
        sys.exit(1)
    
    print(f"   📊 {total_events} événements trouvés dans la collection")
    
    # Convertir en DataFrame pour analyse
    events_data = []
    sample_count = 0
    
    # Lire les événements par batch pour éviter la mémoire
    batch_size = 10000
    for batch_start in range(0, total_events, batch_size):
        batch_events = list(events_collection.find().skip(batch_start).limit(batch_size))
        
        for event_doc in batch_events:
            try:
                # Gérer les deux formats possibles (ancien et nouveau)
                if 'visitorid' in event_doc and 'itemid' in event_doc and 'event' in event_doc:
                    # Nouveau format
                    events_data.append({
                        'visitorid': str(event_doc.get('visitorid', '')),
                        'itemid': str(event_doc.get('itemid', '')),
                        'event': str(event_doc.get('event', 'view')),
                        'timestamp': event_doc.get('timestamp'),
                        'created_at': event_doc.get('created_at'),
                    })
                elif 'user_id' in event_doc and 'product_id' in event_doc and 'interaction_type' in event_doc:
                    # Ancien format (UserInteraction)
                    events_data.append({
                        'visitorid': str(event_doc.get('user_id', '')),
                        'itemid': str(event_doc.get('product_id', '')),
                        'event': str(event_doc.get('interaction_type', 'view')),
                        'timestamp': event_doc.get('timestamp'),
                        'created_at': event_doc.get('created_at'),
                    })
                else:
                    # Format inconnu, essayer de mapper les champs
                    visitorid = str(event_doc.get('visitorid') or event_doc.get('user_id') or '')
                    itemid = str(event_doc.get('itemid') or event_doc.get('product_id') or '')
                    event_type = str(event_doc.get('event') or event_doc.get('interaction_type') or 'view')
                    
                    if visitorid and itemid:
                        events_data.append({
                            'visitorid': visitorid,
                            'itemid': itemid,
                            'event': event_type,
                            'timestamp': event_doc.get('timestamp'),
                            'created_at': event_doc.get('created_at'),
                        })
            except Exception as e:
                # Ignorer les documents mal formés
                continue
        
        if len(events_data) >= 100000:  # Limiter pour les tests
            print(f"   ⚠️  Limitation à 100000 événements pour le test")
            break
    
    if not events_data:
        print("⚠️  Aucun événement valide trouvé dans MongoDB!")
        print("   Vérifiez le format des données dans la collection 'events'")
        sys.exit(1)
    
    df_events = pd.DataFrame(events_data)
    
    print(f"✅ {len(df_events)} événements chargés avec succès")
    print(f"\n📊 Aperçu des événements (10 premiers):")
    print(df_events.head(10).to_string())
    print(f"\n📈 Distribution des événements par type:")
    event_counts = df_events['event'].value_counts()
    for event_type, count in event_counts.items():
        percentage = (count / len(df_events)) * 100
        print(f"   - {event_type}: {count} ({percentage:.2f}%)")
    
    print(f"\n👥 Statistiques utilisateurs:")
    print(f"   - Nombre d'utilisateurs uniques: {df_events['visitorid'].nunique()}")
    print(f"   - Nombre de produits uniques: {df_events['itemid'].nunique()}")
    print(f"   - Interactions moyennes par utilisateur: {len(df_events) / df_events['visitorid'].nunique():.2f}")
    print(f"   - Interactions moyennes par produit: {len(df_events) / df_events['itemid'].nunique():.2f}")
    print(f"\n🔍 Colonnes disponibles: {list(df_events.columns)}")
    
except Exception as e:
    print(f"❌ Erreur lors de la lecture des événements: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 3. Analyse des données pour le collaborative filtering
print("\n" + "=" * 80)
print("🔍 ÉTAPE 3: ANALYSE DES DONNÉES POUR LE COLLABORATIVE FILTERING")
print("=" * 80)

# Vérifier la distribution des interactions
print("\n📊 Distribution des interactions par utilisateur:")
user_interaction_counts = df_events.groupby('visitorid').size()
print(f"   - Moyenne: {user_interaction_counts.mean():.2f}")
print(f"   - Médiane: {user_interaction_counts.median():.2f}")
print(f"   - Min: {user_interaction_counts.min()}")
print(f"   - Max: {user_interaction_counts.max()}")
print(f"   - Utilisateurs avec 1 seule interaction: {(user_interaction_counts == 1).sum()} ({(user_interaction_counts == 1).sum() / len(user_interaction_counts) * 100:.2f}%)")
print(f"   - Utilisateurs avec >= 5 interactions: {(user_interaction_counts >= 5).sum()} ({(user_interaction_counts >= 5).sum() / len(user_interaction_counts) * 100:.2f}%)")

print("\n📊 Distribution des interactions par produit:")
item_interaction_counts = df_events.groupby('itemid').size()
print(f"   - Moyenne: {item_interaction_counts.mean():.2f}")
print(f"   - Médiane: {item_interaction_counts.median():.2f}")
print(f"   - Min: {item_interaction_counts.min()}")
print(f"   - Max: {item_interaction_counts.max()}")
print(f"   - Produits avec 1 seule interaction: {(item_interaction_counts == 1).sum()} ({(item_interaction_counts == 1).sum() / len(item_interaction_counts) * 100:.2f}%)")
print(f"   - Produits avec >= 2 interactions: {(item_interaction_counts >= 2).sum()} ({(item_interaction_counts >= 2).sum() / len(item_interaction_counts) * 100:.2f}%)")
print(f"   - Produits avec >= 5 interactions: {(item_interaction_counts >= 5).sum()} ({(item_interaction_counts >= 5).sum() / len(item_interaction_counts) * 100:.2f}%)")

# Vérifier la matrice utilisateur-item
print("\n📊 Matrice utilisateur-item:")
try:
    user_item_matrix = df_events.groupby(['itemid', 'visitorid']).size().unstack(fill_value=0)
    print(f"   - Dimensions: {user_item_matrix.shape} (items x utilisateurs)")
    non_zero = (user_item_matrix > 0).sum().sum()
    total = user_item_matrix.shape[0] * user_item_matrix.shape[1]
    density = (non_zero / total) * 100 if total > 0 else 0
    print(f"   - Densité: {density:.4f}% ({non_zero}/{total} cellules non-nulles)")
    print(f"   - Produits avec au moins 2 interactions: {(user_item_matrix.sum(axis=1) >= 2).sum()}")
    print(f"   - Produits avec au moins 5 interactions: {(user_item_matrix.sum(axis=1) >= 5).sum()}")
except Exception as e:
    print(f"   ⚠️  Erreur lors de la création de la matrice: {e}")


# 4. Tester le modèle Collaborative Filtering
print("\n" + "=" * 80)
print("🤖 ÉTAPE 4: ENTRAÎNEMENT DU MODÈLE COLLABORATIVE FILTERING")
print("=" * 80)

from recommendations.engine import CollaborativeFilteringRecommender

print("\n🤖 Initialisation du modèle Collaborative Filtering...")

# Paramètres d'entraînement (ajustables selon les besoins)
# Pour 1.2M d'événements, on peut utiliser un échantillon
MAX_EVENTS = 200000  # Limiter à 200k événements pour l'entraînement
SAMPLE_RATIO = 0.15  # Ou utiliser 15% des données
MIN_INTERACTIONS = 2

print(f"   - Paramètres d'entraînement:")
if MAX_EVENTS:
    print(f"     * Max événements: {MAX_EVENTS}")
else:
    print(f"     * Ratio d'échantillonnage: {SAMPLE_RATIO*100:.1f}%")
print(f"     * Min interactions par item: {MIN_INTERACTIONS}")

# Créer et entraîner le modèle
try:
    cf_recommender = CollaborativeFilteringRecommender(
        min_interactions=MIN_INTERACTIONS,
        max_events=MAX_EVENTS,
        sample_ratio=SAMPLE_RATIO if not MAX_EVENTS else 1.0
    )
    
    print("\n⏳ Entraînement en cours...")
    print("   (Cela peut prendre quelques minutes pour les grandes quantités de données...)")
    success = cf_recommender.fit_from_mongodb()
    
    if success:
        print("\n✅ Modèle entraîné avec succès!")
        print(f"   - Nombre d'items dans le modèle: {len(cf_recommender.item_index_map)}")
        print(f"   - Matrice de similarité: {cf_recommender.item_similarity_matrix.shape}")
        print(f"   - Modèle prêt: {cf_recommender.is_fitted}")
        
        # Afficher les statistiques d'entraînement
        if hasattr(cf_recommender, 'training_stats') and cf_recommender.training_stats:
            stats = cf_recommender.training_stats
            print(f"\n📊 Statistiques d'entraînement:")
            print(f"   - Événements dans la DB: {stats.get('total_events_in_db', 0):,}")
            print(f"   - Événements utilisés: {stats.get('events_used', 0):,}")
            if stats.get('total_events_in_db', 0) > 0:
                ratio = stats.get('events_used', 0) / stats.get('total_events_in_db', 1) * 100
                print(f"   - Ratio utilisé: {ratio:.2f}%")
            print(f"   - Items dans le modèle: {stats.get('items_in_model', 0):,}")
            print(f"   - Utilisateurs dans le modèle: {stats.get('users_in_model', 0):,}")
            print(f"   - Forme de la matrice: {stats.get('matrix_shape', 'N/A')}")
    else:
        print("\n❌ Échec de l'entraînement du modèle")
        print("   Vérifiez que vous avez suffisamment de données dans MongoDB")
        sys.exit(1)
        
except Exception as e:
    print(f"\n❌ Erreur lors de l'entraînement: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)


# 5. Tester les recommandations par item
if success:
    print("\n" + "=" * 80)
    print("🔍 ÉTAPE 5: TEST DES RECOMMANDATIONS PAR ITEM")
    print("=" * 80)
    
    # Prendre quelques items qui ont des interactions
    items_with_interactions = df_events['itemid'].value_counts()
    test_items = items_with_interactions.head(10).index.tolist()
    
    print(f"\n📦 Test avec {len(test_items)} items populaires...\n")
    
    for idx, itemid in enumerate(test_items[:5], 1):
        print(f"{idx}. 📦 Recommandations pour l'item: {itemid}")
        
        # Trouver le nom du produit
        product_info = df_products[df_products['itemid'] == itemid]
        if not product_info.empty:
            product_name = product_info.iloc[0]['name']
            print(f"   Produit: {product_name[:60]}...")
        
        # Obtenir les interactions pour cet item
        item_interactions = df_events[df_events['itemid'] == itemid]
        print(f"   Interactions: {len(item_interactions)} ({item_interactions['event'].value_counts().to_dict()})")
        
        recommendations = cf_recommender.get_recommendations_by_item(itemid, top_n=5)
        
        if recommendations:
            print(f"   ✅ {len(recommendations)} recommandations trouvées:")
            for i, rec in enumerate(recommendations, 1):
                print(f"      {i}. {rec['name'][:55]}... (score: {rec['similarity_score']:.4f})")
        else:
            print(f"   ⚠️  Aucune recommandation (item pas dans le modèle ou pas assez d'interactions)")
        print()


# 6. Tester les recommandations par utilisateur
if success:
    print("\n" + "=" * 80)
    print("👤 ÉTAPE 6: TEST DES RECOMMANDATIONS PAR UTILISATEUR")
    print("=" * 80)
    
    # Prendre quelques utilisateurs avec plusieurs interactions
    users_with_interactions = df_events['visitorid'].value_counts()
    test_users = users_with_interactions[users_with_interactions >= 3].head(5).index.tolist()
    
    if not test_users:
        test_users = users_with_interactions.head(5).index.tolist()
    
    print(f"\n👤 Test avec {len(test_users)} utilisateurs actifs...\n")
    
    for idx, visitorid in enumerate(test_users, 1):
        print(f"{idx}. 👤 Recommandations pour l'utilisateur: {visitorid}")
        
        # Voir l'historique de l'utilisateur
        user_events = df_events[df_events['visitorid'] == visitorid]
        print(f"   📊 Historique: {len(user_events)} interactions")
        
        # Afficher les types d'événements
        event_types = user_events['event'].value_counts().to_dict()
        print(f"   📈 Types d'événements: {event_types}")
        
        # Afficher les produits interagis
        interacted_items = user_events['itemid'].unique()[:5]
        print(f"   📦 Produits interagis: {', '.join(interacted_items)}")
        
        # Les recommandations par utilisateur (user-based) ont été supprimées
        # Le modèle supporte uniquement les recommandations Item-Based
        print(f"   ℹ️  Les recommandations par utilisateur ne sont plus disponibles")
        print(f"   ℹ️  Utilisez get_recommendations_by_item(itemid) pour les recommandations Item-Based")
        print()

# 7. Analyse de la qualité du modèle
if success:
    print("\n" + "=" * 80)
    print("📊 ÉTAPE 7: ANALYSE DE LA QUALITÉ DU MODÈLE")
    print("=" * 80)
    
    # Distribution des similarités (échantillon pour éviter la mémoire)
    print("\n📈 Calcul des statistiques de similarité...")
    sample_size = min(1000, len(cf_recommender.item_similarity_matrix))
    similarity_values = []
    
    # Échantillonner aléatoirement pour les grandes matrices
    if len(cf_recommender.item_similarity_matrix) > 1000:
        indices = np.random.choice(len(cf_recommender.item_similarity_matrix), sample_size, replace=False)
        for i in indices:
            for j in range(i+1, len(cf_recommender.item_similarity_matrix)):
                similarity_values.append(cf_recommender.item_similarity_matrix[i, j])
                if len(similarity_values) >= 10000:  # Limiter à 10000 valeurs
                    break
            if len(similarity_values) >= 10000:
                break
    else:
        for i in range(len(cf_recommender.item_similarity_matrix)):
            for j in range(i+1, len(cf_recommender.item_similarity_matrix)):
                similarity_values.append(cf_recommender.item_similarity_matrix[i, j])
    
    similarity_array = np.array(similarity_values)
    print(f"   - Échantillon analysé: {len(similarity_array)} paires d'items")
    print(f"   - Moyenne: {similarity_array.mean():.4f}")
    print(f"   - Médiane: {np.median(similarity_array):.4f}")
    print(f"   - Min: {similarity_array.min():.4f}")
    print(f"   - Max: {similarity_array.max():.4f}")
    print(f"   - Écart-type: {similarity_array.std():.4f}")
    print(f"   - Similarités > 0.5: {(similarity_array > 0.5).sum()} ({(similarity_array > 0.5).sum() / len(similarity_array) * 100:.2f}%)")
    print(f"   - Similarités > 0.7: {(similarity_array > 0.7).sum()} ({(similarity_array > 0.7).sum() / len(similarity_array) * 100:.2f}%)")
    
    # Vérifier la sparsité
    non_zero = np.count_nonzero(cf_recommender.item_similarity_matrix)
    total = cf_recommender.item_similarity_matrix.size
    print(f"\n📊 Sparsité de la matrice de similarité:")
    print(f"   - Éléments non-nuls: {non_zero}/{total} ({non_zero/total*100:.4f}%)")
    print(f"   - Éléments nuls: {total - non_zero} ({(total - non_zero)/total*100:.4f}%)")
    
    print("\n" + "=" * 80)
    print("✅ TEST TERMINÉ AVEC SUCCÈS!")
    print("=" * 80)
    print("\n💡 Le modèle est prêt à être intégré dans les views!")
    print("   Vous pouvez maintenant utiliser:")
    print("   - get_global_cf_recommender() pour obtenir le modèle")
    print("   - cf_recommender.get_recommendations_by_item(itemid)  # Item-Based CF uniquement")
    print()

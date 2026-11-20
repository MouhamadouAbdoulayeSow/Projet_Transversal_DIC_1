# Hybrid E-commerce Recommendation System

**Domains:** Data · Software

Recommendation platform for an e-commerce catalogue, built as the DIC1 cross-disciplinary project at École Polytechnique de Thiès.
It combines two recommendation models and exposes them through a REST API and an analytics dashboard.

## What it does
- **Content-based recommendations:** TF-IDF vectors over product attributes and cosine similarity (`recommendations/engine.py`).
- **Collaborative filtering:** item-to-item model trained on user events (view, add-to-cart, transaction) stored in MongoDB, with sampling options and a popularity fallback for cold start.
- **Hybrid endpoint** that mixes both models for a given user.
- **Admin dashboard:** business KPIs, recommendation performance, interactions timeline, system health, alerts and model retraining.
- **Data import:** management commands load products and large CSV event logs into MongoDB in chunks.

## Stack
| Layer | Technologies |
|---|---|
| Backend | Python, Django, Django REST Framework, drf-yasg (Swagger) |
| ML | pandas, NumPy, scikit-learn, SciPy sparse matrices |
| Data | MongoDB (events, products), PostgreSQL (production), SQLite (development), Redis cache |
| Async | Celery with Redis broker |
| Front end | React, TypeScript, Vite, Tailwind CSS |

## Run locally
```bash
cp .env.example .env            # fill in database, MongoDB and Redis URLs
python -m venv venv && source venv/bin/activate
pip install django djangorestframework drf-yasg django-cors-headers pymongo mongoengine pandas numpy scikit-learn scipy celery redis
python manage.py migrate
python manage.py load_products_in_mongo
python manage.py import_csv_events --file <events.csv>
python manage.py init_recommender
python manage.py runserver

cd front && npm install && npm run dev
```

## Main API routes
- `GET /api/products/<itemid>/recommendations/`: similar products
- `GET /api/recommendations/user/` and `/user/hybrid/`: personalised recommendations
- `GET /api/recommendations/popular/`: popular products
- `POST /api/admin/retrain/` and `/api/admin/cf/retrain/`: retrain the models

# Plateforme Kubernetes avec CI/CD et observabilite

Application web conteneurisee deployee sur Kubernetes, avec pipeline CI/CD, autoscaling, monitoring et centralisation des logs. Projet de demonstration DevOps de bout en bout, deploye et valide sur un cluster Kubernetes local (Minikube).

## Stack technique

- Kubernetes (Minikube) - orchestration des conteneurs
- Docker - conteneurisation de l'application
- Helm - packaging et deploiement declaratif
- GitHub Actions - CI/CD automatise (build, push, deploiement)
- Ingress NGINX - routage HTTP
- HPA (Horizontal Pod Autoscaler) - scaling automatique selon la charge CPU
- Prometheus + Grafana - monitoring et visualisation des metriques
- Loki + Promtail - agregation et exploration centralisee des logs

## Architecture

```
GitHub push -> GitHub Actions -> Build & Push image (registre de conteneurs)
                                        |
                                 Deploiement Helm sur le cluster
                                        |
              +-------------------------------------------+
              |  Ingress NGINX (routage HTTP)              |
              |  Deployment (2-6 pods, HPA sur CPU)        |
              |  Prometheus + Grafana (metriques)          |
              |  Loki + Promtail (logs centralises)        |
              +-------------------------------------------+
```

## Fonctionnalites demontrees

- Build d'image Docker et deploiement sur un registre local (interne a Minikube)
- Deploiement declaratif via Helm Chart reutilisable (`values.yaml` parametrable)
- Exposition HTTP via Ingress NGINX
- Autoscaling horizontal valide : montee de 2 a N pods sous charge CPU reelle, testee avec un pod de charge dedie
- Pipeline CI/CD : chaque push sur `main` declenche le build de l'image, la validation du chart Helm (`helm lint`, `helm template`) et la publication sur un registre de conteneurs
- Observabilite complete : metriques temps reel (Prometheus/Grafana) et logs centralises (Loki/Promtail)

## Structure du projet

```
├── server.js                  Serveur Node.js (module http natif, sans dependances)
├── package.json
├── Dockerfile                 Image legere basee sur node:20-alpine
├── .dockerignore
├── loki-values.yaml           Configuration Loki adaptee a un deploiement local mono-noeud
├── helm/myapp/                Chart Helm (Deployment, Service, Ingress, HPA)
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
└── .github/workflows/         Pipeline CI/CD GitHub Actions
    └── deploy.yml
```

## Deploiement

### Sur Kubernetes local (Minikube)

```bash
minikube start --driver=docker --cpus=2 --memory=4096
minikube addons enable ingress
minikube addons enable metrics-server

eval $(minikube docker-env)
docker build -t myapp:local .

helm install myapp ./helm/myapp
```

Le fichier `helm/myapp/values.yaml` contient deja les valeurs par defaut adaptees a Minikube (image locale, pullPolicy `Never`, host `myapp.local`, TLS desactive), aucune surcharge `--set` n'est donc necessaire pour un deploiement local standard.

Acces a l'application, dans un terminal dedie :
```bash
minikube tunnel
```
puis ajout de `127.0.0.1 myapp.local` dans le fichier hosts local, et navigation vers `http://myapp.local`.

## Monitoring et logs

Installation de la stack observabilite :

```bash
# Prometheus + Grafana
helm install kube-prom-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# Loki (avec la configuration adaptee a un cluster local, voir loki-values.yaml)
helm install loki grafana/loki -n monitoring -f loki-values.yaml

# Promtail (collecte des logs sur chaque noeud)
helm install promtail grafana/promtail -n monitoring \
  --set config.clients[0].url=http://loki:3100/loki/api/v1/push
```

Connexion de Loki a Grafana : Connections > Data sources > Add data source > Loki, URL `http://loki:3100`.

## Captures d'ecran

Voir le dossier `docs/screenshots/` :

- `pods-running.png` - ensemble des pods de l'application et de la stack monitoring en fonctionnement
- `app-browser.png` - application accessible dans le navigateur
- `grafana-dashboard.png` - dashboard Grafana avec metriques CPU/memoire en temps reel
- `hpa-scaling.png` - autoscaling en action, montee du nombre de pods sous charge
- `grafana-loki-logs.png` - exploration des logs de l'application via Grafana/Loki

## Problemes rencontres et resolutions

Un projet DevOps reel n'est jamais lineaire. Voici les principaux blocages rencontres au fil du projet et la maniere dont ils ont ete resolus.

### Dashboards Grafana vides malgre des metriques collectees

**Probleme** : les panels CPU/memoire du dashboard "Compute Resources / Namespace (Pods)" restaient vides ("No data") alors que Prometheus collectait bien les metriques, confirme par une requete PromQL directe.

**Cause identifiee** : la variable de dashboard `cluster`, utilisee pour filtrer les requetes, reste vide sur un cluster mono-noeud comme Minikube, ce qui fait echouer silencieusement tous les filtres du dashboard.

**Resolution** : utilisation du dashboard "Compute Resources / Cluster", non affecte par cette variable, comme vue de monitoring principale.

### Installation Helm interrompue laissant un etat incoherent

**Probleme** : une installation `kube-prometheus-stack` annulee en cours de route (`context canceled`) bloquait toute nouvelle tentative avec l'erreur `cannot reuse a name that is still in use`.

**Resolution** : `helm uninstall` pour nettoyer proprement le release en echec avant de relancer l'installation, en laissant cette fois la commande s'executer jusqu'au bout sans interruption (l'installation complete de la stack prend deux a trois minutes).

### Incompatibilite de version entre Grafana et l'ancien chart Loki (`loki-stack`)

**Probleme** : la source de donnees Loki dans Grafana echouait avec `Unable to connect with Loki`, alors qu'un test reseau direct depuis un pod confirmait que le service repondait correctement.

**Cause identifiee** : les logs du pod Grafana revelaient la vraie erreur, `parse error: unexpected IDENTIFIER` - une incompatibilite entre la requete de health-check envoyee par un Grafana recent et la version de Loki embarquee dans l'ancien chart `loki-stack`, plus maintenu a jour.

**Resolution** : migration vers le chart moderne `grafana/loki` en mode `SingleBinary`, adapte a un cluster mono-noeud, avec desactivation des composants secondaires non necessaires en local (gateway, caches memcached).

### Rejet des requetes Loki a cause du mode multi-tenant

**Probleme** : apres la migration vers le chart `grafana/loki`, la connexion Grafana-Loki echouait encore, malgre un pod `loki-0` sain et un test reseau direct reussi.

**Cause identifiee** : le chart `grafana/loki` active par defaut l'authentification multi-tenant (`auth_enabled: true`), qui exige un header `X-Scope-OrgID` sur chaque requete API. Grafana n'envoyait pas ce header, et Loki rejetait donc systematiquement ses appels, y compris le simple health-check.

**Resolution** : creation d'un fichier `loki-values.yaml` a la racine du projet, fixant explicitement `auth_enabled: false` pour un usage local mono-utilisateur, ou la separation par tenant n'a pas d'utilite. Ce fichier centralise aussi les autres parametres valides lors des etapes precedentes (mode `SingleBinary`, desactivation des caches), ce qui rend l'installation reproductible en une seule commande :

```bash
helm install loki grafana/loki -n monitoring -f loki-values.yaml
```

## Ce que ce projet demontre

Ce projet couvre l'ensemble du cycle de vie d'une application cloud-native : de la conteneurisation a l'observabilite en production, en passant par l'automatisation complete du deploiement. Au-dela de la partie technique, il illustre une capacite a diagnostiquer et resoudre des blocages d'infrastructure reels - configuration reseau, compatibilite de versions entre outils, comportement par defaut de charts Helm - en s'appuyant sur les messages d'erreur et les logs plutot qu'en s'arretant au premier obstacle.
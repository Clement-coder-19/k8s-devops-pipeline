# Plateforme Kubernetes avec CI/CD et observabilité

Application web conteneurisée déployée sur Kubernetes, avec pipeline CI/CD, autoscaling, monitoring et centralisation des logs. Projet de démonstration DevOps de bout en bout, déployé et validé sur un cluster Kubernetes local (Minikube).

## Stack technique

* Kubernetes (Minikube) - orchestration des conteneurs
* Docker - conteneurisation de l'application
* Helm - packaging et déploiement déclaratif
* GitHub Actions - CI/CD automatisé (build, push, déploiement)
* Ingress NGINX - routage HTTP
* HPA (Horizontal Pod Autoscaler) - scaling automatique selon la charge CPU
* Prometheus + Grafana - monitoring et visualisation des métriques
* Loki + Promtail - agrégation et exploration centralisée des logs

## Contexte du projet

Avant de commencer ce projet, mes connaissances reposaient principalement sur Docker et Kubernetes. Les autres technologies utilisées dans la plateforme, notamment Helm, GitHub Actions et la stack d'observabilité, étaient nouvelles pour moi.

Mon objectif initial était de réaliser ce projet directement sur Microsoft Azure. Cependant, j’ai rencontré une limitation liée aux quotas de machines virtuelles disponibles dans la région **France Central**, qu’il m’était impossible d’augmenter. J’ai donc adapté mon approche en utilisant **Minikube** pour déployer et tester la plateforme localement, ainsi que **Docker Hub** pour la publication et la gestion de mes images Docker.

Par la suite, j’ai pu contourner cette limitation en utilisant la région **Poland Central** pour mes ressources Azure. Cela m’a permis de reprendre l’idée initiale et de la concrétiser dans un projet Azure plus complet, disponible ici : [azure-aks-terraform-platform](https://github.com/Clement-coder-19/azure-aks-terraform-platform).

Ce projet Kubernetes & Observabilité constitue ainsi une étape supplémentaire dans mon apprentissage du Cloud et du DevOps. Il m’a permis de consolider mes bases sur Kubernetes tout en découvrant la conteneurisation avancée, Helm, le CI/CD et l’observabilité, avant de mettre ces connaissances en pratique dans une infrastructure Kubernetes plus complète sur Azure.

## Architecture

## Fonctionnalités démontrées

* Build d'image Docker et déploiement sur un registre local (interne à Minikube)
* Déploiement déclaratif via Helm Chart réutilisable (`values.yaml` paramétrable)
* Exposition HTTP via Ingress NGINX
* Autoscaling horizontal validé : montée de 2 à N pods sous charge CPU réelle, testée avec un pod de charge dédié
* Pipeline CI/CD : chaque push sur `main` déclenche le build de l'image, la validation du chart Helm (`helm lint`, `helm template`) et la publication sur un registre de conteneurs
* Observabilité complète : métriques temps réel (Prometheus/Grafana) et logs centralisés (Loki/Promtail)

## Structure du projet

```text
├── server.js                  Serveur Node.js (module http natif, sans dépendances)
├── package.json
├── Dockerfile                 Image légère basée sur node:20-alpine
├── .dockerignore
├── loki-values.yaml           Configuration Loki adaptée à un déploiement local mono-nœud
├── helm/myapp/                Chart Helm (Deployment, Service, Ingress, HPA)
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
└── .github/workflows/         Pipeline CI/CD GitHub Actions
    └── deploy.yml
```

## Déploiement

### Sur Kubernetes local (Minikube)

```bash
minikube start --driver=docker --cpus=2 --memory=4096
minikube addons enable ingress
minikube addons enable metrics-server

eval $(minikube docker-env)
docker build -t myapp:local .

helm install myapp ./helm/myapp
```

Le fichier `helm/myapp/values.yaml` contient déjà les valeurs par défaut adaptées à Minikube (image locale, pullPolicy `Never`, host `myapp.local`, TLS désactivé), aucune surcharge `--set` n'est donc nécessaire pour un déploiement local standard.

Accès à l'application, dans un terminal dédié :

```bash
minikube tunnel
```

puis ajout de `127.0.0.1 myapp.local` dans le fichier hosts local, et navigation vers `http://myapp.local`.

## Test de l'autoscaling (HPA)

Procédure pour vérifier que le HPA réagit bien à une charge CPU réelle.

Vérifier l'état initial, au repos :

```bash
kubectl get hpa -w
```

Dans un terminal séparé, générer de la charge sur l'application via un pod dédié qui appelle le service en boucle :

```bash
kubectl run load-test --image=busybox --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://myapp; done"
```

Observer, dans le terminal où tourne `kubectl get hpa -w`, la colonne `TARGETS` monter au-dessus du seuil de 70 pourcent, puis la colonne `REPLICAS` augmenter progressivement (de 2 vers le maximum défini à 6).

Une fois la démonstration terminée, supprimer le pod de charge :

```bash
kubectl delete pod load-test
```

Le nombre de replicas redescend automatiquement à 2 après quelques minutes, une fois la charge CPU retombée sous le seuil.

## Monitoring et logs

Installation de la stack observabilité :

```bash
# Prometheus + Grafana
helm install kube-prom-stack prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# Loki (avec la configuration adaptée à un cluster local, voir loki-values.yaml)
helm install loki grafana/loki -n monitoring -f loki-values.yaml

# Promtail (collecte des logs sur chaque nœud)
helm install promtail grafana/promtail -n monitoring \
  --set config.clients[0].url=http://loki:3100/loki/api/v1/push
```

Connexion de Loki à Grafana : Connections > Data sources > Add data source > Loki, URL `http://loki:3100`.

## Captures d'écran

Voir le dossier `docs/screenshots/` :

* `pods-running.png` - ensemble des pods de l'application et de la stack monitoring en fonctionnement
* `app-browser.png` - application accessible dans le navigateur
* `hpa-scaling.png` - autoscaling en action, montée du nombre de pods sous charge
* `grafana-loki-logs.png` - exploration des logs de l'application via Grafana/Loki

## Problèmes rencontrés et résolutions

Un projet DevOps n'est jamais linéaire. Voici les principaux blocages rencontrés au fil du projet et la manière dont ils ont été résolus.

### Dashboards Grafana vides malgré des métriques collectées

**Problème** : les panels CPU/mémoire du dashboard "Compute Resources / Namespace (Pods)" restaient vides ("No data") alors que Prometheus collectait bien les métriques, confirmé par une requête PromQL directe.

**Cause identifiée** : la variable de dashboard `cluster`, utilisée pour filtrer les requêtes, reste vide sur un cluster mono-nœud comme Minikube, ce qui fait échouer silencieusement tous les filtres du dashboard.

**Résolution** : utilisation du dashboard "Compute Resources / Cluster", non affecté par cette variable, comme vue de monitoring principale.

### Installation Helm interrompue laissant un état incohérent

**Problème** : une installation `kube-prometheus-stack` annulée en cours de route (`context canceled`) bloquait toute nouvelle tentative avec l'erreur `cannot reuse a name that is still in use`.

**Résolution** : `helm uninstall` pour nettoyer proprement le release en échec avant de relancer l'installation, en laissant cette fois la commande s'exécuter jusqu'au bout sans interruption (l'installation complète de la stack prend deux à trois minutes).

### Incompatibilité de version entre Grafana et l'ancien chart Loki (`loki-stack`)

**Problème** : la source de données Loki dans Grafana échouait avec `Unable to connect with Loki`, alors qu'un test réseau direct depuis un pod confirmait que le service répondait correctement.

**Cause identifiée** : les logs du pod Grafana révélaient la vraie erreur, `parse error: unexpected IDENTIFIER` - une incompatibilité entre la requête de health-check envoyée par un Grafana récent et la version de Loki embarquée dans l'ancien chart `loki-stack`, plus maintenu à jour.

**Résolution** : migration vers le chart moderne `grafana/loki` en mode `SingleBinary`, adapté à un cluster mono-nœud, avec désactivation des composants secondaires non nécessaires en local (gateway, caches memcached).

### Rejet des requêtes Loki à cause du mode multi-tenant

**Problème** : après la migration vers le chart `grafana/loki`, la connexion Grafana-Loki échouait encore, malgré un pod `loki-0` sain et un test réseau direct réussi.

**Cause identifiée** : le chart `grafana/loki` active par défaut l'authentification multi-tenant (`auth_enabled: true`), qui exige un header `X-Scope-OrgID` sur chaque requête API. Grafana n'envoyait pas ce header, et Loki rejetait donc systématiquement ses appels, y compris le simple health-check.

**Résolution** : création d'un fichier `loki-values.yaml` à la racine du projet, fixant explicitement `auth_enabled: false` pour un usage local mono-utilisateur, où la séparation par tenant n'a pas d'utilité. Ce fichier centralise aussi les autres paramètres validés lors des étapes précédentes (mode `SingleBinary`, désactivation des caches), ce qui rend l'installation reproductible en une seule commande :

```bash
helm install loki grafana/loki -n monitoring -f loki-values.yaml
```

## Ce que ce projet démontre

Ce projet couvre l'ensemble du cycle de vie d'une application cloud-native : de la conteneurisation à l'observabilité en production, en passant par l'automatisation complète du déploiement.

## Licence

Ce projet est sous licence MIT - voir le fichier LICENSE pour plus de détails.

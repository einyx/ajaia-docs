# Kubernetes — plain manifests, deliberately not a Helm chart

**Why no Helm chart.** The product's deployment target is Cloudflare Workers + D1, which has no
Kubernetes footprint at all: there is no Deployment, no Service, no Ingress, and no stateful
volume — the database is a managed SQLite service and the app is a bundle uploaded with one
command. A chart would be a chart for a deployment that does not exist.

What is here is the honest fallback: if this app has to run inside a cluster (an enterprise
platform, a locked-down reviewer's environment, a demo without Cloudflare access), these
manifests are enough. They are plain YAML — apply them, or wrap them in whatever your platform
prefers. If you later need templating across environments, that is the moment a chart starts
to earn its keep.

```bash
kubectl apply -f deploy/k8s/
kubectl port-forward svc/ajaia-docs 8787:80
```

State: the app uses a local SQLite file, so the Deployment mounts a `PersistentVolumeClaim`.
That is fine for a single replica; running more than one replica against one SQLite file would
need a different database (the `Db` interface in `src/server/db.ts` is where that swap
happens — see §4 of the architecture note).

Files:

- `deployment.yaml` — the app (2 replicas by default; keep it at 1 with the PVC below)
- `service.yaml` — ClusterIP service on port 80
- `pvc.yaml` — 1 GiB volume for the SQLite file

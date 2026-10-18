# next-app

Helm chart for the Stellar Platform Next.js frontend: Deployment, Service,
ConfigMap, ExternalSecret, HorizontalPodAutoscaler and PodDisruptionBudget.

## Scaling and availability (#1603)

| Value | Default | Notes |
|-------|---------|-------|
| `resources.requests` | `100m` CPU, `256Mi` memory | Required for the HPA's utilization targets to mean anything |
| `resources.limits` | `500m` CPU, `512Mi` memory | |
| `autoscaling.enabled` | `true` | When on, the Deployment omits `replicas` so upgrades don't reset the HPA |
| `autoscaling.minReplicas` / `maxReplicas` | `2` / `10` | |
| `autoscaling.targetCPUUtilizationPercentage` | `70` | |
| `autoscaling.targetMemoryUtilizationPercentage` | `80` | Set to `null` to scale on CPU only |
| `autoscaling.behavior` | up: 4 pods/min after 30 s; down: 1 pod/min after 300 s | Passed through as HPA `spec.behavior` |
| `replicaCount` | `2` | Used only when `autoscaling.enabled` is `false` |
| `pdb.enabled` | `true` | Disable for single-replica installs, where `minAvailable: 1` blocks node drains |
| `pdb.minAvailable` | `1` | |
| `pdb.maxUnavailable` | unset | Takes precedence over `minAvailable` when set |

## Lint and render locally

```bash
helm lint helm/charts/next-app
helm template demo helm/charts/next-app --set autoscaling.enabled=false
```

CI runs `helm lint` on every chart (`.github/workflows/helm.yml`).

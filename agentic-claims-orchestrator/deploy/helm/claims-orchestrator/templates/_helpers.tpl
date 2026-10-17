{{- define "claims.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "claims.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "claims.labels" -}}
app.kubernetes.io/name: {{ include "claims.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "claims.selectorLabels" -}}
app.kubernetes.io/name: {{ include "claims.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "claims.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}{{ include "claims.fullname" . }}{{- else -}}default{{- end -}}
{{- end -}}

{{/* Shared env wiring for the app and the migration job. */}}
{{- define "claims.env" -}}
envFrom:
  - configMapRef:
      name: {{ include "claims.fullname" . }}
  - secretRef:
      name: {{ required "existingSecret is required" .Values.existingSecret }}
env:
  - name: POLICY_FILE
    value: {{ printf "%s/claims-policy.json" .Values.policy.mountPath | quote }}
{{- end -}}

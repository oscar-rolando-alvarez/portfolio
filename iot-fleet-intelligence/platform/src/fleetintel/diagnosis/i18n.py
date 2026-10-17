"""Spanish text used by the deterministic fake model and by pre-check refusals.

A real model writes translations itself (see ``SYSTEM_PROMPT``); these tables
let the offline pipeline, the evals and the dashboard demo exercise the same
bilingual contract without a network call. Keys mirror ``RootCause`` values and
the English tables in :mod:`fleetintel.diagnosis.llm` (same order).
"""

from __future__ import annotations

from typing import Any

ES_REMEDIATION: dict[str, list[str]] = {
    "cell_outage": [
        "Abrir un ticket RAN prioritario para el sitio afectado con la hora de la primera caída",
        "Revisar alarmas de energía y backhaul del sitio; correlacionar con el clima en la zona",
        "Activar el respaldo por celda vecina o red secundaria para los activos críticos",
    ],
    "congestion": [
        "Solicitar al operador los contadores de uso de PRB y un rebalanceo de carga",
        "Enviar a la flota una configuración de jitter de reporte y back-off exponencial",
    ],
    "reconnect_storm": [
        "Forzar back-off exponencial con jitter en la reconexión vía configuración",
        "Alinear el keep-alive de MQTT con los timeouts de NAT del operador",
        "Limitar la tasa de reconexiones en el broker mientras la flota se recupera",
    ],
    "roaming_misconfig": [
        "Verificar que el rango de IMSI esté habilitado en la red visitada del socio",
        "Corregir las restricciones de roaming en el perfil de suscriptor del grupo de SIM",
        "Permitir temporalmente una red socia alternativa en el mismo país",
    ],
    "apn_error": [
        "Revertir el último cambio de APN / perfil de suscriptor de las SIM afectadas",
        "Enviar por aire la configuración de APN corregida si los equipos fueron reconfigurados",
    ],
    "firmware_regression": [
        "Detener de inmediato el despliegue escalonado del firmware",
        "Revertir por aire los equipos afectados a la versión anterior, por oleadas",
        "Agregar la tasa de reinicios a la compuerta canary antes de reanudar",
    ],
    "insufficient_evidence": ["Recolectar otra ventana de detección antes de actuar"],
}

ES_CUSTOMER: dict[str, str] = {
    "cell_outage": "Una interrupción temporal de la red afecta a los equipos de una zona de cobertura. Se reconectarán y enviarán los datos almacenados automáticamente; no se requiere ninguna acción.",
    "congestion": "Algunos equipos se conectan más lento porque la red local está congestionada. No se pierden datos y estamos trabajando con el operador de red.",
    "reconnect_storm": "Algunos equipos se reconectaban con más frecuencia de lo normal, lo que puede reducir la vida de la batería. Se está aplicando una corrección remota.",
    "roaming_misconfig": "Los equipos que operan en el exterior sobre una red socia no podían conectarse por un problema de configuración. Lo estamos corrigiendo de forma remota.",
    "apn_error": "Algunos equipos no podían iniciar sesiones de datos por un problema de configuración de red. Se está restableciendo de forma remota; no se requiere visita en sitio.",
    "firmware_regression": "Una actualización reciente de software hizo que algunos equipos se reiniciaran. La actualización está en pausa y se está restaurando la versión anterior de forma remota.",
    "insufficient_evidence": "Estamos investigando un posible problema de conectividad y le informaremos en cuanto tengamos detalles confirmados.",
}

ES_ROOT: dict[str, str] = {
    "cell_outage": "caída de celda",
    "congestion": "congestión",
    "reconnect_storm": "tormenta de reconexiones",
    "roaming_misconfig": "error de configuración de roaming",
    "apn_error": "error de APN",
    "firmware_regression": "regresión de firmware",
    "insufficient_evidence": "evidencia insuficiente",
}

ES_SCOPE: dict[str, str] = {
    "cell": "la celda",
    "plmn": "la red visitada",
    "apn": "el APN",
    "firmware": "el firmware",
}


def es_summary(root: str, scope_type: str, scope: Any, affected: int) -> str:
    return (
        f"Posible {ES_ROOT.get(root, root)} en {ES_SCOPE.get(scope_type, scope_type)} {scope} "
        f"que afecta a {affected} equipos."
    )


def es_signal(name: str, value: Any, baseline: Any, z: Any) -> str:
    return f"{name} = {value} frente a la línea base {baseline} (z = {z})"


def es_cause(cause: str, count: int) -> str:
    return f"causa de rechazo dominante {cause} ({count} eventos)"


def es_affected(affected: int, total: Any, scope_type: str, scope: Any) -> str:
    return (
        f"{affected} de {total} equipos afectados en {ES_SCOPE.get(scope_type, scope_type)} {scope}"
    )


ES_ENRICHMENT: dict[str, str] = {
    "weather": "se reporta clima severo en la ubicación del sitio",
    "carrier": "existe acuerdo de roaming, por lo que el rechazo es un problema de aprovisionamiento",
    "status_feed": "el feed de estado del operador reporta un incidente activo relacionado",
}

ES_PRECHECK = "menos de 3 equipos afectados o sin desviación significativa"

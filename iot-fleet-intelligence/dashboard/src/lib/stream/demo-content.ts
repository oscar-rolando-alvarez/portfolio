/**
 * Diagnosis text for demo mode. Mirrors the platform's deterministic fake
 * model (platform/src/fleetintel/diagnosis/llm.py and diagnosis/i18n.py), so
 * demo incidents look exactly like what the real pipeline serves offline.
 */
import type { FaultType, RemediationStep } from "./types";

type Step = [action: string, owner: RemediationStep["owner"], automated: boolean];

export const REMEDIATION: Record<FaultType, { en: Step[]; es: string[] }> = {
  cell_outage: {
    en: [
      ["Open a priority RAN ticket for the affected site with first-drop timestamp", "noc", true],
      ["Check site power and backhaul alarms; correlate with weather at the site", "core_network", false],
      ["Enable neighbour-cell or secondary-network fallback for critical assets", "noc", false],
    ],
    es: [
      "Abrir un ticket RAN prioritario para el sitio afectado con la hora de la primera caída",
      "Revisar alarmas de energía y backhaul del sitio; correlacionar con el clima en la zona",
      "Activar el respaldo por celda vecina o red secundaria para los activos críticos",
    ],
  },
  congestion: {
    en: [
      ["Request PRB utilisation counters and load rebalancing from the operator", "carrier_relations", false],
      ["Push reporting jitter and exponential back-off configuration to the fleet", "device_ops", true],
    ],
    es: [
      "Solicitar al operador los contadores de uso de PRB y un rebalanceo de carga",
      "Enviar a la flota una configuración de jitter de reporte y back-off exponencial",
    ],
  },
  reconnect_storm: {
    en: [
      ["Enforce exponential back-off with jitter on reconnect via configuration", "device_ops", true],
      ["Align MQTT keep-alive with carrier NAT timeouts", "device_ops", false],
      ["Rate-limit reconnects on the broker while the fleet recovers", "noc", true],
    ],
    es: [
      "Forzar back-off exponencial con jitter en la reconexión vía configuración",
      "Alinear el keep-alive de MQTT con los timeouts de NAT del operador",
      "Limitar la tasa de reconexiones en el broker mientras la flota se recupera",
    ],
  },
  roaming_misconfig: {
    en: [
      ["Verify the IMSI range is opened at the visited partner network", "carrier_relations", false],
      ["Correct roaming restrictions in the subscriber profile for the SIM group", "core_network", false],
      ["Temporarily allow an alternative partner network in the same country", "noc", true],
    ],
    es: [
      "Verificar que el rango de IMSI esté habilitado en la red visitada del socio",
      "Corregir las restricciones de roaming en el perfil de suscriptor del grupo de SIM",
      "Permitir temporalmente una red socia alternativa en el mismo país",
    ],
  },
  apn_error: {
    en: [
      ["Roll back the latest APN / subscriber profile change for the affected SIMs", "core_network", false],
      ["Push the corrected APN configuration over the air if devices were reconfigured", "device_ops", true],
    ],
    es: [
      "Revertir el último cambio de APN / perfil de suscriptor de las SIM afectadas",
      "Enviar por aire la configuración de APN corregida si los equipos fueron reconfigurados",
    ],
  },
  firmware_regression: {
    en: [
      ["Halt the staged firmware rollout immediately", "device_ops", true],
      ["Roll back affected devices to the previous build over the air in waves", "device_ops", true],
      ["Add reset-rate to the rollout canary gate before resuming", "device_ops", false],
    ],
    es: [
      "Detener de inmediato el despliegue escalonado del firmware",
      "Revertir por aire los equipos afectados a la versión anterior, por oleadas",
      "Agregar la tasa de reinicios a la compuerta canary antes de reanudar",
    ],
  },
};

export const CUSTOMER: Record<FaultType, { en: string; es: string }> = {
  cell_outage: {
    en: "A temporary network outage is affecting devices in one coverage area. Devices will reconnect and upload buffered data automatically; no action is needed.",
    es: "Una interrupción temporal de la red afecta a los equipos de una zona de cobertura. Se reconectarán y enviarán los datos almacenados automáticamente; no se requiere ninguna acción.",
  },
  congestion: {
    en: "Some devices are connecting more slowly because the local network is busy. No data is lost and we are working with the network operator.",
    es: "Algunos equipos se conectan más lento porque la red local está congestionada. No se pierden datos y estamos trabajando con el operador de red.",
  },
  reconnect_storm: {
    en: "Some devices were reconnecting more often than normal, which can shorten battery life. A remote configuration fix is being applied.",
    es: "Algunos equipos se reconectaban con más frecuencia de lo normal, lo que puede reducir la vida de la batería. Se está aplicando una corrección remota.",
  },
  roaming_misconfig: {
    en: "Devices operating abroad on one partner network could not connect due to a configuration issue. We are correcting it remotely.",
    es: "Los equipos que operan en el exterior sobre una red socia no podían conectarse por un problema de configuración. Lo estamos corrigiendo de forma remota.",
  },
  apn_error: {
    en: "Some devices could not start data sessions because of a network configuration issue. It is being restored remotely; no on-site action is needed.",
    es: "Algunos equipos no podían iniciar sesiones de datos por un problema de configuración de red. Se está restableciendo de forma remota; no se requiere visita en sitio.",
  },
  firmware_regression: {
    en: "A recent software update caused some devices to restart. The update is paused and the previous version is being restored remotely.",
    es: "Una actualización reciente de software hizo que algunos equipos se reiniciaran. La actualización está en pausa y se está restaurando la versión anterior de forma remota.",
  },
};

export const ROOT_ES: Record<FaultType, string> = {
  cell_outage: "caída de celda",
  congestion: "congestión",
  reconnect_storm: "tormenta de reconexiones",
  roaming_misconfig: "error de configuración de roaming",
  apn_error: "error de APN",
  firmware_regression: "regresión de firmware",
};

export const SCOPE_ES = { cell: "la celda", plmn: "la red visitada", apn: "el APN", firmware: "el firmware" } as const;

export const RUNBOOKS: Record<FaultType, string[]> = {
  cell_outage: ["RB-CELL-001", "RB-GEN-001"],
  congestion: ["RB-CONG-001", "RB-GEN-001"],
  reconnect_storm: ["RB-STORM-001", "RB-GEN-001"],
  roaming_misconfig: ["RB-ROAM-001", "RB-SIM-001"],
  apn_error: ["RB-APN-001", "RB-SIM-001"],
  firmware_regression: ["RB-FW-001", "RB-GEN-001"],
};

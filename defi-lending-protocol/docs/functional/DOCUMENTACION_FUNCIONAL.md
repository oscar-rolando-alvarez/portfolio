# Protocolo DeFi de Préstamos - Documentación Funcional

## Tabla de Contenidos

1. [Visión General del Protocolo](#visión-general-del-protocolo)
2. [Características DeFi Principales](#características-defi-principales)
3. [Flujos de Préstamos y Créditos](#flujos-de-préstamos-y-créditos)
4. [Procesos de Liquidación](#procesos-de-liquidación)
5. [Gobernanza y Votación](#gobernanza-y-votación)
6. [Yield Farming y Recompensas](#yield-farming-y-recompensas)
7. [Uso de Flash Loans](#uso-de-flash-loans)
8. [Roles de Usuario y Permisos](#roles-de-usuario-y-permisos)
9. [Características de Gestión de Riesgo](#características-de-gestión-de-riesgo)
10. [Parámetros del Protocolo](#parámetros-del-protocolo)
11. [Modelo Económico](#modelo-económico)
12. [Guía de Interfaz de Usuario](#guía-de-interfaz-de-usuario)

## Visión General del Protocolo

El Protocolo DeFi de Préstamos es una plataforma de finanzas descentralizadas construida en Solana que permite a los usuarios:

- **Suministrar Activos**: Depositar tokens para ganar intereses y proporcionar liquidez
- **Pedir Prestado Activos**: Obtener préstamos contra colateral suministrado
- **Participar en Gobernanza**: Votar en parámetros y actualizaciones del protocolo
- **Ganar Recompensas**: Recibir tokens de gobernanza a través de yield farming
- **Acceder a Flash Loans**: Pedir prestado grandes cantidades sin colateral para arbitraje
- **Liquidar Posiciones**: Mantener la solvencia del protocolo liquidando posiciones riesgosas

### Beneficios Clave

- **Alto Rendimiento**: Construido en Solana para transacciones rápidas y de bajo costo
- **Descentralizado**: Ninguna autoridad central controla el protocolo
- **Transparente**: Todas las operaciones se registran en cadena
- **Componible**: Se integra con otros protocolos DeFi
- **Gobernanza**: Los poseedores de tokens controlan la evolución del protocolo
- **Oportunidades de Rendimiento**: Múltiples formas de obtener retornos

## Características DeFi Principales

### 1. Mercados Monetarios

El protocolo opera mercados monetarios para múltiples activos:

**Activos Soportados**:
- **USDC** (USD Coin) - Stablecoin con 6 decimales
- **SOL** (Solana) - Token nativo de blockchain con 9 decimales
- **USDT** (Tether) - Stablecoin con 6 decimales
- **BTC** (Bitcoin) - Bitcoin envuelto con 8 decimales

**Parámetros de Mercado**:
- **APY de Suministro**: Tasa variable basada en utilización
- **APY de Préstamo**: Mayor que la tasa de suministro para incentivar préstamos
- **Tasa de Utilización**: Porcentaje de activos disponibles actualmente prestados
- **Factor de Reserva**: Porcentaje de interés que va a la tesorería del protocolo

### 2. Modelo de Tasa de Interés

**Modelo de Doble Pendiente**:
- **Utilización Óptima**: 80% para la mayoría de activos
- **Bajo Óptimo**: Aumento gradual de tasa (pendiente 4%)
- **Sobre Óptimo**: Aumento pronunciado de tasa (pendiente 60%) para fomentar repago

**Ejemplo de Cálculo de Tasa** (USDC):
```
A 50% de Utilización:
- Tasa de Préstamo: 2.5% APY
- Tasa de Suministro: 2.25% APY (después del 10% factor de reserva)

A 90% de Utilización:
- Tasa de Préstamo: 34% APY
- Tasa de Suministro: 27.5% APY (después del 10% factor de reserva)
```

### 3. Sistema de Colateralización

**Ratios Préstamo-a-Valor (LTV)**:
- USDC: 75% - Pedir prestado hasta $75 por cada $100 suministrados
- SOL: 65% - Pedir prestado hasta $65 por cada $100 suministrados
- BTC: 70% - Pedir prestado hasta $70 por cada $100 suministrados

**Umbrales de Liquidación**:
- USDC: 80% - La posición se vuelve liquidable al 80% de ratio de deuda
- SOL: 75% - La posición se vuelve liquidable al 75% de ratio de deuda
- BTC: 75% - La posición se vuelve liquidable al 75% de ratio de deuda

### 4. Sistema de Factor de Salud

**Cálculo del Factor de Salud**:
```
Factor de Salud = (Valor Total del Colateral × Umbral de Liquidación) / Valor Total de Deuda
```

**Estado de Salud**:
- **>150%**: Muy Seguro - Bajo riesgo de liquidación
- **120-150%**: Seguro - Riesgo moderado
- **105-120%**: Riesgoso - Alto riesgo de liquidación
- **100-105%**: Crítico - Riesgo inmediato de liquidación
- **<100%**: Liquidable - La posición puede ser liquidada

## Flujos de Préstamos y Créditos

### Flujo de Suministro

1. **Conectar Wallet**: Conectar wallet de Solana (Phantom, Solflare, etc.)
2. **Seleccionar Activo**: Elegir entre tokens soportados (USDC, SOL, USDT, BTC)
3. **Ingresar Cantidad**: Especificar cantidad a suministrar
4. **Revisar Transacción**: Verificar APY, tarifas de gas y detalles de transacción
5. **Aprobar Transacción**: Firmar transacción con wallet
6. **Recibir aTokens**: Obtener tokens de recibo que generan intereses
7. **Ganar Intereses**: Los intereses se acumulan automáticamente cada segundo

**Beneficios del Suministro**:
- Ganar ingresos pasivos a través de intereses
- Los aTokens se aprecian en valor con el tiempo
- Mantener liquidez - retirar en cualquier momento
- Usar como colateral para préstamos

### Flujo de Préstamos

1. **Suministrar Colateral**: Debe haber suministrado activos primero
2. **Seleccionar Activo de Préstamo**: Elegir activo a pedir prestado
3. **Verificar Poder de Préstamo**: Ver capacidad de préstamo disponible
4. **Ingresar Cantidad de Préstamo**: Especificar cantidad dentro de límites
5. **Elegir Tipo de Tasa**: Seleccionar tasa variable o estable
6. **Revisar Factor de Salud**: Asegurar que la posición permanezca segura
7. **Ejecutar Préstamo**: Recibir tokens prestados
8. **Monitorear Posición**: Vigilar factor de salud y tasas

**Límites de Préstamo**:
```
Préstamo Máximo = Valor del Colateral × Ratio LTV

Ejemplo:
- Suministro: $1,000 USDC
- LTV: 75%
- Préstamo Máx: $750 en cualquier activo soportado
```

### Proceso de Repago

1. **Ver Deuda**: Verificar cantidad actual de deuda incluyendo intereses acumulados
2. **Seleccionar Cantidad de Repago**: Elegir repago parcial o completo
3. **Aprobar Gasto de Token**: Permitir al protocolo acceder a tokens
4. **Ejecutar Repago**: Los tokens de deuda se queman
5. **Mejorar Salud**: El factor de salud aumenta
6. **Desbloquear Colateral**: Capacidad de retirar más colateral

## Procesos de Liquidación

### Activadores de Liquidación

**Liquidación Automática** ocurre cuando:
- El Factor de Salud cae por debajo del 100%
- El valor del colateral disminuye debido a caídas de precios
- El valor de la deuda aumenta debido a intereses acumulados
- Las actualizaciones de precios del oráculo revelan que la posición está en pérdidas

### Mecánicas de Liquidación

**Flujo del Proceso**:
1. **Verificación de Salud**: El liquidador identifica posición no saludable
2. **Cálculo de Deuda**: Determinar deuda máxima liquidable (50% del total)
3. **Validación de Precio**: Verificar precios actuales del oráculo
4. **Ejecutar Liquidación**: Pagar deuda y recibir colateral + bono
5. **Actualizar Posición**: La deuda y colateral del usuario se reducen

**Ejemplo de Liquidación**:
```
Posición del Usuario:
- Colateral: 100 SOL ($8,000)
- Deuda: 7,000 USDC
- Factor de Salud: 0.95 (95% - por debajo del 100%)

Liquidación:
- Deuda Máxima Liquidable: 3,500 USDC (50%)
- Colateral Confiscado: ~50 SOL ($4,000)
- Bono de Liquidación: 15% = $600
- Ganancia del Liquidador: $600 de bono
```

### Protección contra Liquidación

**Para Prestatarios**:
- Monitorear factor de salud regularmente
- Configurar alertas para movimientos de precios
- Mantener ratios de préstamo conservadores
- Repagar deuda o agregar colateral cuando sea necesario

**Indicadores de Riesgo**:
- Factor de salud acercándose al 120%
- Alta volatilidad del mercado
- Precio del colateral cayendo
- Tasas de interés aumentando

## Gobernanza y Votación

### Token de Gobernanza (DLEND)

**Utilidades del Token**:
- Poder de voto en la gobernanza del protocolo
- Ganar recompensas a través de staking
- Descuentos en tarifas del protocolo
- Participación en ingresos de tarifas del protocolo

**Distribución del Token**:
- 40% - Recompensas de yield farming (4 años)
- 25% - Equipo de desarrollo (vesting de 3 años)
- 20% - Tesorería comunitaria
- 10% - Inversores tempranos (vesting de 2 años)
- 5% - Asesores y partnerships

### Proceso de Votación

**Creación de Propuesta**:
1. **Umbral Mínimo**: 100,000 tokens DLEND requeridos
2. **Detalles de Propuesta**: Título, descripción e implementación técnica
3. **Período de Votación**: 7 días para participación comunitaria
4. **Requisito de Quórum**: Participación mínima para validez

**Mecanismo de Votación**:
1. **Apostar Tokens**: Bloquear tokens DLEND para poder de voto
2. **Opciones de Voto**: A favor, En contra, o Abstención
3. **Poder de Voto**: Basado en cantidad apostada y duración del bloqueo
4. **Delegación**: Opción de delegar poder de voto a otros

**Proceso de Ejecución**:
1. **Propuesta Aprobada**: Debe tener apoyo mayoritario y cumplir quórum
2. **Período de Timelock**: Retraso de 2 días antes de ejecución
3. **Revisión del Guardián**: Cancelación de emergencia para propuestas maliciosas
4. **Implementación**: Ejecución automática de cambios aprobados

### Áreas de Gobernanza

**Parámetros del Protocolo**:
- Modelos de tasas de interés
- Ratios préstamo-a-valor
- Umbrales y bonos de liquidación
- Factores de reserva
- Configuraciones de oráculos

**Actualizaciones del Protocolo**:
- Listado de nuevos activos
- Mejoras de contratos inteligentes
- Cambios en estructura de tarifas
- Mejoras de seguridad

**Gestión de Tesorería**:
- Asignación de tarifas del protocolo
- Financiamiento de desarrollo
- Marketing y partnerships
- Gestión de fondos de emergencia

## Yield Farming y Recompensas

### Programa de Minería de Liquidez

**Distribución de Recompensas**:
- **50%** a proveedores de liquidez
- **50%** a prestatarios
- Recompensas distribuidas por pool basadas en uso
- Recompensas más altas para activos riesgosos/nuevos

**Método de Cálculo**:
```
Recompensas del Usuario = (Participación del Usuario × Recompensas del Pool × Tiempo) / Participación Total del Pool

Ejemplo:
- Pool: 1,000 tokens DLEND por día
- Usuario suministra 10% de liquidez del pool
- Usuario gana: 100 tokens DLEND por día
```

### Recompensas de Staking

**Staking de Gobernanza**:
- Bloquear tokens DLEND para poder de voto mejorado
- Ganar recompensas adicionales de DLEND
- Períodos de bloqueo más largos = multiplicadores más altos

**Multiplicadores de Período de Bloqueo**:
- 1 mes: multiplicador 1.0x
- 3 meses: multiplicador 1.25x
- 6 meses: multiplicador 1.5x
- 12 meses: multiplicador 2.0x

**Beneficios del Staking**:
- Poder de voto aumentado
- Tasas de recompensa más altas
- Participación en tarifas del protocolo
- Acceso temprano a nuevas características

### Reclamar Recompensas

**Proceso de Reclamo**:
1. **Acumular Recompensas**: Las recompensas se acumulan con el tiempo
2. **Ver Saldo**: Verificar recompensas ganadas pero no reclamadas
3. **Reclamar Tokens**: Ejecutar transacción de reclamo
4. **Recibir DLEND**: Tokens transferidos al wallet
5. **Opción de Composición**: Apostar automáticamente recompensas reclamadas

## Uso de Flash Loans

### Mecánicas de Flash Loan

**Préstamo Sin Colateral Cero**:
- Pedir prestado cualquier cantidad de liquidez disponible
- Debe repagar dentro de la misma transacción
- Tarifa del 0.09% cobrada sobre la cantidad prestada
- El repago fallido revierte toda la transacción

### Casos de Uso

**1. Arbitraje**:
```
Ejemplo:
1. Flash loan de 100,000 USDC
2. Comprar SOL en DEX A a $80
3. Vender SOL en DEX B a $81
4. Repagar préstamo + tarifa (90 USDC)
5. Ganancia: $910 (después de tarifas y gas)
```

**2. Intercambio de Colateral**:
```
Ejemplo:
1. Flash loan de 50,000 USDC
2. Repagar deuda existente
3. Retirar colateral
4. Suministrar nuevo tipo de colateral
5. Pedir prestado USDC para repagar flash loan
```

**3. Liquidación con Apalancamiento**:
```
Ejemplo:
1. Flash loan de cantidad de liquidación
2. Liquidar posición no saludable
3. Vender colateral recibido
4. Repagar flash loan
5. Quedarse con bono de liquidación
```

### Integración de Flash Loan

**Para Desarrolladores**:
- Implementar interfaz de receptor de flash loan
- Manejar fondos prestados dentro del callback
- Asegurar repago dentro de la misma transacción
- Considerar tarifas en cálculos de ganancia

**Consideraciones de Seguridad**:
- La transacción puede fallar si el repago es insuficiente
- Los costos de gas pueden afectar la rentabilidad
- Las condiciones del mercado pueden cambiar durante la ejecución
- Riesgos de contratos inteligentes en estrategias complejas

## Roles de Usuario y Permisos

### Tipos de Usuario

**1. Proveedores de Liquidez (Suministradores)**:
- Suministrar activos para ganar intereses
- Recibir aTokens representando depósitos
- Pueden retirar activos suministrados en cualquier momento (sujeto a utilización)
- Ganar tokens de gobernanza del protocolo

**Permisos**:
- Suministrar activos a cualquier pool
- Retirar liquidez disponible
- Usar depósitos como colateral
- Reclamar recompensas de yield farming

**2. Prestatarios**:
- Pedir prestado activos contra colateral
- Pagar tasas de interés variables o estables
- Deben mantener ratios de colateral saludables
- Pueden repagar deuda en cualquier momento

**Permisos**:
- Pedir prestado hasta límites LTV
- Elegir modo de tasa de interés
- Repagar deuda parcial o completamente
- Gestionar posiciones de colateral

**3. Liquidadores**:
- Monitorear posiciones no saludables
- Ejecutar liquidaciones por bonos
- Proporcionar servicio crucial al protocolo
- Ganar recompensas por mantener solvencia

**Permisos**:
- Liquidar posiciones por debajo del umbral de salud
- Recibir bonos de liquidación
- Acceder a datos de liquidación
- Ejecutar liquidaciones con flash loan

**4. Participantes de Gobernanza**:
- Poseer y apostar tokens DLEND
- Votar en propuestas del protocolo
- Proponer cambios al protocolo
- Ganar recompensas de gobernanza

**Permisos**:
- Crear propuestas (con tokens mínimos)
- Votar en propuestas activas
- Delegar poder de voto
- Reclamar recompensas de gobernanza

### Sistema de Control de Acceso

**Administrador del Protocolo**:
- Inicializar parámetros del protocolo
- Agregar nuevos pools de activos
- Pausar/despausar de emergencia
- Actualizar configuraciones de oráculos

**Administrador de Emergencia**:
- Pausar protocolo de emergencia
- Manejar incidentes de seguridad
- Coordinar con el equipo
- Implementar correcciones de emergencia

**Guardián**:
- Cancelar propuestas maliciosas
- Proteger proceso de gobernanza
- Monitorear ataques
- Coordinar con la comunidad

## Características de Gestión de Riesgo

### Riesgos a Nivel de Protocolo

**1. Riesgo de Contrato Inteligente**:
- **Mitigación**: Auditorías comprensivas, verificación formal
- **Seguro**: Integración con protocolos de seguro DeFi
- **Actualizaciones**: Mejoras controladas por gobernanza
- **Bug Bounties**: Incentivar investigación de seguridad

**2. Riesgo de Oráculo**:
- **Primario**: Feeds de precios de Red Pyth
- **Secundario**: Switchboard como respaldo
- **Validación**: Verificaciones de desviación de precio y obsolescencia
- **Disyuntores**: Pausar comercio en precios anómalos

**3. Riesgo de Liquidación**:
- **Incentivos**: Bonos de liquidación atractivos
- **Automatización**: Red de keepers para liquidaciones confiables
- **Umbrales**: Parámetros de liquidación conservadores
- **Monitoreo**: Seguimiento de posiciones en tiempo real

### Riesgos a Nivel de Usuario

**1. Riesgo de Liquidación**:
- **Educación**: Explicación clara del factor de salud
- **Alertas**: Notificaciones para posiciones riesgosas
- **Herramientas**: Calculadoras de riesgo y simuladores
- **Recomendaciones**: Ratios de préstamo seguros sugeridos

**2. Riesgo de Tasa de Interés**:
- **Transparencia**: Explicación clara del modelo de tasas
- **Opciones**: Opciones de tasas estables vs variables
- **Monitoreo**: Notificaciones de cambios de tasas
- **Flexibilidad**: Cambio fácil entre tipos de tasas

**3. Riesgo de Activo**:
- **Diversificación**: Soporte de múltiples activos
- **Parámetros**: Ratios LTV conservadores
- **Monitoreo**: Seguimiento continuo de precios
- **Ajustes**: Actualizaciones dinámicas de parámetros

### Parámetros de Riesgo

**Configuraciones Conservadoras**:
```
Activo: USDC (Stablecoin)
- LTV: 75%
- Umbral de Liquidación: 80%
- Bono de Liquidación: 10%
- Factor de Reserva: 10%

Activo: SOL (Volátil)
- LTV: 65%
- Umbral de Liquidación: 75%
- Bono de Liquidación: 15%
- Factor de Reserva: 15%
```

## Parámetros del Protocolo

### Configuración de Tasa de Interés

**Pool USDC**:
- Utilización Óptima: 80%
- Tasa Base: 0%
- Pendiente 1: 4%
- Pendiente 2: 60%
- Spread de Tasa Estable: 2%

**Pool SOL**:
- Utilización Óptima: 70%
- Tasa Base: 0%
- Pendiente 1: 7%
- Pendiente 2: 300%
- Spread de Tasa Estable: 3%

### Parámetros de Riesgo por Activo

| Parámetro | USDC | SOL | USDT | BTC |
|-----------|------|-----|------|-----|
| LTV | 75% | 65% | 75% | 70% |
| Umbral de Liquidación | 80% | 75% | 80% | 75% |
| Bono de Liquidación | 10% | 15% | 10% | 12% |
| Factor de Reserva | 10% | 15% | 10% | 15% |
| Decimales | 6 | 9 | 6 | 8 |

### Estructura de Tarifas

**Tarifas del Protocolo**:
- Factor de Reserva: 10-15% del interés pagado
- Tarifa de Flash Loan: 0.09% de la cantidad prestada
- Bono de Liquidación: 5-20% dependiendo del activo
- Staking de Gobernanza: Sin tarifas

**Costos de Gas** (Aproximados):
- Suministro: 0.001 SOL
- Préstamo: 0.002 SOL
- Repago: 0.001 SOL
- Liquidación: 0.003 SOL
- Flash Loan: 0.002 SOL

### Configuración de Oráculo

**Configuraciones de Feed de Precios**:
- Antigüedad Máxima: 5 minutos
- Umbral de Confianza: 1%
- Frecuencia de Actualización: Tiempo real
- Mecanismo de Respaldo: Oráculo secundario

**Oráculos Soportados**:
- Red Pyth (Primario)
- Switchboard (Secundario)
- Chainlink (Integración futura)

## Modelo Económico

### Flujos de Ingresos

**1. Spread de Interés**:
- Diferencia entre tasas de préstamo y préstamo
- El factor de reserva captura porción para el protocolo
- Financia desarrollo y seguridad del protocolo

**2. Tarifas de Flash Loan**:
- Tarifa del 0.09% en todos los flash loans
- Fuente de ingresos de alto volumen y bajo riesgo
- Soporta liquidez sin capital permanente

**3. Tarifas de Liquidación**:
- Pequeña tarifa en bonos de liquidación
- Incentiva ecosistema saludable
- Financia infraestructura de liquidación

### Economía de Tokens

**Suministro de Token DLEND**: 100,000,000 tokens

**Cronograma de Emisión**:
- Año 1: 40% de recompensas (tasa decreciente)
- Año 2: 30% de recompensas
- Año 3: 20% de recompensas
- Año 4: 10% de recompensas
- Después del Año 4: Determinado por gobernanza

**Acumulación de Valor**:
- Participación en tarifas para stakers
- Derechos de voto de gobernanza
- Propiedad del protocolo
- Beneficios de actualizaciones futuras

### Modelo de Sostenibilidad

**Viabilidad a Largo Plazo**:
- Flujos de ingresos diversificados
- Parámetros de riesgo conservadores
- Gobernanza comunitaria
- Innovación continua

**Estrategia de Crecimiento**:
- Listado de nuevos activos
- Expansión cross-chain
- Partnerships institucionales
- Integraciones DeFi

## Guía de Interfaz de Usuario

### Primeros Pasos

**1. Conexión de Wallet**:
- Instalar Phantom, Solflare, o wallet compatible
- Visitar sitio web del protocolo
- Hacer clic en "Conectar Wallet"
- Aprobar conexión en wallet

**2. Primer Depósito**:
- Navegar a sección "Suministro"
- Seleccionar activo (USDC recomendado para principiantes)
- Ingresar cantidad a suministrar
- Revisar detalles de transacción
- Confirmar transacción

**3. Ganar Intereses**:
- Ver aTokens en wallet
- Verificar ganancias en dashboard
- Los intereses se componen automáticamente
- Retirar en cualquier momento (sujeto a utilización)

### Visión General del Dashboard

**Sección de Portafolio**:
- Valor total suministrado
- Valor total prestado
- APY neto a través de posiciones
- Estado del factor de salud

**Sección de Mercados**:
- Activos disponibles
- Tasas APY actuales
- Tasas de utilización
- Sus posiciones

**Sección de Recompensas**:
- Tokens DLEND ganados
- Recompensas de staking
- Cantidades reclamables
- Opciones de staking

### Características Avanzadas

**Interfaz de Préstamos**:
```
Colateral: $10,000 USDC
Disponible para Préstamo: $7,500 (75% LTV)
Factor de Salud: 1.5 (Seguro)

Opciones de Préstamo:
- SOL: 5.2% APY Variable
- USDT: 3.8% APY Variable
- BTC: 4.1% APY Variable
```

**Herramientas de Gestión de Riesgo**:
- Calculadora de factor de salud
- Alertas de precio de liquidación
- Simulador de posición
- Recomendaciones de riesgo

**Interfaz de Gobernanza**:
- Propuestas activas
- Historial de votación
- Dashboard de staking
- Opciones de delegación

### Experiencia Móvil

**Diseño Responsivo**:
- Optimizado para navegadores móviles
- Interfaz amigable al tacto
- Acciones rápidas para tareas comunes
- Notificaciones en tiempo real

**Características Clave**:
- Visión general del portafolio
- Suministro/préstamo rápido
- Monitoreo de salud
- Reclamo de recompensas

---

Esta documentación funcional proporciona guía comprensiva para que los usuarios entiendan e interactúen con el Protocolo DeFi de Préstamos. La plataforma ofrece servicios financieros sofisticados mientras mantiene interfaces amigables al usuario y características robustas de gestión de riesgo, haciéndola accesible tanto para principiantes como para usuarios DeFi experimentados.
# Protocolo DeFi de Préstamos - Documentación Técnica

## Tabla de Contenidos

1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Estructura de Contratos Inteligentes](#estructura-de-contratos-inteligentes)
3. [Cuentas de Programa y PDAs](#cuentas-de-programa-y-pdas)
4. [Modelos de Tasas de Interés](#modelos-de-tasas-de-interés)
5. [Mecanismos de Liquidación](#mecanismos-de-liquidación)
6. [Integración de Oráculos](#integración-de-oráculos)
7. [Implementación de Flash Loans](#implementación-de-flash-loans)
8. [Sistema de Gobernanza](#sistema-de-gobernanza)
9. [Arquitectura del Frontend](#arquitectura-del-frontend)
10. [Medidas de Seguridad](#medidas-de-seguridad)
11. [Marco de Pruebas](#marco-de-pruebas)
12. [Proceso de Despliegue](#proceso-de-despliegue)
13. [Fórmulas Matemáticas](#fórmulas-matemáticas)
14. [Optimización de Gas](#optimización-de-gas)

## Visión General de la Arquitectura

El Protocolo DeFi de Préstamos está construido en Solana utilizando el framework Anchor, consistiendo en dos programas principales:

### Programas Principales
- **Protocolo Principal de Préstamos** (`DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT`)
- **Token de Gobernanza** (`GovToknAbCdEfGhIjKlMnOpQrStUvWxYz123456789`)

### Componentes de la Arquitectura
```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                          │
├─────────────────────────────────────────────────────────────────┤
│                 Capa de Integración de Wallet                  │
├─────────────────────────────────────────────────────────────────┤
│              Interfaz de Programa Anchor                       │
├─────────────────────────────────────────────────────────────────┤
│                     Runtime de Solana                          │
├─────────────────────────────────────────────────────────────────┤
│  Programa Principal    │   Programa de Gobernanza │   Oráculos  │
├─────────────────────────────────────────────────────────────────┤
│                      Blockchain Solana                         │
└─────────────────────────────────────────────────────────────────┘
```

## Estructura de Contratos Inteligentes

### Protocolo Principal de Préstamos (`src/lib.rs`)

El programa principal expone 17 instrucciones principales:

1. **initialize_protocol** - Inicializar estado global del protocolo
2. **initialize_pool** - Crear pools de liquidez para tokens
3. **supply** - Depositar tokens para ganar intereses
4. **withdraw** - Retirar tokens suministrados
5. **borrow** - Pedir prestado tokens contra colateral
6. **repay** - Repagar tokens prestados
7. **liquidate** - Liquidar posiciones no saludables
8. **flash_loan** - Ejecutar préstamos flash
9. **update_interest_rates** - Actualizar tasas de interés del pool
10. **claim_rewards** - Reclamar recompensas de yield farming
11. **update_oracle_price** - Actualizar datos de precio del oráculo
12. **init_user_obligation** - Inicializar cuenta de usuario
13. **deposit_collateral** - Depositar tokens de colateral
14. **withdraw_collateral** - Retirar tokens de colateral
15. **stake_governance_tokens** - Apostar tokens para votar
16. **unstake_governance_tokens** - Desapostar tokens de gobernanza

### Estructura de Módulos
```
src/
├── lib.rs              # Punto de entrada principal del programa
├── constants.rs        # Constantes y límites del protocolo
├── errors.rs           # Definiciones de errores personalizados
├── instructions.rs     # Exportación de módulos de instrucciones
├── state.rs           # Exportación de estructuras de estado
├── utils.rs           # Funciones utilitarias
├── instructions/      # Implementaciones de instrucciones individuales
│   ├── borrow.rs
│   ├── supply.rs
│   ├── liquidate.rs
│   ├── flash_loan.rs
│   └── ...
├── state/            # Definiciones de cuentas de estado
│   ├── protocol.rs
│   ├── pool.rs
│   ├── user_obligation.rs
│   ├── governance.rs
│   └── rewards.rs
└── utils/           # Módulos utilitarios
    ├── math.rs
    ├── oracle.rs
    └── token.rs
```

## Cuentas de Programa y PDAs

### Cuentas de Estado Principales

#### 1. Cuenta de Protocolo
**Semillas PDA**: `["protocol"]`
```rust
pub struct Protocol {
    pub admin: Pubkey,                    // Administrador del protocolo
    pub fee_rate: u64,                   // Tarifa del protocolo en puntos base
    pub total_pools: u64,                // Número de pools inicializados
    pub emergency_admin: Pubkey,          // Autoridad de pausa de emergencia
    pub treasury: Pubkey,                 // Cuenta de recaudación de tarifas
    pub total_value_locked: u64,         // Valor total bloqueado en USD
    pub total_borrowed: u64,             // Total USD prestado
    pub paused: bool,                    // Estado de pausa de emergencia
    pub emergency_mode: bool,            // Flag de modo de emergencia
    pub last_update_time: i64,           // Última actualización de estado
    pub bump: u8,                        // Semilla bump del PDA
}
```

#### 2. Cuenta de Pool
**Semillas PDA**: `["pool", asset_mint]`
```rust
pub struct Pool {
    pub authority: Pubkey,                // PDA autoridad del pool
    pub asset_mint: Pubkey,              // Token subyacente mint
    pub asset_token_account: Pubkey,     // Reserva de tokens del pool
    pub a_token_mint: Pubkey,            // Mint del token de recibo
    pub stable_debt_token_mint: Pubkey,  // Token de deuda estable
    pub variable_debt_token_mint: Pubkey, // Token de deuda variable
    pub oracle_price_feed: Pubkey,       // Cuenta del oráculo de precios
    pub total_supply: u64,               // Total de aTokens minteados
    pub total_stable_borrows: u64,       // Total de préstamos estables
    pub total_variable_borrows: u64,     // Total de préstamos variables
    pub available_liquidity: u64,        // Disponible para préstamos
    pub liquidity_rate: u64,             // APY de suministro
    pub variable_borrow_rate: u64,       // APY de préstamo variable
    pub stable_borrow_rate: u64,         // APY de préstamo estable
    pub liquidity_index: u128,           // Índice de suministro acumulativo
    pub variable_borrow_index: u128,     // Índice de préstamo acumulativo
    pub reserve_config: ReserveConfig,   // Configuración del pool
    pub interest_rate_strategy: InterestRateStrategy, // Modelo de tasas
    pub yield_farming_info: YieldFarmingInfo, // Info de recompensas
    pub last_update_timestamp: i64,      // Última actualización de tasas
    pub active: bool,                    // Estado activo del pool
    pub frozen: bool,                    // Depósitos/retiros deshabilitados
    pub paused: bool,                    // Operaciones del pool pausadas
    pub bump: u8,                        // Semilla bump del PDA
}
```

#### 3. Cuenta de Obligación de Usuario
**Semillas PDA**: `["user_obligation", user_pubkey, protocol_pubkey]`
```rust
pub struct UserObligation {
    pub user: Pubkey,                    // Dirección de wallet del usuario
    pub protocol: Pubkey,                // Cuenta del protocolo
    pub deposits: [DepositPosition; 10], // Depósitos del usuario (máx 10)
    pub deposits_len: u32,               // Conteo de depósitos activos
    pub borrows: [BorrowPosition; 10],   // Préstamos del usuario (máx 10)
    pub borrows_len: u32,                // Conteo de préstamos activos
    pub total_collateral_value: u64,     // Colateral total en USD
    pub total_debt_value: u64,           // Deuda total en USD
    pub yield_states: [UserYieldState; 10], // Estados de yield farming
    pub health_factor: u64,              // Salud de posición (puntos base)
    pub last_update_timestamp: i64,      // Último tiempo de actualización
    pub bump: u8,                        // Semilla bump del PDA
}
```

### Estructuras de Posición

#### Posición de Depósito
```rust
pub struct DepositPosition {
    pub pool: Pubkey,                    // Clave pública del pool
    pub amount: u64,                     // Cantidad de aTokens
    pub last_update_timestamp: i64,      // Último tiempo de actualización
}
```

#### Posición de Préstamo
```rust
pub struct BorrowPosition {
    pub pool: Pubkey,                    // Clave pública del pool
    pub principal_amount: u64,           // Principal prestado
    pub normalized_debt: u64,            // Deuda con intereses
    pub interest_rate_mode: InterestRateMode, // Estable/Variable
    pub stable_rate: u64,                // Tasa fija (si es estable)
    pub last_update_timestamp: i64,      // Último tiempo de actualización
}
```

## Modelos de Tasas de Interés

### Algoritmo de Cálculo de Tasas

El protocolo usa un modelo de tasa de interés de doble pendiente:

```rust
pub struct InterestRateStrategy {
    pub optimal_utilization_rate: u64,   // 80% (8000 puntos base)
    pub base_variable_borrow_rate: u64,  // 0% tasa base
    pub variable_rate_slope1: u64,       // 4% pendiente bajo óptimo
    pub variable_rate_slope2: u64,       // 60% pendiente sobre óptimo
    pub stable_rate_slope1: u64,         // 2% pendiente bajo óptimo
    pub stable_rate_slope2: u64,         // 60% pendiente sobre óptimo
}
```

### Fórmula de Cálculo de Tasas

**Bajo Utilización Óptima (≤80%)**:
```
tasa_prestamo = tasa_base + (tasa_utilizacion × pendiente1) / utilizacion_optima
```

**Sobre Utilización Óptima (>80%)**:
```
utilizacion_exceso = tasa_utilizacion - utilizacion_optima
tasa_prestamo = tasa_base + pendiente1 + (utilizacion_exceso × pendiente2) / (100% - utilizacion_optima)
```

**Tasa de Suministro**:
```
tasa_suministro = tasa_prestamo × tasa_utilizacion × (1 - factor_reserva)
```

### Tasa de Utilización
```
tasa_utilizacion = deuda_total / (deuda_total + liquidez_disponible)
```

### Acumulación de Intereses

El interés se compone por segundo usando la fórmula:
```rust
pub fn calculate_compound_interest(
    principal: u128,
    annual_rate: u64,
    time_in_seconds: i64,
) -> Result<u128> {
    let rate_per_second = annual_rate / (BASIS_POINTS * SECONDS_PER_YEAR);
    let interest_factor = WAD + (rate_per_second * time_in_seconds);
    principal * interest_factor / WAD
}
```

## Mecanismos de Liquidación

### Cálculo del Factor de Salud

```rust
factor_salud = (colateral_total × umbral_liquidacion) / deuda_total
```

Donde:
- Valores en USD con precisión de 8 decimales
- `umbral_liquidacion` en puntos base (ej. 8000 = 80%)
- Factor de salud < 10000 (100%) activa liquidación

### Proceso de Liquidación

1. **Verificación de Salud**: Verificar factor de salud < 100%
2. **Valoración de Colateral**: Obtener precios actuales del oráculo
3. **Liquidación Máxima**: Calcular máximo de deuda liquidable (típicamente 50%)
4. **Cálculo de Bono**: Aplicar bono de liquidación (5-20%)
5. **Transferencia de Activos**: Transferir tokens de deuda y confiscar colateral
6. **Actualización de Estado**: Actualizar obligación de usuario y estados del pool

### Cantidades de Liquidación
```rust
pub fn calculate_liquidation_amounts(
    debt_to_cover: u64,
    debt_price: u64,
    collateral_price: u64,
    liquidation_bonus: u64,
) -> Result<(u64, u64)> {
    let debt_value_usd = debt_to_cover * debt_price / PRECISION;
    let collateral_value_with_bonus = debt_value_usd * (BASIS_POINTS + liquidation_bonus) / BASIS_POINTS;
    let collateral_amount = collateral_value_with_bonus * PRECISION / collateral_price;
    let bonus_amount = collateral_value_with_bonus - debt_value_usd;
    
    Ok((collateral_amount, bonus_amount))
}
```

### Parámetros de Riesgo

| Parámetro | USDC | SOL | BTC | ETH |
|-----------|------|-----|-----|-----|
| LTV | 75% | 65% | 70% | 75% |
| Umbral de Liquidación | 80% | 75% | 75% | 80% |
| Bono de Liquidación | 10% | 15% | 12% | 10% |
| Factor de Reserva | 10% | 15% | 15% | 10% |

## Integración de Oráculos

### Oráculos Soportados

1. **Red Pyth** - Feed de precios primario
2. **Switchboard** - Oráculo secundario/de respaldo

### Integración con Pyth
```rust
pub fn get_pyth_price(
    price_feed_account: &AccountInfo,
    max_age_seconds: i64,
    max_confidence_pct: u64,
) -> Result<PriceData> {
    let price_feed = load_price_feed_from_account_info(price_feed_account)?;
    let price = price_feed.get_current_price()?;
    
    // Validar antigüedad del precio
    let current_time = Clock::get()?.unix_timestamp;
    if current_time - price.publish_time > max_age_seconds {
        return Err(LendingError::OraclePriceTooOld.into());
    }
    
    // Validar intervalo de confianza
    let confidence_pct = calculate_confidence_percentage(price.price, price.conf)?;
    if confidence_pct > max_confidence_pct {
        return Err(LendingError::OraclePriceConfidenceTooLow.into());
    }
    
    Ok(normalize_price_data(price))
}
```

### Validación de Precios
- **Antigüedad Máxima**: 5 minutos (300 segundos)
- **Umbral de Confianza**: 1% desviación máxima
- **Límites de Precio**: Valores mín/máx específicos del activo
- **Mecanismo de Respaldo**: Oráculo secundario si falla el primario

### Normalización de Precios
Todos los precios normalizados a 8 decimales para cálculos consistentes:
```rust
fn normalize_pyth_price(price: i64, expo: i32) -> Result<u64> {
    const TARGET_DECIMALS: i32 = 8;
    // Convertir precio considerando exponente a formato de 8 decimales
}
```

## Implementación de Flash Loans

### Proceso de Flash Loan

1. **Verificación de Liquidez**: Verificar que el pool tenga liquidez suficiente
2. **Cálculo de Tarifa**: Calcular tarifa del 0.09%
3. **Transferencia de Tokens**: Enviar tokens al contrato receptor
4. **Ejecución de Callback**: Invocar programa receptor
5. **Verificación de Repago**: Asegurar que préstamo + tarifa sean repagados
6. **Cobranza de Tarifa**: Transferir tarifa a tesorería

### Interfaz de Flash Loan
```rust
pub fn flash_loan(
    ctx: Context<FlashLoan>,
    amount: u64,
    params: Vec<u8>,
) -> Result<()> {
    let fee = calculate_flash_loan_fee(amount)?; // 0.09%
    let total_owed = amount + fee;
    
    // Transferir tokens al receptor
    transfer_tokens(&ctx.accounts.pool_asset_account, 
                   &ctx.accounts.receiver_asset_account, amount)?;
    
    // Invocar callback del receptor
    invoke_flash_loan_callback(amount, fee, params)?;
    
    // Verificar repago
    let final_balance = ctx.accounts.pool_asset_account.amount;
    if final_balance < initial_balance + fee {
        return Err(LendingError::FlashLoanNotRepaid.into());
    }
    
    Ok(())
}
```

### Interfaz del Receptor de Flash Loan
```rust
pub trait FlashLoanReceiverInterface {
    fn execute_operation(
        ctx: Context<FlashLoanReceiver>,
        amount: u64,
        fee: u64,
        params: Vec<u8>,
    ) -> Result<()>;
}
```

## Sistema de Gobernanza

### Características del Token de Gobernanza
- **Staking**: Bloquear tokens para poder de voto
- **Poder de Voto**: Basado en cantidad apostada y duración del bloqueo
- **Propuestas**: Crear y votar en cambios del protocolo
- **Timelock**: Retraso de 2 días para ejecución de propuestas

### Proceso de Gobernanza

1. **Creación de Propuesta**
   - Mínimo 100k tokens requeridos
   - Título, descripción y datos de ejecución
   - Período de votación de 7 días

2. **Fase de Votación**
   - Opciones de voto: A favor, En contra, Abstención
   - Poder de voto basado en tokens apostados
   - Requisito de quórum para validez

3. **Fase de Ejecución**
   - Propuestas exitosas encoladas con timelock
   - Retraso de 2 días antes de ejecución
   - El guardián puede cancelar propuestas maliciosas

### Estructuras de Gobernanza
```rust
pub struct Proposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub target: Pubkey,                  // Programa/cuenta objetivo
    pub data: Vec<u8>,                   // Calldata de ejecución
    pub state: ProposalState,
    pub for_votes: u64,
    pub against_votes: u64,
    pub abstain_votes: u64,
    pub eta: i64,                        // Tiempo de ejecución
    pub created_at: i64,
}

pub struct GovernanceStake {
    pub user: Pubkey,
    pub staked_amount: u64,
    pub lock_end: i64,
    pub voting_power_multiplier: u64,    // Basado en duración del bloqueo
    pub rewards_earned: u64,
}
```

## Arquitectura del Frontend

### Stack Tecnológico
- **Framework**: Next.js 14 con TypeScript
- **Estilos**: Tailwind CSS
- **Integración de Wallet**: Adaptador de Wallet de Solana
- **Gestión de Estado**: React Context + Hooks
- **Librería Web3**: Framework Anchor

### Estructura de Componentes
```
src/
├── app/                 # Directorio de app de Next.js
│   ├── layout.tsx       # Layout raíz
│   ├── page.tsx         # Página de inicio
│   └── globals.css      # Estilos globales
├── components/          # Componentes de React
│   ├── Dashboard.tsx    # Dashboard principal
│   ├── Header.tsx       # Header de navegación
│   └── LendingInterface.tsx # UI principal de préstamos
├── contexts/           # Contextos de React
│   └── WalletContextProvider.tsx # Estado del wallet
├── hooks/             # Hooks personalizados
│   └── useProgram.ts  # Hook de interfaz del programa
└── utils/            # Funciones utilitarias
```

### Componentes Clave

#### LendingInterface
```typescript
export function LendingInterface() {
  const { connected } = useWallet()
  const { program } = useProgram()
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0])
  const [amount, setAmount] = useState('')
  
  const handleSupply = async () => {
    if (!connected || !program) return
    
    // Crear transacción
    const tx = await program.methods
      .supply(new anchor.BN(parseFloat(amount) * 10**6))
      .accounts({
        // Mapeo de cuentas
      })
      .signers([wallet])
      .rpc()
  }
}
```

#### Hook del Programa
```typescript
export function useProgram() {
  const { connection } = useConnection()
  const wallet = useWallet()
  
  const provider = useMemo(() => {
    if (!wallet.publicKey) return null
    return new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    })
  }, [connection, wallet])
  
  const program = useMemo(() => {
    if (!provider) return null
    return new Program(idl, PROGRAM_ID, provider)
  }, [provider])
  
  return { program, provider, connection }
}
```

### Tokens Soportados
- USDC (6 decimales) - 4.2% APY
- SOL (9 decimales) - 3.8% APY  
- USDT (6 decimales) - 3.9% APY
- BTC (8 decimales) - 2.1% APY

## Medidas de Seguridad

### Controles de Acceso
1. **Funciones Solo-Admin**
   - Inicialización del protocolo
   - Creación de pools
   - Pausa/despausa de emergencia
   - Actualizaciones de parámetros

2. **Autenticación de Usuario**
   - Verificación de firmante para todas las acciones de usuario
   - Derivación de PDA para validación de cuentas
   - Verificaciones de propiedad de cuenta de tokens

3. **Controles de Emergencia**
   - Mecanismo de pausa a nivel de protocolo
   - Rol de administrador de emergencia
   - Funcionalidad de congelamiento específico del pool
   - Cancelación de propuestas por guardián

### Validación de Entrada
```rust
// Validación de cantidad
if amount == 0 {
    return Err(LendingError::InvalidAmount.into());
}

// Validación de cuenta
#[account(
    constraint = !protocol.is_paused() @ LendingError::PoolPaused,
    constraint = pool.is_active() @ LendingError::PoolPaused
)]

// Validación de oráculo
if current_timestamp - price.publish_time > MAX_PRICE_AGE {
    return Err(LendingError::OraclePriceTooOld.into());
}
```

### Seguridad Matemática
- Operaciones aritméticas verificadas en todo el código
- Protección contra desbordamiento usando métodos `checked_*`
- Manejo de precisión con matemáticas WAD/RAY
- Verificación de límites para todos los parámetros

### Protección contra Reentrancy
- Actualizaciones de estado antes de llamadas externas
- Validación de punto de entrada único
- Mecanismos de guardias CPI donde sea necesario

## Marco de Pruebas

### Estructura de Pruebas
```typescript
describe("Protocolo DeFi de Préstamos", () => {
  describe("Inicialización del Protocolo", () => {
    it("Inicializa el protocolo", async () => {
      const tx = await program.methods
        .initializeProtocol(admin.publicKey, 500)
        .accounts({
          protocol: protocolPda,
          admin: admin.publicKey,
          treasury: treasury.publicKey,
        })
        .signers([admin])
        .rpc()
      
      const protocolAccount = await program.account.protocol.fetch(protocolPda)
      assert.equal(protocolAccount.feeRate, 500)
    })
  })
})
```

### Cobertura de Pruebas
- Inicialización y configuración del protocolo
- Creación y gestión de pools
- Operaciones de usuario (suministro, préstamo, repago)
- Cálculos de tasas de interés
- Escenarios de liquidación
- Ejecución de flash loans
- Operaciones de gobernanza
- Manejo de errores y casos límite

### Pruebas de Integración
- Integración de feeds de precios de oráculos
- Interacciones multi-pool
- Escenarios complejos de liquidación
- Ciclo de vida de propuestas de gobernanza
- Implementaciones de receptores de flash loan

## Proceso de Despliegue

### Configuración de Build
```toml
[features]
resolution = true
skip-lint = false

[programs.localnet]
defi_lending_protocol = "DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT"
governance_token = "GovToknAbCdEfGhIjKlMnOpQrStUvWxYz123456789"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

### Pasos de Despliegue
1. **Configuración del Entorno**
   ```bash
   anchor build
   anchor deploy --provider.cluster devnet
   ```

2. **Verificación del Programa**
   - Verificar que los IDs del programa coincidan con la configuración
   - Validar tamaños de cuenta y exención de renta
   - Probar todos los puntos de entrada de instrucciones

3. **Secuencia de Inicialización**
   ```bash
   # 1. Inicializar protocolo
   anchor run initialize-protocol
   
   # 2. Crear pools para tokens soportados
   anchor run create-pools
   
   # 3. Configurar feeds de oráculos
   anchor run configure-oracles
   
   # 4. Inicializar gobernanza
   anchor run initialize-governance
   ```

4. **Despliegue del Frontend**
   ```bash
   cd app
   npm run build
   npm run deploy
   ```

### Variables de Entorno
```env
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
ANCHOR_WALLET=/path/to/wallet.json
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_PROGRAM_ID=DLendpNGzTTDdRsQHBJyYgQV9qR8JwKyFfvKSzWE8hT
```

## Fórmulas Matemáticas

### Constantes de Precisión
```rust
pub const WAD: u128 = 1_000_000_000_000_000_000;      // 10^18
pub const RAY: u128 = 1_000_000_000_000_000_000_000_000_000; // 10^27
pub const BASIS_POINTS: u64 = 10_000;                 // 100%
pub const SECONDS_PER_YEAR: u64 = 365 * 24 * 60 * 60;
```

### Cálculos de Intereses

#### Interés Compuesto (por segundo)
```
A = P × (1 + r/n)^(n×t)

Donde:
- A = Cantidad final
- P = Principal
- r = Tasa de interés anual (decimal)
- n = Frecuencia de composición (por año)
- t = Tiempo en años
```

#### Interés Lineal Simplificado (para períodos cortos)
```
A = P × (1 + r × t)

Donde:
- r = tasa por segundo
- t = tiempo en segundos
```

#### Tasa de Utilización
```
U = Deuda_Total / (Deuda_Total + Liquidez_Disponible)
```

#### Factor de Salud
```
FS = (Σ(Colateral_i × Precio_i × UmbralLiquidacion_i)) / (Σ(Deuda_j × Precio_j))
```

### Fórmulas de Liquidación

#### Cantidad Máxima de Liquidación
```
Max_Liquidacion = min(Deuda_Total × 0.5, Valor_Colateral × Factor_Cierre)
```

#### Confiscación de Colateral
```
Colateral_Confiscado = (Deuda_Cubierta × Precio_Deuda × (1 + Bono_Liquidacion)) / Precio_Colateral
```

#### Bono de Liquidación
```
Bono = Colateral_Confiscado - (Deuda_Cubierta × Precio_Deuda / Precio_Colateral)
```

## Optimización de Gas

### Gestión de Unidades de Cómputo
- **CU de Transacción Típica**: 200,000 - 400,000 unidades
- **Operaciones Complejas**: Hasta 1,000,000 unidades
- **Operaciones por Lotes**: Usar agrupación de transacciones

### Técnicas de Optimización

1. **Reordenamiento de Cuentas**
   ```rust
   #[derive(Accounts)]
   pub struct OptimizedAccounts<'info> {
       #[account(mut)] // Cuentas mutables primero
       pub mutable_account: Account<'info, SomeType>,
       
       #[account()] // Cuentas inmutables después
       pub readonly_account: Account<'info, SomeType>,
   }
   ```

2. **Empaquetado de Estructuras de Datos**
   ```rust
   #[account]
   pub struct PackedStruct {
       pub flag1: bool,           // 1 byte
       pub flag2: bool,           // 1 byte  
       pub small_number: u16,     // 2 bytes
       pub large_number: u64,     // 8 bytes
       // Total: 12 bytes + discriminador
   }
   ```

3. **Inicialización Perezosa**
   ```rust
   // Solo inicializar cuando sea necesario
   if !user_obligation.is_initialized() {
       user_obligation.initialize()?;
   }
   ```

4. **Actualizaciones por Lotes**
   ```rust
   // Actualizar múltiples índices en una sola llamada
   pool.update_indexes()?;
   pool.calculate_interest_rates()?;
   ```

### Gestión de Memoria
- Usar deserialización zero-copy para cuentas grandes
- Implementar compresión de cuentas donde sea posible
- Minimizar el tamaño de datos de cuenta con codificación eficiente
- Usar PDAs para generación de direcciones determinística

### Optimización de Transacciones
- Agrupar operaciones relacionadas en una sola transacción
- Usar tablas de búsqueda para cuentas accedidas frecuentemente
- Implementar ejecución parcial para operaciones grandes
- Optimizar serialización de datos de instrucciones

---

Esta documentación técnica proporciona cobertura completa de la arquitectura, detalles de implementación y procedimientos operacionales del Protocolo DeFi de Préstamos. El protocolo demuestra mecanismos DeFi sofisticados incluyendo cálculos de interés compuesto, sistemas de liquidación, flash loans y gobernanza descentralizada, todo construido sobre la infraestructura blockchain de alto rendimiento de Solana.
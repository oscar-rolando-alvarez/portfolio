# Mercado NFT - Documentación Técnica

## Índice de Contenidos

1. [Visión General del Proyecto](#visión-general-del-proyecto)
2. [Arquitectura General](#arquitectura-general)
3. [Programas de Contratos Inteligentes](#programas-de-contratos-inteligentes)
4. [Aplicación Frontend](#aplicación-frontend)
5. [Sistema en Tiempo Real](#sistema-en-tiempo-real)
6. [Diseño de Base de Datos](#diseño-de-base-de-datos)
7. [Configuración de Infraestructura](#configuración-de-infraestructura)
8. [Implementación de Seguridad](#implementación-de-seguridad)
9. [Optimización de Rendimiento](#optimización-de-rendimiento)
10. [Estrategia de Pruebas](#estrategia-de-pruebas)
11. [Guía de Despliegue](#guía-de-despliegue)
12. [Monitoreo y Analítica](#monitoreo-y-analítica)

---

## Visión General del Proyecto

El Mercado NFT es una plataforma integral y lista para producción construida en la blockchain de Solana que proporciona capacidades avanzadas de comercio, acuñación, subastas y gestión de colecciones. El proyecto implementa tecnologías Web3 de vanguardia con seguridad y escalabilidad de nivel empresarial.

### Características Técnicas Clave

- **6 Programas Anchor Especializados**: Mercado principal, acuñación de NFT, sistema de subastas, distribución de regalías, gestor de colecciones y sistema de depósito en garantía
- **Stack Frontend Moderno**: Next.js 14 con App Router, TypeScript, Tailwind CSS
- **Arquitectura en Tiempo Real**: Integración WebSocket para ofertas en vivo y actualizaciones
- **Seguridad Avanzada**: Lista de verificación de auditoría de seguridad integral de más de 100 puntos
- **Infraestructura de Producción**: Contenedores Docker, monitoreo y analítica
- **Sistema de Puntuación de Rareza**: Cálculos sofisticados de rareza basados en atributos
- **Soporte Multi-Wallet**: Integración con Phantom, Solflare, Ledger y Torus

---

## Arquitectura General

### Arquitectura del Sistema de Alto Nivel

```
┌─────────────────────────────────────────────────────────────┐
│                     Capa Frontend                           │
├─────────────────────────────────────────────────────────────┤
│  Next.js 14 App │ Componentes React │ Cliente WebSocket     │
│  TypeScript     │ Tailwind CSS      │ Integración Wallet   │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                  Capa de Comunicación                       │
├─────────────────────────────────────────────────────────────┤
│  Servidor WebSocket │ APIs REST │ Eventos Tiempo Real      │
│  Socket.IO          │ Express   │ Redis Pub/Sub            │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Capa Blockchain                          │
├─────────────────────────────────────────────────────────────┤
│  Red Solana       │ Programas Anchor │ Protocolo Metaplex  │
│  Tokens SPL       │ PDAs             │ Metadatos IPFS      │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                  Capa de Infraestructura                    │
├─────────────────────────────────────────────────────────────┤
│  Servicios Docker │ PostgreSQL     │ Caché Redis           │
│  Proxy Nginx      │ Nodo IPFS      │ Stack Monitoreo      │
└─────────────────────────────────────────────────────────────┘
```

### Arquitectura de Programas

El mercado consiste en 6 programas Anchor especializados:

```
programs/
├── marketplace/          # Funcionalidad de comercio principal
├── nft-minting/         # Creación de NFT y metadatos
├── auction-system/      # Mecánicas de subasta en tiempo real
├── royalty-distribution/ # Pagos de regalías a creadores
├── collection-manager/   # Verificación de colecciones
└── escrow-system/       # Depósito en garantía para transacciones seguras
```

---

## Programas de Contratos Inteligentes

### 1. Programa Marketplace

**Ubicación**: `/programs/marketplace/`

El programa principal del mercado maneja todas las operaciones de comercio de NFT incluyendo listado, compra, ofertas y administración del mercado.

#### Componentes Clave

**Estructuras de Estado:**
- `Marketplace`: Configuración global del mercado y estadísticas
- `Listing`: Información de listado individual de NFT
- `Offer`: Detalles de oferta con información de depósito en garantía
- `UserProfile`: Estadísticas de comercio del usuario y reputación

**Instrucciones Principales:**
- `initialize_marketplace`: Configura el mercado con administrador y estructura de tarifas
- `list_nft`: Lista un NFT para venta con precio y vencimiento
- `purchase_nft`: Compra directa de NFTs listados
- `make_offer`: Crea ofertas en depósito en garantía sobre NFTs
- `accept_offer`: Acepta ofertas y ejecuta intercambios
- `update_listing`: Modifica parámetros de listado
- `cancel_offer`: Cancela y reembolsa ofertas

#### Características de Seguridad

```rust
// Ejemplo: Validación de precio y protección contra desbordamiento
let marketplace_fee_amount = (price as u128)
    .checked_mul(marketplace.marketplace_fee as u128)
    .and_then(|x| x.checked_div(10000))
    .and_then(|x| x.try_into().ok())
    .ok_or(MarketplaceError::ArithmeticOverflow)?;
```

**Medidas de Seguridad Clave:**
- Protección contra desbordamiento aritmético en todos los cálculos
- Validación de propiedad antes de operaciones
- Sistema de depósito en garantía para manejo seguro de fondos
- Funciones solo para administrador con control de acceso apropiado
- Aplicación de vencimiento de listados
- Funcionalidad de pausa del mercado para emergencias

#### Sistema de Eventos

El mercado emite eventos integrales para todas las operaciones:

```rust
#[event]
pub struct NftPurchased {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
    pub marketplace_fee: u64,
    pub seller_receives: u64,
    pub timestamp: i64,
}
```

### 2. Programa de Acuñación NFT

**Ubicación**: `/programs/nft-minting/`

Maneja la creación de NFT con metadatos personalizados, gestión de colecciones e integración con Candy Machine.

#### Características Clave

**Gestión de Colecciones:**
- Creación y gestión de colecciones verificadas
- Límites de suministro y configuración de regalías
- Autoridad de colección y sistema de verificación
- Seguimiento de precio mínimo y volumen

**Acuñación de NFT:**
- Metadatos personalizados con atributos de rasgos
- Sistema de puntuación y clasificación de rareza
- Cumplimiento con estándares Metaplex
- Capacidades de acuñación por lotes

**Integración Candy Machine:**
- Acuñación automatizada con controles de precios
- Funcionalidad de lista blanca y preventa
- Configuraciones de fin basadas en tiempo y cantidad
- Gestión de tesorería

#### Sistema de Rareza

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RarityTier {
    Common,     // Puntuación 0-100
    Uncommon,   // Puntuación 101-300
    Rare,       // Puntuación 301-600
    Epic,       // Puntuación 601-850
    Legendary,  // Puntuación 851-950
    Mythic,     // Puntuación 951+
}
```

#### Sistema de Rasgos

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TraitAttribute {
    pub trait_type: String,
    pub value: String,
    pub display_type: Option<String>, // "number", "date", etc.
    pub max_value: Option<u64>,       // para rasgos numéricos
}
```

### 3. Programa Sistema de Subastas

**Ubicación**: `/programs/auction-system/`

Implementa subastas de ofertas en tiempo real con liquidación automática.

#### Funcionalidad Principal

- Creación de subastas con tiempo y ofertas iniciales
- Colocación y validación de ofertas en tiempo real
- Liquidación automática de subastas
- Sistema de reembolso de ofertas para ofertas no ganadoras
- Medidas anti-francotirador con extensiones de tiempo

### 4. Programa de Distribución de Regalías

**Ubicación**: `/programs/royalty-distribution/`

Gestiona pagos automáticos de regalías a creadores en todas las ventas secundarias.

#### Características

- Porcentajes de regalías configurables (puntos base)
- Divisiones de regalías para múltiples destinatarios
- Distribución automática en ventas
- Aplicación de regalías en todas las transacciones del mercado
- Sistema de verificación de creadores

### 5. Programa Gestor de Colecciones

**Ubicación**: `/programs/collection-manager/`

Maneja verificación, gestión y estadísticas de colecciones.

#### Capacidades

- Creación y verificación de colecciones
- Gestión y transferencias de autoridad
- Seguimiento de estadísticas de colecciones
- Validación de integridad de metadatos
- Gestión y límites de suministro

### 6. Programa Sistema de Depósito en Garantía

**Ubicación**: `/programs/escrow-system/`

Proporciona funcionalidad de depósito en garantía segura para todas las transacciones del mercado.

#### Características de Seguridad

- Depósito en garantía de transacciones multi-parte
- Condiciones de liquidación automática
- Mecanismos de recuperación de emergencia
- Marco de resolución de disputas
- Garantías de seguridad de fondos

---

## Aplicación Frontend

### Stack Tecnológico

**Framework Principal:**
- Next.js 14 con App Router
- React 18 con TypeScript
- Tailwind CSS para estilos
- Framer Motion para animaciones

**Integración Blockchain:**
- Solana Web3.js para interacción con blockchain
- Librerías cliente Anchor para llamadas a programas
- Adaptador de wallet para soporte multi-wallet
- SDK Metaplex para metadatos NFT

**Gestión de Estado:**
- React Query para estado del servidor
- Zustand para estado del cliente
- React Context para estado global
- Socket.IO para actualizaciones en tiempo real

### Arquitectura de Componentes

```
src/
├── app/                 # Páginas de Next.js App Router
├── components/          # Componentes React
│   ├── activity/       # Feeds de actividad e historial
│   ├── analytics/      # Gráficos y estadísticas
│   ├── collections/    # Displays de colecciones
│   ├── filters/        # UI de búsqueda y filtros
│   ├── home/          # Componentes de página de inicio
│   ├── layout/        # Diseño y navegación
│   ├── nft/           # Componentes de display NFT
│   ├── search/        # Funcionalidad de búsqueda
│   └── ui/            # Componentes UI reutilizables
├── contexts/           # Contextos React
├── hooks/             # Hooks React personalizados
├── services/          # Capas de servicio API
├── types/             # Definiciones de tipos TypeScript
└── utils/             # Funciones utilitarias
```

### Integración de Wallets

**Soporte Multi-Wallet:**
```typescript
const wallets = useMemo(
  () => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new TorusWalletAdapter(),
    new LedgerWalletAdapter(),
  ],
  []
);
```

**Características de Seguridad:**
- Vista previa de transacciones antes de firmar
- Prompts claros al usuario para todas las interacciones blockchain
- Seguridad de clave privada (nunca expuesta)
- Medidas de protección contra phishing

### Características en Tiempo Real

**Integración WebSocket:**
- Actualizaciones de ofertas en vivo
- Feeds de actividad en tiempo real
- Actualizaciones instantáneas de listados
- Streaming de estadísticas de colecciones

**Implementación:**
```typescript
// Contexto Socket para actualizaciones en tiempo real
const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  
  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL);
    setSocket(newSocket);
    
    return () => newSocket.close();
  }, []);
  
  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
}
```

### Búsqueda y Filtrado

**Características de Búsqueda Avanzada:**
- Búsqueda difusa con Fuse.js
- Filtrado multi-criterio
- Sugerencias de búsqueda en tiempo real
- Preferencias de búsqueda guardadas

**Categorías de Filtros:**
- Rangos de precios
- Niveles de rareza
- Filtros de colecciones
- Filtrado basado en rasgos
- Filtros de estado (listado, subasta, vendido)

### Optimización de Rendimiento

**División de Código:**
- División de código basada en rutas
- Carga perezosa de componentes
- Importaciones dinámicas para componentes pesados

**Estrategia de Caché:**
- React Query para caché de API
- Optimización de imágenes con Next.js
- Service worker para funcionalidad offline

**Optimización de Bundle:**
- Tree shaking para código no utilizado
- Análisis de bundle Webpack
- Dependencias optimizadas

---

## Sistema en Tiempo Real

### Arquitectura del Servidor WebSocket

**Stack Tecnológico:**
- Node.js con Express
- Socket.IO para gestión WebSocket
- Redis para cola de mensajes y pub/sub
- Arquitectura dirigida por eventos

### Tipos de Eventos

**Eventos del Mercado:**
- `nft_listed`: Nuevos listados de NFT
- `nft_purchased`: Confirmaciones de compra
- `offer_made`: Nuevas ofertas
- `offer_accepted`: Aceptaciones de ofertas
- `auction_bid`: Nuevas ofertas de subasta
- `auction_ended`: Finalizaciones de subasta

**Ejemplo de Implementación:**
```typescript
// Manejo de eventos WebSocket
socket.on('auction_bid', (data: BidEvent) => {
  // Actualizar display de subasta en tiempo real
  setCurrentBid(data.amount);
  setHighestBidder(data.bidder);
  
  // Mostrar notificación
  toast.success(`Nueva oferta: ${data.amount} SOL`);
});
```

### Flujo de Datos en Tiempo Real

```
Evento Blockchain → Emisión Evento Programa → Escuchador de Eventos → 
Redis Pub/Sub → Servidor WebSocket → Actualización Cliente → Actualización UI
```

---

## Diseño de Base de Datos

### Esquema PostgreSQL

**Tablas de Analítica:**
- `marketplace_stats`: Métricas globales del mercado
- `nft_sales`: Registros de ventas individuales
- `user_activity`: Seguimiento de interacción del usuario
- `collection_metrics`: Datos de rendimiento de colecciones
- `price_history`: Datos de precios históricos

**Estrategia de Caché:**
- Redis para datos frecuentemente accedidos
- Expiración de caché basada en tiempo
- Calentamiento de caché para colecciones populares
- Invalidación de caché en tiempo real

### Modelos de Datos

**Metadatos NFT:**
```sql
CREATE TABLE nft_metadata (
    mint_address VARCHAR(44) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(10),
    image_url TEXT,
    metadata_uri TEXT,
    collection_address VARCHAR(44),
    traits JSONB,
    rarity_score INTEGER,
    rarity_rank INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Actividad de Comercio:**
```sql
CREATE TABLE trading_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_signature VARCHAR(88) UNIQUE NOT NULL,
    activity_type VARCHAR(20) NOT NULL, -- 'sale', 'listing', 'offer'
    nft_mint VARCHAR(44) NOT NULL,
    seller_address VARCHAR(44),
    buyer_address VARCHAR(44),
    price BIGINT,
    marketplace_fee BIGINT,
    timestamp TIMESTAMP NOT NULL,
    block_number BIGINT
);
```

---

## Configuración de Infraestructura

### Configuración Docker

**Arquitectura Multi-Servicio:**
```yaml
services:
  frontend:           # Aplicación Next.js
  websocket:          # Servidor tiempo real
  redis:              # Caché y pub/sub
  postgres:           # Base de datos analítica
  analytics-api:      # Servicio analítica
  ipfs:               # Almacenamiento metadatos
  nginx:              # Proxy reverso
  prometheus:         # Recolección métricas
  grafana:            # Dashboards monitoreo
```

### Comunicación de Servicios

**Red Interna:**
- Todos los servicios se comunican via red interna Docker
- Descubrimiento de servicios a través de DNS Docker
- Balanceo de carga via Nginx

**Acceso Externo:**
- Frontend: Puerto 3000
- Analítica: Puerto 3002
- Grafana: Puerto 3003
- Prometheus: Puerto 9090

### Integración IPFS

**Almacenamiento de Metadatos:**
- Almacenamiento descentralizado para metadatos NFT
- Direccionamiento de contenido para integridad
- Servicios de pinning para disponibilidad
- Redundancia de gateway para confiabilidad

---

## Implementación de Seguridad

### Seguridad de Contratos Inteligentes

**Control de Acceso:**
```rust
// Ejemplo de instrucción solo para admin
#[derive(Accounts)]
pub struct UpdateMarketplaceConfig<'info> {
    #[account(
        mut,
        seeds = [b"marketplace".as_ref()],
        bump,
        constraint = marketplace.is_admin(&admin.key()) @ MarketplaceError::NotAdmin
    )]
    pub marketplace: Account<'info, Marketplace>,
    
    pub admin: Signer<'info>,
}
```

**Validación de Entrada:**
```rust
// Validación de precio y vencimiento
require!(price > 0, MarketplaceError::InvalidPrice);
require!(expiry > current_time, MarketplaceError::InvalidExpiry);
require!(
    expiry - current_time <= marketplace.max_listing_duration,
    MarketplaceError::ListingDurationTooLong
);
```

**Protección contra Desbordamiento:**
```rust
// Operaciones aritméticas seguras
let seller_receives = price
    .checked_sub(marketplace_fee_amount)
    .ok_or(MarketplaceError::ArithmeticOverflow)?;
```

### Seguridad Frontend

**Sanitización de Entrada:**
- Todas las entradas de usuario validadas y sanitizadas
- Prevención XSS a través de escape apropiado
- Protección CSRF con tokens

**Seguridad de Wallet:**
- Vistas previas claras de transacciones
- Confirmación del usuario para todas las operaciones
- Protección de clave privada
- Prevención de ataques de phishing

### Seguridad de Infraestructura

**Seguridad de Red:**
- Aplicación HTTPS
- Configuración de cabeceras seguras
- Implementación de política CORS
- Limitación de velocidad y protección DDoS

**Seguridad de Contenedores:**
- Contenedores de usuario no root
- Imágenes base mínimas
- Actualizaciones de seguridad regulares
- Gestión de secretos

---

## Optimización de Rendimiento

### Optimización Frontend

**Optimización de Bundle:**
- División de código por rutas
- Importaciones dinámicas para componentes pesados
- Tree shaking para código no utilizado
- Análisis de bundle Webpack

**Optimización de Imágenes:**
- Componente Image de Next.js
- Carga perezosa con intersection observer
- Conversión a formato WebP
- Tamaños de imagen responsivos

**Estrategia de Caché:**
- React Query para caché de API
- Caché de navegador con cabeceras apropiadas
- Service worker para soporte offline
- Integración CDN para activos estáticos

### Optimización Backend

**Optimización de Base de Datos:**
- Estrategia de indexación apropiada
- Optimización de consultas
- Pool de conexiones
- Réplicas de lectura para analítica

**Capas de Caché:**
- Redis para datos frecuentemente accedidos
- Caché a nivel de aplicación
- CDN para contenido estático
- Cabeceras de caché de navegador

### Optimización Blockchain

**Optimización de Transacciones:**
- Operaciones por lotes cuando sea posible
- Optimización de presupuesto de cómputo
- Optimización de renta de cuentas
- Derivación eficiente de PDA

---

## Estrategia de Pruebas

### Pruebas de Contratos Inteligentes

**Pruebas Unitarias:**
```typescript
describe("Programa Marketplace", () => {
  it("debería listar NFT exitosamente", async () => {
    const price = new anchor.BN(1000000000); // 1 SOL
    const expiry = new anchor.BN(Date.now() / 1000 + 86400); // 24 horas
    
    await program.methods
      .listNft(price, expiry, true)
      .accounts({
        marketplace: marketplacePda,
        listing: listingPda,
        seller: seller.publicKey,
        nftMint: nftMint,
        // ... otras cuentas
      })
      .signers([seller])
      .rpc();
      
    const listing = await program.account.listing.fetch(listingPda);
    assert.equal(listing.price.toString(), price.toString());
  });
});
```

**Pruebas de Integración:**
- Pruebas de interacción entre programas
- Flujos de transacciones de extremo a extremo
- Pruebas de condiciones de error
- Pruebas de vulnerabilidades de seguridad

### Pruebas Frontend

**Pruebas Unitarias:**
```typescript
// Pruebas de componentes con React Testing Library
describe("NFTCard", () => {
  it("muestra información NFT correctamente", () => {
    const mockNFT = {
      name: "NFT Prueba",
      price: 1.5,
      image: "imagen-prueba.jpg"
    };
    
    render(<NFTCard nft={mockNFT} />);
    
    expect(screen.getByText("NFT Prueba")).toBeInTheDocument();
    expect(screen.getByText("1.5 SOL")).toBeInTheDocument();
  });
});
```

**Pruebas E2E:**
- Flujos de trabajo completos del usuario
- Pruebas de integración de wallet
- Pruebas de características en tiempo real
- Compatibilidad entre navegadores

### Pruebas de Seguridad

**Lista de Verificación de Auditoría:**
- Lista de verificación de seguridad de más de 100 puntos
- Escaneo de seguridad automatizado
- Pruebas de penetración manuales
- Verificación formal de contratos inteligentes

---

## Guía de Despliegue

### Despliegue de Desarrollo

**Configuración Local:**
```bash
# Clonar repositorio
git clone <url-repositorio>
cd nft-marketplace

# Instalar dependencias
npm install
cd app && npm install && cd ..

# Configurar entorno Solana
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2

# Construir y desplegar programas
anchor build
./scripts/deploy.sh devnet

# Iniciar entorno de desarrollo
docker-compose up -d
cd app && npm run dev
```

### Despliegue de Producción

**Despliegue Mainnet:**
```bash
# Desplegar a mainnet
./scripts/deploy.sh mainnet-beta ~/.config/solana/mainnet-keypair.json

# Construir frontend de producción
cd app && npm run build

# Iniciar servicios de producción
docker-compose -f docker-compose.prod.yml up -d
```

**Requerimientos de Infraestructura:**
- Mínimo 4 núcleos CPU
- 16GB RAM
- 500GB almacenamiento SSD
- Balanceador de carga con terminación SSL
- Sistemas de respaldo y monitoreo

### Configuración de Entorno

**Entorno Frontend:**
```env
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_MARKETPLACE_PROGRAM_ID=<program-id>
NEXT_PUBLIC_NFT_MINTING_PROGRAM_ID=<program-id>
NEXT_PUBLIC_WEBSOCKET_URL=wss://marketplace.example.com/ws
```

**Entorno Backend:**
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@localhost:5432/nft_marketplace
REDIS_URL=redis://localhost:6379
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

---

## Monitoreo y Analítica

### Recolección de Métricas

**Métricas Prometheus:**
- Volumen y conteo de transacciones
- Usuarios activos y sesiones
- Costos de ejecución de programas
- Tasas de error y latencia
- Uso de recursos del sistema

**Métricas Personalizadas:**
```typescript
// Ejemplo de recolección de métricas
const transactionCounter = new prometheus.Counter({
  name: 'marketplace_transactions_total',
  help: 'Número total de transacciones del mercado',
  labelNames: ['type', 'status']
});

transactionCounter.inc({ type: 'purchase', status: 'success' });
```

### Dashboards Grafana

**Resumen del Mercado:**
- Volumen total y transacciones
- Listados activos y colecciones
- Métricas de participación del usuario
- Ingresos y recolección de tarifas

**Monitoreo de Rendimiento:**
- Percentiles de tiempo de respuesta
- Seguimiento de tasa de errores
- Utilización de recursos
- Métricas de conexión en tiempo real

**Monitoreo de Seguridad:**
- Intentos de transacciones fallidas
- Detección de actividad sospechosa
- Activadores de limitación de velocidad
- Violaciones de control de acceso

### Sistema de Alertas

**Alertas Críticas:**
- Altas tasas de error
- Indisponibilidad de servicios
- Brechas de seguridad
- Fallos de transacciones

**Alertas de Advertencia:**
- Degradación de rendimiento
- Alto uso de recursos
- Patrones de actividad inusuales
- Cambios de configuración

---

Esta documentación técnica proporciona una visión integral de la implementación del Mercado NFT, cubriendo todos los aspectos desde la arquitectura de contratos inteligentes hasta el desarrollo frontend, configuración de infraestructura y procedimientos operacionales. La documentación está diseñada para ser una referencia completa para desarrolladores, auditores y operadores que trabajen con la plataforma.
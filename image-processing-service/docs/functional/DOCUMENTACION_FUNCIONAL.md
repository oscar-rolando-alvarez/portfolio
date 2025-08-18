# Microservicio de Procesamiento de Imágenes - Documentación Funcional

## Tabla de Contenidos
1. [Visión General del Servicio](#visión-general-del-servicio)
2. [Capacidades de Procesamiento de Imágenes](#capacidades-de-procesamiento-de-imágenes)
3. [Formatos de Archivo Soportados](#formatos-de-archivo-soportados)
4. [Opciones de Filtros y Transformaciones](#opciones-de-filtros-y-transformaciones)
5. [Funcionalidad OCR](#funcionalidad-ocr)
6. [Características de Detección de Objetos](#características-de-detección-de-objetos)
7. [Flujos de Procesamiento por Lotes](#flujos-de-procesamiento-por-lotes)
8. [Ejemplos de Uso de API](#ejemplos-de-uso-de-api)
9. [Manejo de Errores y Recuperación](#manejo-de-errores-y-recuperación)
10. [Características de Rendimiento](#características-de-rendimiento)
11. [Rate Limiting y Cuotas](#rate-limiting-y-cuotas)
12. [Patrones de Integración](#patrones-de-integración)

## Visión General del Servicio

El Microservicio de Procesamiento de Imágenes proporciona capacidades completas de manipulación, análisis e inteligencia artificial para imágenes a través de una API RESTful. El servicio está diseñado para procesamiento de imágenes de alto rendimiento y escalable con soporte para operaciones síncronas y asíncronas.

### Características Principales
- **Transformación de Imágenes**: Redimensionar, recortar, rotar y conversión de formatos
- **Filtrado Avanzado**: Desenfoque, nitidez, detección de bordes y efectos artísticos
- **Extracción de Texto OCR**: Reconocimiento de texto multiidioma con puntuación de confianza
- **Detección de Objetos**: Identificación de objetos basada en YOLO con cajas delimitadoras
- **Procesamiento por Lotes**: Múltiples operaciones en múltiples imágenes
- **Integración de Almacenamiento**: Almacenamiento en la nube compatible con S3 y soporte CDN
- **Procesamiento en Tiempo Real**: API síncrona para resultados inmediatos
- **Flujos Asíncronos**: Procesamiento basado en colas para operaciones pesadas

### Visión General de Endpoints de API

| Endpoint | Método | Propósito | Tipo de Procesamiento |
|----------|--------|-----------|----------------------|
| `/api/v1/upload` | POST | Subir y validar imágenes | Síncrono |
| `/api/v1/resize` | POST | Redimensionar imágenes con control de aspecto | Asíncrono |
| `/api/v1/crop` | POST | Recortar imágenes a dimensiones específicas | Asíncrono |
| `/api/v1/filter` | POST | Aplicar filtros artísticos y técnicos | Asíncrono |
| `/api/v1/ocr` | POST | Extraer texto de imágenes | Síncrono |
| `/api/v1/detect-objects` | POST | Detectar y clasificar objetos | Síncrono |
| `/api/v1/batch` | POST | Procesar múltiples imágenes con múltiples operaciones | Asíncrono |
| `/api/v1/tasks/{task_id}` | GET | Verificar estado de procesamiento | Síncrono |
| `/api/v1/image-info` | GET | Obtener metadatos completos de imagen | Síncrono |

## Capacidades de Procesamiento de Imágenes

### Redimensionamiento de Imágenes

El servicio soporta redimensionamiento inteligente de imágenes con múltiples opciones:

**Características:**
- Preservación de relación de aspecto
- Remuestreo de alta calidad (algoritmo Lanczos)
- Múltiples formatos de salida
- Control de calidad para formatos comprimidos
- Validación y límites de dimensiones

**Parámetros:**
```json
{
  "image_url": "https://ejemplo.com/imagen.jpg",
  "width": 800,
  "height": 600,
  "maintain_aspect_ratio": true,
  "output_format": "jpeg",
  "quality": 85
}
```

**Restricciones:**
- Dimensiones máximas: 10,000 x 10,000 píxeles
- Dimensiones mínimas: 1 x 1 píxel
- Rango de calidad: 1-100 (para JPEG/WebP)

### Recorte de Imágenes

Recorte preciso de imágenes con control a nivel de píxel:

**Características:**
- Posicionamiento exacto por píxel
- Validación de límites
- Múltiples formatos de salida
- Opciones de preservación de metadatos

**Parámetros:**
```json
{
  "image_url": "https://ejemplo.com/imagen.jpg",
  "x": 100,
  "y": 50,
  "width": 400,
  "height": 300,
  "output_format": "png",
  "quality": 95
}
```

**Reglas de Validación:**
- El área de recorte debe estar dentro de los límites de la imagen
- Tamaño mínimo de recorte: 1 x 1 píxel
- Tamaño máximo de recorte: Dimensiones originales de la imagen

### Mejoramiento de Imágenes

Mejoramiento de imágenes con múltiples parámetros:

**Ajustes Disponibles:**
- **Brillo**: -100% a +300%
- **Contraste**: -100% a +300%
- **Saturación**: -100% a +300%
- **Nitidez**: -100% a +300%

**Parámetros:**
```json
{
  "image_url": "https://ejemplo.com/imagen.jpg",
  "brightness": 1.2,
  "contrast": 1.1,
  "saturation": 0.9,
  "sharpness": 1.3,
  "output_format": "jpeg",
  "quality": 90
}
```

## Formatos de Archivo Soportados

### Formatos de Entrada

| Formato | Extensión | Tamaño Máx. | Modos de Color | Notas |
|---------|-----------|-------------|----------------|-------|
| JPEG | .jpg, .jpeg | 50MB | RGB, Escala de grises | Formato más común |
| PNG | .png | 50MB | RGB, RGBA, Escala de grises | Soporta transparencia |
| WebP | .webp | 50MB | RGB, RGBA | Formato moderno eficiente |
| BMP | .bmp | 50MB | RGB, Escala de grises | Formato sin comprimir |
| TIFF | .tiff, .tif | 50MB | RGB, RGBA, Escala de grises | Formato profesional |

### Formatos de Salida

Todos los formatos de entrada son soportados como formatos de salida con opciones adicionales:

**Opciones Específicas por Formato:**
- **JPEG**: Control de calidad (1-100), codificación progresiva
- **PNG**: Nivel de compresión (0-9), preservación de transparencia
- **WebP**: Control de calidad, modos con/sin pérdida
- **BMP**: Salida RGB de 24 bits
- **TIFF**: Compresión LZW, múltiples profundidades de bits

### Ejemplos de Conversión de Formato

```bash
# Convertir PNG a JPEG con control de calidad
curl -X POST "http://localhost:8000/api/v1/resize" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/imagen.png",
    "width": 800,
    "height": 600,
    "output_format": "jpeg",
    "quality": 85
  }'

# Convertir JPEG a PNG para transparencia
curl -X POST "http://localhost:8000/api/v1/filter" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/imagen.jpg",
    "filter_type": "none",
    "output_format": "png"
  }'
```

## Opciones de Filtros y Transformaciones

### Filtros Disponibles

#### Filtros Básicos

1. **Filtros de Desenfoque**
   - **Desenfoque Gaussiano**: Efecto de desenfoque suave y natural
   - **Desenfoque de Movimiento**: Simulación de desenfoque direccional
   - **Filtro Mediano**: Reducción de ruido preservando bordes

2. **Filtros de Nitidez**
   - **Máscara de Desenfoque**: Nitidez profesional
   - **Nitidez Adaptativa**: Mejoramiento consciente de bordes

3. **Detección de Bordes**
   - **Detección de Bordes Canny**: Detección de bordes de alta calidad
   - **Filtro Sobel**: Detección de bordes basada en gradientes
   - **Filtro Laplaciano**: Detección de bordes por cruces por cero

#### Filtros Artísticos

1. **Relieve**: Efecto de relieve 3D
2. **Contorno**: Estilo de arte lineal
3. **Posterizar**: Cuantización de color
4. **Solarizar**: Efecto de solarización fotográfica

### Parámetros de Filtros

```json
{
  "image_url": "https://ejemplo.com/imagen.jpg",
  "filter_type": "gaussian_blur",
  "intensity": 2.5,
  "output_format": "jpeg",
  "quality": 90
}
```

**Rangos de Intensidad:**
- Filtros de desenfoque: 0.1 - 10.0
- Nitidez: 0.1 - 3.0
- Detección de bordes: 0.1 - 5.0
- Efectos artísticos: 0.1 - 3.0

### Combinaciones de Filtros Personalizados

```bash
# Aplicar múltiples filtros en secuencia (procesamiento por lotes)
curl -X POST "http://localhost:8000/api/v1/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "image_urls": ["https://ejemplo.com/imagen.jpg"],
    "operations": [
      {
        "type": "filter",
        "filter_type": "gaussian_blur",
        "intensity": 1.5
      },
      {
        "type": "filter",
        "filter_type": "sharpen",
        "intensity": 1.2
      }
    ]
  }'
```

## Funcionalidad OCR

### Motores de Extracción de Texto

El servicio soporta múltiples motores OCR para máxima precisión:

1. **Tesseract OCR**
   - Motor OCR de código abierto de Google
   - Soporta más de 100 idiomas
   - Puntuación de confianza
   - Análisis de diseño

2. **EasyOCR**
   - OCR basado en aprendizaje profundo
   - Mejor precisión para texto estilizado
   - 80+ idiomas soportados
   - Aceleración GPU

3. **Modo Híbrido**
   - Ejecuta ambos motores simultáneamente
   - Compara resultados para validación
   - Mayor precisión con costo de procesamiento

### Idiomas Soportados

**Idiomas Principales:**
- Inglés (eng)
- Español (spa)
- Francés (fra)
- Alemán (deu)
- Italiano (ita)
- Portugués (por)
- Ruso (rus)
- Árabe (ara)
- Chino Simplificado (chi_sim)
- Chino Tradicional (chi_tra)
- Japonés (jpn)
- Coreano (kor)

### Ejemplos de Solicitudes OCR

#### Extracción Básica de Texto
```bash
curl -X POST "http://localhost:8000/api/v1/ocr" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/documento.jpg",
    "languages": ["spa"],
    "detect_orientation": true,
    "extract_confidence": true
  }'
```

#### Detección Multiidioma
```bash
curl -X POST "http://localhost:8000/api/v1/ocr" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/multiidioma.jpg",
    "languages": ["spa", "eng", "fra"],
    "detect_orientation": true,
    "extract_confidence": true
  }'
```

### Formato de Respuesta OCR

```json
{
  "success": true,
  "task_id": "ocr-12345",
  "results": [
    {
      "text": "Hola Mundo",
      "confidence": 0.95,
      "bbox": {
        "x1": 100.0,
        "y1": 50.0,
        "x2": 200.0,
        "y2": 80.0,
        "confidence": 0.95
      }
    }
  ],
  "processing_time": 1.25,
  "message": "Procesamiento OCR completado exitosamente"
}
```

### Extracción de Datos Estructurados

El servicio puede extraer datos estructurados de tipos específicos de documentos:

#### Extracción de Tablas
```bash
curl -X POST "http://localhost:8000/api/v1/ocr/structured" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/tabla.jpg",
    "data_type": "table",
    "languages": ["spa"]
  }'
```

#### Extracción de Campos de Formulario
```bash
curl -X POST "http://localhost:8000/api/v1/ocr/structured" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/formulario.jpg",
    "data_type": "form",
    "languages": ["spa"]
  }'
```

## Características de Detección de Objetos

### Detección de Objetos YOLO

El servicio usa YOLOv8 para detección de objetos de última generación:

**Capacidades:**
- Detección de objetos en tiempo real
- 80 clases de objetos COCO
- Puntuación de confianza
- Coordenadas de cajas delimitadoras
- Múltiples instancias de objetos

### Clases de Objetos Soportadas

**Las Clases Comunes Incluyen:**
- **Personas**: persona
- **Vehículos**: coche, bicicleta, motocicleta, avión, autobús, tren, camión, barco
- **Animales**: pájaro, gato, perro, caballo, oveja, vaca, elefante, oso, cebra, jirafa
- **Hogar**: silla, sofá, cama, mesa de comedor, inodoro, tv, portátil, ratón, teclado
- **Comida**: plátano, manzana, sándwich, naranja, brócoli, zanahoria, pizza, donut, pastel
- **Deportes**: pelota deportiva, cometa, bate de béisbol, patineta, tabla de surf, raqueta de tenis

### Solicitud de Detección de Objetos

```bash
curl -X POST "http://localhost:8000/api/v1/detect-objects" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/calle.jpg",
    "confidence_threshold": 0.5,
    "max_detections": 100,
    "classes_filter": ["persona", "coche", "bicicleta"]
  }'
```

### Formato de Respuesta de Detección

```json
{
  "success": true,
  "task_id": "detection-67890",
  "objects": [
    {
      "class_name": "persona",
      "confidence": 0.87,
      "bbox": {
        "x1": 150.0,
        "y1": 100.0,
        "x2": 250.0,
        "y2": 400.0,
        "confidence": 0.87
      }
    },
    {
      "class_name": "coche",
      "confidence": 0.92,
      "bbox": {
        "x1": 300.0,
        "y1": 200.0,
        "x2": 500.0,
        "y2": 350.0,
        "confidence": 0.92
      }
    }
  ],
  "processing_time": 0.85,
  "image_url": "https://ejemplo.com/calle.jpg",
  "message": "Detección de objetos completada exitosamente"
}
```

### Características de Detección Especializada

#### Detección de Rostros
```bash
curl -X POST "http://localhost:8000/api/v1/detect-faces" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/grupo.jpg",
    "confidence_threshold": 0.7
  }'
```

#### Detección de Regiones de Texto
```bash
curl -X POST "http://localhost:8000/api/v1/detect-text-regions" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/documento.jpg"
  }'
```

## Flujos de Procesamiento por Lotes

### Visión General del Procesamiento por Lotes

El procesamiento por lotes te permite:
- Procesar múltiples imágenes simultáneamente
- Aplicar múltiples operaciones a cada imagen
- Optimizar la utilización de recursos
- Reducir la sobrecarga de llamadas API
- Rastrear el progreso de operaciones grandes

### Estructura de Solicitud por Lotes

```json
{
  "image_urls": [
    "https://ejemplo.com/imagen1.jpg",
    "https://ejemplo.com/imagen2.jpg",
    "https://ejemplo.com/imagen3.jpg"
  ],
  "operations": [
    {
      "type": "resize",
      "width": 800,
      "height": 600,
      "maintain_aspect_ratio": true
    },
    {
      "type": "filter",
      "filter_type": "sharpen",
      "intensity": 1.2
    }
  ],
  "callback_url": "https://tu-app.com/webhook/lote-completo"
}
```

### Ejemplos de Procesamiento por Lotes

#### Optimización de Galería de Imágenes
```bash
curl -X POST "http://localhost:8000/api/v1/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "image_urls": [
      "https://galeria.com/foto1.jpg",
      "https://galeria.com/foto2.jpg",
      "https://galeria.com/foto3.jpg"
    ],
    "operations": [
      {
        "type": "resize",
        "width": 1200,
        "height": 800,
        "maintain_aspect_ratio": true,
        "output_format": "webp",
        "quality": 85
      },
      {
        "type": "resize",
        "width": 400,
        "height": 300,
        "maintain_aspect_ratio": true,
        "output_format": "webp",
        "quality": 80
      }
    ]
  }'
```

#### Pipeline de Procesamiento de Documentos
```bash
curl -X POST "http://localhost:8000/api/v1/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "image_urls": [
      "https://docs.com/escaneo1.jpg",
      "https://docs.com/escaneo2.jpg"
    ],
    "operations": [
      {
        "type": "filter",
        "filter_type": "sharpen",
        "intensity": 1.5
      },
      {
        "type": "ocr",
        "languages": ["spa"],
        "extract_confidence": true
      }
    ]
  }'
```

### Formato de Respuesta por Lotes

```json
{
  "success": true,
  "batch_id": "batch-abc123",
  "task_ids": [
    "task-1a2b3c",
    "task-4d5e6f",
    "task-7g8h9i"
  ],
  "total_tasks": 6,
  "estimated_completion_time": "2024-01-15T10:30:00Z",
  "message": "Procesamiento por lotes encolado exitosamente"
}
```

## Ejemplos de Uso de API

### Flujo de Subida y Procesamiento

```bash
# Paso 1: Subir imagen
curl -X POST "http://localhost:8000/api/v1/upload" \
  -F "file=@/ruta/a/imagen.jpg" \
  -F "process_immediately=false"

# Respuesta:
# {
#   "task_id": "upload-123",
#   "status": "completed",
#   "result_url": "https://storage.com/uploads/2024/01/15/abc123.jpg"
# }

# Paso 2: Procesar imagen subida
curl -X POST "http://localhost:8000/api/v1/resize" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://storage.com/uploads/2024/01/15/abc123.jpg",
    "width": 800,
    "height": 600,
    "maintain_aspect_ratio": true
  }'

# Respuesta:
# {
#   "task_id": "resize-456",
#   "status": "pending",
#   "message": "Tarea de redimensionamiento encolada para procesamiento"
# }

# Paso 3: Verificar estado de procesamiento
curl "http://localhost:8000/api/v1/tasks/resize-456"

# Respuesta:
# {
#   "task_id": "resize-456",
#   "status": "completed",
#   "result": {
#     "output_url": "https://storage.com/processed/2024/01/15/def456.jpg",
#     "dimensions": "800x600"
#   }
# }
```

### Ejemplo de Procesamiento en Tiempo Real

```bash
# OCR con resultados inmediatos
curl -X POST "http://localhost:8000/api/v1/ocr" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/documento.jpg",
    "languages": ["spa", "eng"],
    "detect_orientation": true,
    "extract_confidence": true
  }'

# Detección de objetos con filtrado
curl -X POST "http://localhost:8000/api/v1/detect-objects" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://ejemplo.com/calle.jpg",
    "confidence_threshold": 0.7,
    "max_detections": 50,
    "classes_filter": ["persona", "coche", "bicicleta", "motocicleta"]
  }'
```

### Flujo de Análisis de Imágenes

```bash
# Obtener información completa de imagen
curl "http://localhost:8000/api/v1/image-info?image_url=https://ejemplo.com/foto.jpg"

# La respuesta incluye:
# - Dimensiones de imagen y formato
# - Análisis de color e histogramas
# - Metadatos EXIF
# - Información de tamaño de archivo y compresión
# - Colores dominantes
# - Métricas de calidad técnica
```

## Manejo de Errores y Recuperación

### Formato de Respuesta de Error

Todos los endpoints de API devuelven respuestas de error consistentes:

```json
{
  "success": false,
  "error_code": "INVALID_IMAGE_FORMAT",
  "message": "Formato de imagen no soportado: bmp. Formatos soportados: jpg, jpeg, png, webp, tiff",
  "details": {
    "filename": "invalido.bmp",
    "content_type": "image/bmp",
    "supported_formats": ["jpg", "jpeg", "png", "webp", "tiff"]
  },
  "correlation_id": "req-abc-123"
}
```

### Códigos de Error Comunes

| Código de Error | Descripción | Estado HTTP | Resolución |
|----------------|-------------|-------------|------------|
| `INVALID_IMAGE_FORMAT` | Formato de archivo no soportado | 400 | Usar formato soportado |
| `IMAGE_TOO_LARGE` | Archivo excede límite de tamaño | 413 | Reducir tamaño de archivo |
| `INVALID_DIMENSIONS` | Parámetros de redimensionamiento inválidos | 400 | Verificar valores de ancho/alto |
| `PROCESSING_TIMEOUT` | Operación tardó demasiado | 408 | Reintentar con imagen más pequeña |
| `STORAGE_ERROR` | Fallo de almacenamiento en la nube | 503 | Reintentar solicitud |
| `RATE_LIMIT_EXCEEDED` | Demasiadas solicitudes | 429 | Esperar y reintentar |
| `OCR_ENGINE_ERROR` | Fallo de procesamiento OCR | 500 | Verificar calidad de imagen |
| `MODEL_LOADING_ERROR` | Modelo AI no disponible | 503 | Reintentar después de retraso |

## Características de Rendimiento

### Tiempos de Procesamiento

**Tiempos de Procesamiento Típicos (por operación):**

| Operación | Imagen Pequeña (< 1MB) | Imagen Mediana (1-5MB) | Imagen Grande (5-50MB) |
|-----------|------------------------|------------------------|------------------------|
| Subida | 100-500ms | 200ms-1s | 1-5s |
| Redimensionar | 50-200ms | 100-500ms | 500ms-2s |
| Recortar | 25-100ms | 50-200ms | 200-800ms |
| Filtro Básico | 100-300ms | 200-800ms | 800ms-3s |
| Detección de Bordes | 200-500ms | 500ms-1.5s | 1.5-5s |
| OCR (Tesseract) | 500ms-2s | 1-5s | 3-15s |
| OCR (EasyOCR) | 1-3s | 2-8s | 5-25s |
| Detección de Objetos | 200-800ms | 500ms-2s | 1-8s |

### Métricas de Rendimiento

**Capacidad de Procesamiento Concurrente:**
- Endpoints API: 1000+ solicitudes/segundo
- Workers de Procesamiento de Imágenes: 50-200 imágenes/segundo (depende de las operaciones)
- Procesamiento OCR: 10-50 documentos/segundo
- Detección de Objetos: 20-100 imágenes/segundo

## Rate Limiting y Cuotas

### Límites de Rate por Defecto

| Tipo de Cliente | Solicitudes/Minuto | Límite de Ráfaga | Notas |
|-----------------|-------------------|------------------|-------|
| Anónimo (IP) | 60 | 10 | Uso básico |
| API Key (Gratis) | 1000 | 50 | Usuarios autenticados |
| API Key (Premium) | 10000 | 200 | Usuarios de alto volumen |

### Headers de Rate Limit

Todas las respuestas incluyen información de rate limiting:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642186800
X-RateLimit-Retry-After: 60
```

### Gestión de Cuotas

**Cuotas Diarias:**
- **Nivel Gratis**: 1000 imágenes/día
- **Nivel Básico**: 10,000 imágenes/día
- **Nivel Premium**: 100,000 imágenes/día
- **Empresarial**: Límites personalizados

**Monitoreo de Uso:**
```bash
curl -H "X-API-Key: tu-clave" \
  "http://localhost:8000/api/v1/usage/quota"

# Respuesta:
{
  "current_usage": {
    "daily_images": 2450,
    "monthly_images": 15670
  },
  "limits": {
    "daily_limit": 10000,
    "monthly_limit": 300000
  },
  "reset_times": {
    "daily_reset": "2024-01-16T00:00:00Z",
    "monthly_reset": "2024-02-01T00:00:00Z"
  }
}
```

## Patrones de Integración

### Integración con Webhooks

Configurar webhooks para recibir notificaciones de finalización de procesamiento:

```json
{
  "webhook_url": "https://tu-app.com/webhooks/imagen-procesada",
  "events": ["task.completed", "task.failed", "batch.completed"],
  "secret": "tu-secreto-webhook"
}
```

**Ejemplo de Payload de Webhook:**
```json
{
  "event": "task.completed",
  "task_id": "resize-123",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "status": "completed",
    "result": {
      "output_url": "https://storage.com/processed/imagen.jpg",
      "processing_time": 1.25
    }
  },
  "signature": "sha256=abc123..."
}
```

### Ejemplos de Integración con SDK

#### SDK Python
```python
from image_processing_client import ImageProcessingClient

client = ImageProcessingClient(
    base_url="http://localhost:8000",
    api_key="tu-api-key"
)

# Procesamiento síncrono
result = client.resize_image(
    image_url="https://ejemplo.com/imagen.jpg",
    width=800,
    height=600
)

# Procesamiento asíncrono con callback
task = client.resize_image_async(
    image_url="https://ejemplo.com/imagen.jpg",
    width=800,
    height=600,
    callback_url="https://tu-app.com/callback"
)

# Verificar estado de tarea
status = client.get_task_status(task.task_id)
```

#### Integración JavaScript/Node.js
```javascript
const ImageProcessingClient = require('image-processing-client');

const client = new ImageProcessingClient({
  baseUrl: 'http://localhost:8000',
  apiKey: 'tu-api-key'
});

// API basada en promesas
client.detectObjects({
  imageUrl: 'https://ejemplo.com/foto.jpg',
  confidenceThreshold: 0.7
})
.then(result => {
  console.log(`Detectados ${result.objects.length} objetos`);
})
.catch(error => {
  console.error('Detección falló:', error);
});

// Async/await
async function processImage() {
  try {
    const result = await client.extractText({
      imageUrl: 'https://ejemplo.com/documento.jpg',
      languages: ['spa', 'eng']
    });
    
    console.log('Texto extraído:', result.results);
  } catch (error) {
    console.error('OCR falló:', error);
  }
}
```

Esta documentación funcional proporciona una guía completa para desarrolladores y usuarios que integran con el Microservicio de Procesamiento de Imágenes. El servicio ofrece potente manipulación de imágenes, análisis potenciado por IA, y flujos de procesamiento flexibles adecuados para una amplia gama de aplicaciones desde simple redimensionamiento de imágenes hasta complejos pipelines de procesamiento de documentos.
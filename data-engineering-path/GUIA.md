# Guía de estudio: ruta de ingeniería de datos con Airflow, Snowflake y Databricks

Esta guía acompaña los cinco proyectos de esta carpeta. Para cada nivel dice qué practicar con el código, qué decir en una entrevista y qué preguntas suelen hacer. Los README de cada proyecto están en inglés porque el portafolio lo está; esta guía es la versión de estudio en español.

## Cómo usarla

1. Corre cada nivel en orden: `make up`, `make e2e`, `make test`, `make down`.
2. Antes de leer el código, intenta predecir qué hace cada tarea; después rompe algo a propósito (los ejercicios de cada nivel lo sugieren) y mira cómo lo detectan las pruebas.
3. Usa la sección "Para la entrevista" como guion: explica la decisión, la alternativa y por qué no la elegiste.

Si te preguntan por experiencia en producción con Airflow, sé honesto: estos proyectos demuestran que sabes diseñar y probar los patrones, no que los operaste a escala.

---

## Nivel 1 · Fundamentos de Airflow 3

**Qué practicas:** la arquitectura de Airflow 3 (api-server, scheduler, dag-processor, triggerer y base de metadatos), TaskFlow, el intervalo de datos y las escrituras idempotentes.

**Lo que más se pregunta y está en el código:**

- En Airflow 3, un cron sin más usa `CronTriggerTimetable`, donde `data_interval_start == data_interval_end`. Para "procesar el día que acaba de cerrar" hay que pedir `CronDataIntervalTimetable`. Es un cambio respecto a 2.x que confunde a mucha gente.
- Las tareas hablan con el api-server a través de la Task Execution API; ya no tocan la base de metadatos.
- XCom lleva rutas y reportes pequeños, nunca datos.
- `AirflowFailException` para datos malos (reintentar no sirve) y reintentos con backoff para errores de red.

**Ejercicios:** cambia la validación para exigir 23 filas y mira fallar `dag.test()`; haz un backfill de tres días desde la UI y revisa que cada partición aparezca una sola vez.

**Preguntas:** ¿qué procesa el run del 18 de noviembre? ¿Por qué el código de nivel superior de un DAG debe ser liviano? ¿Qué cambió en Airflow 3 y qué revisarías al migrar desde 2.x?

## Nivel 2 · Cargas idempotentes a Snowflake

**Qué practicas:** `COPY INTO` + `MERGE` o `DELETE`+`INSERT` por lote, dynamic task mapping, pools y sensores diferibles.

**Puntos finos que distinguen a un Principal:**

- `COPY INTO` guarda 64 días de historial y **omite** archivos ya cargados; en un rerun, staging queda vacío y el `DELETE`+`INSERT` borra datos en silencio. Solución: tabla de staging nueva más `FORCE = TRUE`.
- En Snowflake el DDL hace commit implícito: crea las tablas antes del `BEGIN`.
- El staging es `TEMPORARY` (por sesión), así que dos corridas de días distintos no se pisan.
- La reconciliación va **dentro** de la transacción: si no cuadra, `ROLLBACK`.
- El `MERGE` de dimensiones usa `QUALIFY ROW_NUMBER()` y solo actualiza si la versión entrante es más nueva: un backfill viejo no puede retroceder datos.
- El pool `warehouse` protege al warehouse; su tamaño depende del warehouse (1 en local porque DuckDB admite un solo escritor).

**Ejercicios:** quita `FORCE = TRUE` y explica qué pasaría en Snowflake; sube `max_active_runs` y piensa qué rompería un staging compartido.

**Preguntas:** ¿cómo garantizas que un reintento no duplique datos? ¿`MERGE` o `DELETE`+`INSERT`, y cuándo cada uno? ¿Qué diferencia hay entre un sensor diferible y `mode="reschedule"`?

## Nivel 3 · dbt con Cosmos, Assets y pruebas

**Qué practicas:** Cosmos con manifest precompilado, `TestBehavior.BUILD`, modelos incrementales idempotentes, dimensiones tardías, Assets con condición AND y CI.

**Puntos clave:**

- Cosmos convierte cada modelo en una tarea con reintentos y logs propios; un solo `dbt build` en un `BashOperator` obliga a re-correr todo.
- Leer el manifest (`LoadMode.DBT_MANIFEST`) evita ejecutar `dbt ls` en cada parseo.
- dbt va en su propio virtualenv para no chocar con las dependencias de Airflow.
- Un evento de Asset significa "hay datos nuevos", no "los datos son correctos": la calidad se valida antes de publicarlo.
- Miembros inferidos: cuando un pedido llega antes que su cliente, se crea un registro `is_inferred` en vez de perder el pedido o romper la prueba de integridad referencial.

**Ejercicios:** corrompe un pago y mira cómo la prueba singular frena el build; agrega un cuarto Asset a la condición del DAG de transformación.

**Preguntas:** ¿cómo orquestas dbt desde Airflow y por qué? ¿Cómo evitas que un modelo incremental duplique filas? ¿Assets o `ExternalTaskSensor`?

## Nivel 4 · Databricks y Delta Lake (medallion)

**Qué practicas:** bronze/silver/gold en Delta, `MERGE` y `replaceWhere`, cuarentena, datos tardíos, y orquestación con `DatabricksSubmitRunOperator`.

**Puntos clave:**

- Bronze guarda el texto crudo: los errores de esquema se corrigen re-procesando bronze, sin pedirle al origen que reenvíe.
- Silver separa registros inválidos en cuarentena con sus motivos y falla si superan el 5%.
- El `MERGE` de solo inserción por `event_id` absorbe duplicados que llegan en otro lote.
- Gold recalcula todas las fechas que tocó el lote, porque los eventos tardíos cambian el día anterior.
- `idempotency_token` evita lanzar dos clusters si Airflow reintenta; `deferrable=True` libera al worker mientras Spark trabaja.
- El emulador local implementa la parte de la Jobs API 2.2 que usa el operador; las pruebas de contrato encontraron que el hook asíncrono manda `run_id` en el cuerpo del GET.

**Ejercicios:** baja `--max-invalid-ratio` a 0.001 y mira fallar silver; usa time travel (`versionAsOf`) para comparar gold antes y después del lote tardío.

**Preguntas:** ¿cómo manejas datos tardíos en una arquitectura medallion? ¿Job clusters o clusters interactivos? ¿SubmitRun por capa o una sola Workflow? (ver ADR 0006)

## Nivel 5 · Arquitectura de referencia (Principal)

**Qué practicas:** defender una arquitectura completa con Terraform probado, linaje, costos y decisiones escritas.

**Cómo presentarla en 5 minutos:**

1. Contexto: fuentes, consumidores y el reparto entre Snowflake y Databricks (ADR 0002).
2. Flujo de un día (diagrama de secuencia del README).
3. Correctitud: contrato de idempotencia (ADR 0003) y calidad antes de publicar.
4. Operación: MWAA privado con dos schedulers, secretos en Secrets Manager, linaje con OpenLineage, alertas a SNS.
5. Costos: auto-suspend, monitores de recursos, política de clusters, presupuesto, y el modelo de costos con sus supuestos.
6. Qué revisarías después: MWAA o EKS (ADR 0001), y SubmitRun o Workflow (ADR 0006).

**Preguntas:** ¿MWAA, EKS o Astronomer? ¿Cómo controlas el gasto de Snowflake? ¿Cómo sabes qué dashboards se afectan si cambia una columna? ¿Cómo pruebas Terraform sin credenciales?

---

## Plan sugerido de 7 días

| Día | Actividad |
|---|---|
| 1 | Nivel 1 completo; explica en voz alta el intervalo de datos |
| 2 | Nivel 2; lee `warehouse.py` y reproduce los errores de `COPY` y de staging compartido |
| 3 | Nivel 3; recorre el grafo de Assets en la UI y el DAG que genera Cosmos |
| 4 | Nivel 4; corre `make e2e` y revisa la carpeta `_delta_log` |
| 5 | Nivel 5; lee los ADR y practica la presentación de 5 minutos |
| 6 | Simulacro: diseña en pizarra un pipeline nuevo usando los patrones de los niveles 2 a 4 |
| 7 | Repasa las preguntas de cada nivel y la guía de Airflow de `entrevistas/` |

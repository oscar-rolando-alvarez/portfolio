"""Pure DataFrame -> DataFrame transformations: the logic, testable without any table."""

from __future__ import annotations

from pyspark.sql import DataFrame, Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

EVENT_TYPES = ("page_view", "add_to_cart", "checkout", "purchase")

EVENT_SCHEMA = T.StructType(
    [
        T.StructField("event_id", T.StringType()),
        T.StructField("user_id", T.StringType()),
        T.StructField("session_id", T.StringType()),
        T.StructField("event_type", T.StringType()),
        T.StructField("ts", T.StringType()),
        T.StructField("page", T.StringType()),
        T.StructField("amount_usd", T.DoubleType()),
        T.StructField(
            "device",
            T.StructType([T.StructField("os", T.StringType()), T.StructField("app_version", T.StringType())]),
        ),
    ]
)


def to_bronze(raw_lines: DataFrame, batch_date: str) -> DataFrame:
    """Keep every line exactly as received, plus lineage columns. Never parse in bronze."""
    return raw_lines.select(
        F.col("value").alias("raw"),
        F.col("_metadata.file_path").alias("_source_file"),
        F.current_timestamp().alias("_ingested_at"),
        F.lit(batch_date).cast("date").alias("_batch_date"),
    )


def parse_events(bronze: DataFrame) -> DataFrame:
    parsed = bronze.select(F.from_json("raw", EVENT_SCHEMA).alias("e"), "raw", "_batch_date", "_ingested_at")
    event_ts = F.try_to_timestamp(F.col("e.ts"))
    problems = F.array_compact(
        F.array(
            F.when(F.col("e").isNull(), F.lit("unparseable_json")),
            F.when(F.col("e.event_id").isNull(), F.lit("missing_event_id")),
            F.when(F.col("e.user_id").isNull(), F.lit("missing_user_id")),
            F.when(event_ts.isNull(), F.lit("bad_timestamp")),
            F.when(~F.col("e.event_type").isin(*EVENT_TYPES), F.lit("unknown_event_type")),
            F.when(
                (F.col("e.event_type") == "purchase") & ~(F.coalesce(F.col("e.amount_usd"), F.lit(0.0)) > 0),
                F.lit("purchase_without_amount"),
            ),
        )
    )
    return parsed.select(
        F.col("e.event_id").alias("event_id"),
        F.col("e.user_id").alias("user_id"),
        F.col("e.session_id").alias("session_id"),
        F.col("e.event_type").alias("event_type"),
        event_ts.alias("event_ts"),
        F.to_date(event_ts).alias("event_date"),
        F.col("e.page").alias("page"),
        F.col("e.amount_usd").cast("decimal(12,2)").alias("amount_usd"),
        F.col("e.device.os").alias("device_os"),
        F.col("e.device.app_version").alias("app_version"),
        "_batch_date",
        "raw",
        problems.alias("_problems"),
    )


def split_valid(parsed: DataFrame) -> tuple[DataFrame, DataFrame]:
    valid = parsed.where(F.size("_problems") == 0).drop("_problems", "raw")
    quarantine = parsed.where(F.size("_problems") > 0).select(
        "raw", "_problems", "_batch_date", F.current_timestamp().alias("_quarantined_at")
    )
    return valid, quarantine


def dedupe(valid: DataFrame) -> DataFrame:
    """At-least-once delivery means duplicates: keep one row per event_id (the earliest)."""
    w = Window.partitionBy("event_id").orderBy("event_ts")
    return valid.withColumn("_rn", F.row_number().over(w)).where("_rn = 1").drop("_rn")


def daily_metrics(silver: DataFrame) -> DataFrame:
    sessions = silver.groupBy("event_date", "session_id").agg(
        F.max(F.when(F.col("event_type") == "purchase", 1).otherwise(0)).alias("converted")
    )
    session_stats = sessions.groupBy("event_date").agg(
        F.count("*").alias("sessions"), F.sum("converted").alias("converted_sessions")
    )
    events = silver.groupBy("event_date").agg(
        F.countDistinct("user_id").alias("daily_active_users"),
        F.sum(F.when(F.col("event_type") == "page_view", 1).otherwise(0)).alias("page_views"),
        F.sum(F.when(F.col("event_type") == "add_to_cart", 1).otherwise(0)).alias("add_to_carts"),
        F.sum(F.when(F.col("event_type") == "purchase", 1).otherwise(0)).alias("purchases"),
        F.coalesce(F.sum(F.when(F.col("event_type") == "purchase", F.col("amount_usd"))), F.lit(0))
        .cast("decimal(14,2)")
        .alias("revenue_usd"),
    )
    return (
        events.join(session_stats, "event_date")
        .withColumn("conversion_rate", F.round(F.col("converted_sessions") / F.col("sessions"), 4))
        .withColumn("_computed_at", F.current_timestamp())
    )

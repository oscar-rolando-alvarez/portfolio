from __future__ import annotations

import os

from pyspark.sql import SparkSession


def get_spark(app_name: str) -> SparkSession:
    """On Databricks the session already exists; locally we build one with Delta Lake."""
    if os.getenv("LOCAL_DELTA") != "1":
        return SparkSession.builder.appName(app_name).getOrCreate()

    from delta import configure_spark_with_delta_pip

    builder = (
        SparkSession.builder.appName(app_name)
        .master(os.getenv("SPARK_MASTER", "local[2]"))
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
        .config("spark.sql.shuffle.partitions", "4")
        .config("spark.ui.enabled", "false")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.databricks.delta.schema.autoMerge.enabled", "false")
    )
    return configure_spark_with_delta_pip(builder).getOrCreate()

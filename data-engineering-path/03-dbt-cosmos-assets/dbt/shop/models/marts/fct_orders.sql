{{
    config(
        materialized='incremental',
        unique_key='order_id',
        incremental_strategy='delete+insert',
        on_schema_change='fail'
    )
}}

-- Incremental and idempotent: each run reprocesses the last `lookback_days` load batches and
-- replaces those orders by key, so reruns and late fixes never duplicate rows.
with orders as (
    select * from {{ ref('stg_orders') }}
    {% if is_incremental() %}
    where batch_date >= (
        select {{ dbt.dateadd('day', -var('lookback_days'), 'max(batch_date)') }} from {{ this }}
    )
    {% endif %}
),

payments as (
    select order_id, sum(amount_usd) as paid_amount_usd, max(paid_ts) as paid_ts
    from {{ ref('stg_payments') }}
    group by order_id
)

select
    o.order_id,
    o.customer_id,
    o.order_ts,
    o.order_date,
    o.status,
    o.amount_usd,
    coalesce(p.paid_amount_usd, 0) as paid_amount_usd,
    p.paid_ts,
    o.batch_date
from orders as o
left join payments as p on o.order_id = p.order_id

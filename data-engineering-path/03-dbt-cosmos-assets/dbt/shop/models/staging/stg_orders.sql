select
    order_id,
    customer_id,
    order_ts,
    cast(order_ts as date) as order_date,
    status,
    cast(amount_usd as decimal(12, 2)) as amount_usd,
    _batch_date as batch_date
from {{ source('raw', 'orders') }}

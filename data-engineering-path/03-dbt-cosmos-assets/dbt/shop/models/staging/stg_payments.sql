select
    payment_id,
    order_id,
    method as payment_method,
    cast(amount_usd as decimal(12, 2)) as amount_usd,
    paid_ts,
    _batch_date as batch_date
from {{ source('raw', 'payments') }}

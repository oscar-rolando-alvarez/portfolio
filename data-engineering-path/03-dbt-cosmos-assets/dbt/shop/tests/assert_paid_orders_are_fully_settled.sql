-- Every paid order must have payments that add up to its amount (to the cent).
select order_id, amount_usd, paid_amount_usd
from {{ ref('fct_orders') }}
where status = 'paid'
  and abs(amount_usd - paid_amount_usd) > 0.009

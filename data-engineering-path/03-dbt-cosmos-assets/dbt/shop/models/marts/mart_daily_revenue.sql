select
    f.order_date,
    c.country_code,
    count(*) as orders,
    sum(case when f.status = 'paid' then 1 else 0 end) as paid_orders,
    sum(f.paid_amount_usd) as revenue_usd,
    round(sum(f.paid_amount_usd) / nullif(sum(case when f.status = 'paid' then 1 else 0 end), 0), 2)
        as avg_paid_order_usd
from {{ ref('fct_orders') }} as f
left join {{ ref('dim_customers') }} as c on f.customer_id = c.customer_id
group by f.order_date, c.country_code

-- Late-arriving dimensions: an order can reference a customer whose record has not
-- been extracted yet. Instead of dropping the order (or failing the FK test), we add an
-- *inferred member* with unknown attributes; the next MERGE of that customer fills it in.
with customers as (
    select customer_id, email, country_code, segment, updated_at, false as is_inferred
    from {{ ref('stg_customers') }}
),

inferred as (
    select distinct
        o.customer_id,
        cast(null as varchar) as email,
        'UNKNOWN' as country_code,
        'unknown' as segment,
        cast(null as timestamp) as updated_at,
        true as is_inferred
    from {{ ref('stg_orders') }} as o
    left join customers as c on o.customer_id = c.customer_id
    where c.customer_id is null
),

all_customers as (
    select * from customers
    union all
    select * from inferred
),

orders as (
    select
        customer_id,
        count(*) as lifetime_orders,
        sum(case when status = 'paid' then amount_usd else 0 end) as lifetime_revenue_usd,
        min(order_date) as first_order_date,
        max(order_date) as last_order_date
    from {{ ref('stg_orders') }}
    group by customer_id
)

select
    c.customer_id,
    c.email,
    c.country_code,
    c.segment,
    c.is_inferred,
    coalesce(o.lifetime_orders, 0) as lifetime_orders,
    coalesce(o.lifetime_revenue_usd, 0) as lifetime_revenue_usd,
    o.first_order_date,
    o.last_order_date,
    c.updated_at
from all_customers as c
left join orders as o on c.customer_id = o.customer_id

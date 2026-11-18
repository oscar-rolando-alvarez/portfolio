select
    customer_id,
    lower(email) as email,
    upper(country) as country_code,
    segment,
    updated_at
from {{ source('raw', 'customers') }}

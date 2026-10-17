--liquibase formatted sql

--changeset crypto-trading-platform:001-initial-schema
--comment: Initial schema for all JPA entities (users, accounts, balances, orders, trades, positions, portfolios, market data).

create sequence base_sequence start with 1 increment by 1;

create table accounts (
    available_balance numeric(36,18) not null,
    buying_power numeric(36,18),
    initial_margin numeric(36,18),
    is_active boolean,
    is_margin_enabled boolean,
    locked_balance numeric(36,18) not null,
    maintenance_margin numeric(36,18),
    margin_level numeric(10,6),
    margin_ratio numeric(10,6),
    realized_pnl numeric(36,18),
    total_balance numeric(36,18) not null,
    unrealized_pnl numeric(36,18),
    created_at timestamp(6) not null,
    id bigint not null,
    updated_at timestamp(6),
    user_id bigint not null,
    version bigint not null,
    account_name varchar(255) not null,
    account_type varchar(255) not null check ((account_type in ('SPOT','MARGIN','FUTURES','OPTIONS'))),
    description varchar(255),
    primary key (id)
);

create table balances (
    available numeric(36,18) not null,
    avg_buy_price numeric(36,18),
    borrowing numeric(36,18),
    interest numeric(36,18),
    locked numeric(36,18) not null,
    net_asset numeric(36,18),
    total numeric(36,18) not null,
    withdrawing numeric(36,18),
    account_id bigint not null,
    created_at timestamp(6) not null,
    id bigint not null,
    last_update_time bigint,
    updated_at timestamp(6),
    version bigint not null,
    asset varchar(255) not null,
    primary key (id),
    constraint uk_balance_account_asset unique (account_id, asset)
);

create table market_data (
    ask_price numeric(36,18),
    ask_quantity numeric(36,18),
    bid_price numeric(36,18),
    bid_quantity numeric(36,18),
    high_price numeric(36,18),
    is_best_price boolean,
    low_price numeric(36,18),
    open_price numeric(36,18),
    prev_close_price numeric(36,18),
    price numeric(36,18) not null,
    price_change numeric(36,18),
    price_change_percent numeric(10,6),
    quote_volume numeric(36,18),
    volume numeric(36,18),
    weighted_avg_price numeric(36,18),
    count bigint,
    created_at timestamp(6) not null,
    event_time bigint,
    first_id bigint,
    id bigint not null,
    last_id bigint,
    timestamp timestamp(6) not null,
    updated_at timestamp(6),
    version bigint not null,
    exchange varchar(255) not null check ((exchange in ('BINANCE','COINBASE','KRAKEN','INTERNAL'))),
    symbol varchar(255) not null,
    primary key (id)
);

create table orders (
    avg_price numeric(36,18),
    commission numeric(36,18),
    executed_quantity numeric(36,18) not null,
    executed_quote_quantity numeric(36,18),
    iceberg_qty numeric(36,18),
    is_close_position boolean,
    is_reduce_only boolean,
    price numeric(36,18),
    quantity numeric(36,18) not null,
    quote_quantity numeric(36,18),
    remaining_quantity numeric(36,18) not null,
    stop_price numeric(36,18),
    account_id bigint not null,
    cancelled_at timestamp(6),
    created_at timestamp(6) not null,
    expires_at timestamp(6),
    filled_at timestamp(6),
    good_till_date bigint,
    id bigint not null,
    submitted_at timestamp(6),
    trading_pair_id bigint not null,
    updated_at timestamp(6),
    user_id bigint not null,
    version bigint not null,
    working_time bigint,
    client_order_id varchar(255),
    commission_asset varchar(255),
    exchange varchar(255) not null check ((exchange in ('BINANCE','COINBASE','KRAKEN','INTERNAL'))),
    external_order_id varchar(255),
    reject_reason varchar(255),
    self_trade_prevention_mode varchar(255),
    side varchar(255) not null check ((side in ('BUY','SELL'))),
    status varchar(255) not null check ((status in ('PENDING','SUBMITTED','OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED','EXPIRED','SUSPENDED','TRIGGERED'))),
    symbol varchar(255) not null,
    time_in_force varchar(255),
    type varchar(255) not null check ((type in ('MARKET','LIMIT','STOP_LOSS','STOP_LIMIT','TAKE_PROFIT','TRAILING_STOP','ICEBERG','OCO'))),
    primary key (id)
);

create table portfolio_snapshots (
    benchmark_return numeric(10,6),
    benchmark_value numeric(36,18),
    cumulative_return numeric(10,6),
    daily_return numeric(10,6),
    drawdown numeric(10,6),
    realized_pnl numeric(36,18),
    sharpe_ratio numeric(10,6),
    total_fees numeric(36,18),
    total_value numeric(36,18) not null,
    unrealized_pnl numeric(36,18),
    volatility numeric(10,6),
    volume_traded numeric(36,18),
    created_at timestamp(6) not null,
    id bigint not null,
    portfolio_id bigint not null,
    snapshot_timestamp timestamp(6) not null,
    total_trades bigint,
    updated_at timestamp(6),
    version bigint not null,
    primary key (id)
);

create table portfolios (
    alpha numeric(10,6),
    beta numeric(10,6),
    calmar_ratio numeric(10,6),
    current_value numeric(36,18) not null,
    initial_value numeric(36,18) not null,
    is_active boolean,
    is_default boolean,
    largest_loss numeric(36,18),
    largest_win numeric(36,18),
    max_drawdown numeric(10,6),
    max_runup numeric(10,6),
    realized_pnl numeric(36,18),
    sharpe_ratio numeric(10,6),
    sortino_ratio numeric(10,6),
    total_deposits numeric(36,18),
    total_fees numeric(36,18),
    total_withdrawals numeric(36,18),
    unrealized_pnl numeric(36,18),
    var_95 numeric(36,18),
    var_99 numeric(36,18),
    volatility numeric(10,6),
    created_at timestamp(6) not null,
    id bigint not null,
    last_calculated timestamp(6),
    last_updated timestamp(6),
    losing_trades bigint,
    total_trades bigint,
    updated_at timestamp(6),
    user_id bigint not null,
    version bigint not null,
    winning_trades bigint,
    base_currency varchar(255) not null,
    benchmark_symbol varchar(255),
    description varchar(255),
    portfolio_name varchar(255) not null,
    primary key (id)
);

create table positions (
    avg_entry_price numeric(36,18) not null,
    initial_margin numeric(36,18),
    is_open boolean,
    maintenance_margin numeric(36,18),
    margin_ratio numeric(10,6),
    mark_price numeric(36,18),
    quantity numeric(36,18) not null,
    realized_pnl numeric(36,18),
    total_cost numeric(36,18),
    total_fees numeric(36,18),
    unrealized_pnl numeric(36,18),
    account_id bigint not null,
    closed_at timestamp(6),
    created_at timestamp(6) not null,
    id bigint not null,
    last_updated timestamp(6),
    opened_at timestamp(6),
    updated_at timestamp(6),
    version bigint not null,
    base_asset varchar(255),
    position_side varchar(255),
    quote_asset varchar(255),
    symbol varchar(255) not null,
    primary key (id),
    constraint uk_position_account_symbol unique (account_id, symbol)
);

create table trades (
    commission numeric(36,18) not null,
    is_buyer boolean,
    is_maker boolean,
    price numeric(36,18) not null,
    quantity numeric(36,18) not null,
    quote_quantity numeric(36,18) not null,
    realized_pnl numeric(36,18),
    account_id bigint not null,
    created_at timestamp(6) not null,
    executed_at timestamp(6) not null,
    id bigint not null,
    order_id bigint not null,
    order_list_id bigint,
    trade_time bigint,
    updated_at timestamp(6),
    user_id bigint not null,
    version bigint not null,
    base_asset varchar(255),
    commission_asset varchar(255),
    external_trade_id varchar(255),
    quote_asset varchar(255),
    side varchar(255) not null check ((side in ('BUY','SELL'))),
    symbol varchar(255) not null,
    primary key (id)
);

create table trading_pairs (
    base_asset_precision integer,
    is_active boolean,
    is_margin_enabled boolean,
    is_spot_enabled boolean,
    maker_fee numeric(10,6) not null,
    max_price numeric(36,18) not null,
    max_quantity numeric(36,18) not null,
    min_notional numeric(36,18) not null,
    min_price numeric(36,18) not null,
    min_quantity numeric(36,18) not null,
    price_precision integer not null,
    quantity_precision integer not null,
    quote_asset_precision integer,
    step_size numeric(36,18) not null,
    taker_fee numeric(10,6) not null,
    tick_size numeric(36,18) not null,
    created_at timestamp(6) not null,
    id bigint not null,
    updated_at timestamp(6),
    version bigint not null,
    base_asset varchar(255) not null,
    display_name varchar(255),
    order_types varchar(255),
    permissions varchar(255),
    quote_asset varchar(255) not null,
    symbol varchar(255) not null unique,
    primary key (id)
);

create table transactions (
    amount numeric(36,18) not null,
    balance_after numeric(36,18),
    confirmations integer,
    exchange_rate numeric(36,18),
    fee numeric(36,18),
    gas_fee numeric(36,18),
    quote_amount numeric(36,18),
    account_id bigint not null,
    created_at timestamp(6) not null,
    id bigint not null,
    updated_at timestamp(6),
    user_id bigint not null,
    version bigint not null,
    asset varchar(255) not null,
    base_currency varchar(255),
    block_hash varchar(255),
    description varchar(255),
    external_id varchar(255),
    fee_asset varchar(255),
    from_address varchar(255),
    network varchar(255),
    reference_id varchar(255),
    status varchar(255),
    tags varchar(255),
    to_address varchar(255),
    transaction_hash varchar(255),
    transaction_type varchar(255) not null check ((transaction_type in ('DEPOSIT','WITHDRAWAL','TRADE_BUY','TRADE_SELL','FEE','INTEREST','DIVIDEND','TRANSFER_IN','TRANSFER_OUT','LIQUIDATION','FUNDING_PAYMENT','REBATE'))),
    primary key (id)
);

create table user_roles (
    user_id bigint not null,
    role varchar(255),
    unique (user_id, role)
);

create table users (
    account_non_expired boolean,
    account_non_locked boolean,
    credentials_non_expired boolean,
    email_verified boolean,
    enabled boolean,
    failed_login_attempts integer,
    two_factor_enabled boolean,
    created_at timestamp(6) not null,
    id bigint not null,
    last_login timestamp(6),
    locked_until timestamp(6),
    updated_at timestamp(6),
    version bigint not null,
    username varchar(50) not null unique,
    api_key varchar(255) unique,
    api_secret varchar(255),
    email varchar(255) not null unique,
    first_name varchar(255),
    last_name varchar(255),
    password varchar(255) not null,
    phone_number varchar(255),
    two_factor_secret varchar(255),
    primary key (id)
);

create index idx_account_user_type 
   on accounts (user_id, account_type);

create index idx_account_user_id 
   on accounts (user_id);

create index idx_account_name 
   on accounts (account_name);

create index idx_balance_account_asset 
   on balances (account_id, asset);

create index idx_balance_account_id 
   on balances (account_id);

create index idx_balance_asset 
   on balances (asset);

create index idx_market_data_symbol 
   on market_data (symbol);

create index idx_market_data_exchange 
   on market_data (exchange);

create index idx_market_data_timestamp 
   on market_data (timestamp);

create index idx_market_data_symbol_exchange 
   on market_data (symbol, exchange);

create index idx_market_data_symbol_timestamp 
   on market_data (symbol, timestamp);

create index idx_order_user_id 
   on orders (user_id);

create index idx_order_account_id 
   on orders (account_id);

create index idx_order_symbol 
   on orders (symbol);

create index idx_order_status 
   on orders (status);

create index idx_order_external_id 
   on orders (external_order_id);

create index idx_order_created_at 
   on orders (created_at);

create index idx_order_status_created 
   on orders (status, created_at);

create index idx_snapshot_portfolio_id 
   on portfolio_snapshots (portfolio_id);

create index idx_snapshot_timestamp 
   on portfolio_snapshots (snapshot_timestamp);

create index idx_snapshot_portfolio_timestamp 
   on portfolio_snapshots (portfolio_id, snapshot_timestamp);

create index idx_portfolio_user_id 
   on portfolios (user_id);

create index idx_portfolio_name 
   on portfolios (portfolio_name);

create index idx_portfolio_is_default 
   on portfolios (is_default);

create index idx_position_account_symbol 
   on positions (account_id, symbol);

create index idx_position_account_id 
   on positions (account_id);

create index idx_position_symbol 
   on positions (symbol);

create index idx_position_is_open 
   on positions (is_open);

create index idx_trade_order_id 
   on trades (order_id);

create index idx_trade_symbol 
   on trades (symbol);

create index idx_trade_user_id 
   on trades (user_id);

create index idx_trade_external_id 
   on trades (external_trade_id);

create index idx_trade_executed_at 
   on trades (executed_at);

create index idx_trade_symbol_executed 
   on trades (symbol, executed_at);

create index idx_trading_pair_symbol 
   on trading_pairs (symbol);

create index idx_trading_pair_base_quote 
   on trading_pairs (base_asset, quote_asset);

create index idx_trading_pair_active 
   on trading_pairs (is_active);

create index idx_transaction_account_id 
   on transactions (account_id);

create index idx_transaction_user_id 
   on transactions (user_id);

create index idx_transaction_type 
   on transactions (transaction_type);

create index idx_transaction_asset 
   on transactions (asset);

create index idx_transaction_reference 
   on transactions (reference_id);

create index idx_transaction_created 
   on transactions (created_at);

create index idx_user_email 
   on users (email);

create index idx_user_username 
   on users (username);

create index idx_user_api_key 
   on users (api_key);

alter table if exists accounts 
   add constraint FKnjuop33mo69pd79ctplkck40n 
   foreign key (user_id) 
   references users;

alter table if exists balances 
   add constraint FK9i324xm4kdw0k03tiom9x5m5a 
   foreign key (account_id) 
   references accounts;

alter table if exists orders 
   add constraint FKagh5svlor3slbay6tq5wqor1o 
   foreign key (account_id) 
   references accounts;

alter table if exists orders 
   add constraint FKpsqhbob8qyte0klx5oo58yldn 
   foreign key (trading_pair_id) 
   references trading_pairs;

alter table if exists orders 
   add constraint FK32ql8ubntj5uh44ph9659tiih 
   foreign key (user_id) 
   references users;

alter table if exists portfolio_snapshots 
   add constraint FK18lhaehr20wjpjref6b7eghk 
   foreign key (portfolio_id) 
   references portfolios;

alter table if exists portfolios 
   add constraint FK9xt36kgm9cxsf79r2me0d9f6u 
   foreign key (user_id) 
   references users;

alter table if exists positions 
   add constraint FKatvkyfeasyxk2jd0174r4iblr 
   foreign key (account_id) 
   references accounts;

alter table if exists trades 
   add constraint FKds5jnjr17mtmbf5vannnd7j57 
   foreign key (account_id) 
   references accounts;

alter table if exists trades 
   add constraint FKc5i1efnoeyqp5tjfvxdytm545 
   foreign key (order_id) 
   references orders;

alter table if exists trades 
   add constraint FKof2p7ht9xpwtu4myqv787bbr8 
   foreign key (user_id) 
   references users;

alter table if exists transactions 
   add constraint FK20w7wsg13u9srbq3bd7chfxdh 
   foreign key (account_id) 
   references accounts;

alter table if exists transactions 
   add constraint FKqwv7rmvc8va8rep7piikrojds 
   foreign key (user_id) 
   references users;

alter table if exists user_roles 
   add constraint FKhfh9dx7w3ubf1co1vdev94g3f 
   foreign key (user_id) 
   references users;

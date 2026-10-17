--liquibase formatted sql

--changeset messaging-system:001-initial-schema
--comment: Initial schema for users, channels, groups, messages, reactions, attachments, delivery status and presence.

create table channel_admins (
    channel_id uuid not null,
    user_id uuid not null,
    primary key (channel_id, user_id)
);

create table channel_invites (
    current_uses integer not null,
    is_active boolean not null,
    max_uses integer,
    created_at timestamp(6) not null,
    expires_at timestamp(6),
    updated_at timestamp(6) not null,
    version bigint not null,
    channel_id uuid not null,
    created_by_user_id uuid not null,
    id uuid not null,
    invite_code varchar(255) not null unique,
    primary key (id)
);

create table channel_members (
    channel_id uuid not null,
    user_id uuid not null,
    primary key (channel_id, user_id)
);

create table channels (
    announcement_only boolean not null,
    is_archived boolean not null,
    is_private boolean not null,
    max_members integer,
    slow_mode_delay integer,
    created_at timestamp(6) not null,
    updated_at timestamp(6) not null,
    version bigint not null,
    created_by_user_id uuid not null,
    id uuid not null,
    name varchar(100) not null,
    description varchar(500),
    topic varchar(255),
    type varchar(255) not null check ((type in ('TEXT','VOICE','VIDEO','ANNOUNCEMENT','DIRECT_MESSAGE','GROUP_MESSAGE'))),
    primary key (id)
);

create table group_admins (
    group_id uuid not null,
    user_id uuid not null,
    primary key (group_id, user_id)
);

create table group_members (
    group_id uuid not null,
    user_id uuid not null,
    primary key (group_id, user_id)
);

create table groups (
    is_private boolean not null,
    max_members integer,
    created_at timestamp(6) not null,
    updated_at timestamp(6) not null,
    version bigint not null,
    created_by_user_id uuid not null,
    id uuid not null,
    name varchar(100) not null,
    description varchar(500),
    avatar_url varchar(255),
    primary key (id)
);

create table message_attachments (
    duration integer,
    height integer,
    is_virus_scanned boolean not null,
    width integer,
    created_at timestamp(6) not null,
    file_size bigint not null,
    updated_at timestamp(6) not null,
    version bigint not null,
    id uuid not null,
    message_id uuid not null,
    checksum varchar(255),
    file_path varchar(255) not null,
    file_url varchar(255),
    filename varchar(255) not null,
    mime_type varchar(255),
    original_filename varchar(255) not null,
    thumbnail_url varchar(255),
    type varchar(255) not null check ((type in ('IMAGE','VIDEO','AUDIO','DOCUMENT','ARCHIVE','OTHER'))),
    virus_scan_result varchar(255),
    primary key (id)
);

create table message_mentions (
    message_id uuid not null,
    user_id uuid not null,
    primary key (message_id, user_id)
);

create table message_metadata (
    message_id uuid not null,
    metadata_key varchar(255) not null,
    metadata_value varchar(255),
    primary key (message_id, metadata_key)
);

create table message_reactions (
    created_at timestamp(6) not null,
    updated_at timestamp(6) not null,
    version bigint not null,
    id uuid not null,
    message_id uuid not null,
    user_id uuid not null,
    emoji varchar(255) not null,
    primary key (id),
    unique (message_id, user_id, emoji)
);

create table message_statuses (
    created_at timestamp(6) not null,
    delivered_at timestamp(6),
    read_at timestamp(6),
    updated_at timestamp(6) not null,
    version bigint not null,
    id uuid not null,
    message_id uuid not null,
    user_id uuid not null,
    status varchar(255) not null check ((status in ('SENT','DELIVERED','READ','FAILED'))),
    primary key (id),
    unique (message_id, user_id)
);

create table messages (
    is_deleted boolean not null,
    is_edited boolean not null,
    is_pinned boolean not null,
    created_at timestamp(6) not null,
    deleted_at timestamp(6),
    edited_at timestamp(6),
    pinned_at timestamp(6),
    updated_at timestamp(6) not null,
    version bigint not null,
    channel_id uuid,
    group_id uuid,
    id uuid not null,
    parent_message_id uuid,
    pinned_by_user_id uuid,
    sender_id uuid not null,
    content varchar(4000) not null,
    encrypted_content TEXT,
    type varchar(255) not null check ((type in ('TEXT','IMAGE','VIDEO','AUDIO','FILE','SYSTEM','VOICE_MESSAGE','STICKER','GIF','POLL','LOCATION','CONTACT','LINK_PREVIEW'))),
    primary key (id)
);

create table user_notification_settings (
    user_id uuid not null,
    setting_key varchar(255) not null,
    setting_value varchar(255),
    primary key (user_id, setting_key)
);

create table user_presence (
    is_desktop boolean not null,
    is_mobile boolean not null,
    is_web boolean not null,
    created_at timestamp(6) not null,
    last_seen_at timestamp(6),
    updated_at timestamp(6) not null,
    version bigint not null,
    id uuid not null,
    user_id uuid not null unique,
    custom_message varchar(255),
    session_id varchar(255),
    status varchar(255) not null check ((status in ('ONLINE','AWAY','BUSY','DO_NOT_DISTURB','INVISIBLE','OFFLINE'))),
    primary key (id)
);

create table users (
    failed_login_attempts integer,
    is_active boolean not null,
    is_email_verified boolean not null,
    two_factor_enabled boolean not null,
    language varchar(5),
    account_locked_until timestamp(6),
    created_at timestamp(6) not null,
    last_seen_at timestamp(6),
    updated_at timestamp(6) not null,
    version bigint not null,
    id uuid not null,
    username varchar(50) not null unique,
    display_name varchar(100),
    bio varchar(500),
    avatar_url varchar(255),
    email varchar(255) not null unique,
    password_hash varchar(255) not null,
    role varchar(255) not null check ((role in ('USER','MODERATOR','ADMIN','SUPER_ADMIN'))),
    status varchar(255) not null check ((status in ('ONLINE','AWAY','BUSY','DO_NOT_DISTURB','INVISIBLE','OFFLINE'))),
    timezone varchar(255),
    two_factor_secret varchar(255),
    primary key (id)
);

create index idx_channel_invite_channel 
   on channel_invites (channel_id);

create index idx_channel_invite_code 
   on channel_invites (invite_code);

create index idx_channel_invite_created_by 
   on channel_invites (created_by_user_id);

create index idx_channel_name 
   on channels (name);

create index idx_channel_type 
   on channels (type);

create index idx_channel_is_private 
   on channels (is_private);

create index idx_group_name 
   on groups (name);

create index idx_message_attachment_message 
   on message_attachments (message_id);

create index idx_message_attachment_type 
   on message_attachments (type);

create index idx_message_reaction_message 
   on message_reactions (message_id);

create index idx_message_reaction_user 
   on message_reactions (user_id);

create index idx_message_reaction_emoji 
   on message_reactions (emoji);

create index idx_message_status_message 
   on message_statuses (message_id);

create index idx_message_status_user 
   on message_statuses (user_id);

create index idx_message_status_status 
   on message_statuses (status);

create index idx_message_sender 
   on messages (sender_id);

create index idx_message_channel 
   on messages (channel_id);

create index idx_message_group 
   on messages (group_id);

create index idx_message_parent 
   on messages (parent_message_id);

create index idx_message_type 
   on messages (type);

create index idx_message_created_at 
   on messages (created_at);

create index idx_user_presence_user 
   on user_presence (user_id);

create index idx_user_presence_status 
   on user_presence (status);

create index idx_user_presence_last_seen 
   on user_presence (last_seen_at);

create index idx_user_email 
   on users (email);

create index idx_user_username 
   on users (username);

create index idx_user_status 
   on users (status);

alter table if exists channel_admins 
   add constraint FKlckrlei3hbndfuvqqjqba95dg 
   foreign key (user_id) 
   references users;

alter table if exists channel_admins 
   add constraint FKsoogabtvdtxid5hwuohrjrb6 
   foreign key (channel_id) 
   references channels;

alter table if exists channel_invites 
   add constraint FKsmx0mrtu7wl7tbmuukuj3vae2 
   foreign key (channel_id) 
   references channels;

alter table if exists channel_invites 
   add constraint FKb729t5xs0r22erab5vahpn660 
   foreign key (created_by_user_id) 
   references users;

alter table if exists channel_members 
   add constraint FKjunpxp98pv6g23t5d3w5hx8ji 
   foreign key (user_id) 
   references users;

alter table if exists channel_members 
   add constraint FK5w7mqibtg5vbjt7xq6xyhc479 
   foreign key (channel_id) 
   references channels;

alter table if exists channels 
   add constraint FK5nh3ysvmchr5795jt99qbhpt5 
   foreign key (created_by_user_id) 
   references users;

alter table if exists group_admins 
   add constraint FKb5b97c66kwb954br9ckpfkmxl 
   foreign key (user_id) 
   references users;

alter table if exists group_admins 
   add constraint FKjw0n8o7kr8sd9weph81jsruo3 
   foreign key (group_id) 
   references groups;

alter table if exists group_members 
   add constraint FKnr9qg33qt2ovmv29g4vc3gtdx 
   foreign key (user_id) 
   references users;

alter table if exists group_members 
   add constraint FKkv9vlrye4rmhqjq4qohy2n5a6 
   foreign key (group_id) 
   references groups;

alter table if exists groups 
   add constraint FK3anmn8cor1wvcruwqqe2yxhd 
   foreign key (created_by_user_id) 
   references users;

alter table if exists message_attachments 
   add constraint FKj7twd218e2gqw9cmlhwvo1rth 
   foreign key (message_id) 
   references messages;

alter table if exists message_mentions 
   add constraint FKtl1wwfmsu5sj9bgf0j8eoadb4 
   foreign key (user_id) 
   references users;

alter table if exists message_mentions 
   add constraint FKn8dkm95maeahsjpbee9cnbntd 
   foreign key (message_id) 
   references messages;

alter table if exists message_metadata 
   add constraint FK551dqaq53960gos1wl9862enc 
   foreign key (message_id) 
   references messages;

alter table if exists message_reactions 
   add constraint FK1o714y33gam6b6741ci4ho041 
   foreign key (message_id) 
   references messages;

alter table if exists message_reactions 
   add constraint FKoip2ttlg2py976foointttaew 
   foreign key (user_id) 
   references users;

alter table if exists message_statuses 
   add constraint FK6mrqt41j8kll7wg575eco2aqk 
   foreign key (message_id) 
   references messages;

alter table if exists message_statuses 
   add constraint FKfr5vxt8u6eopfvl93b9r2r8m 
   foreign key (user_id) 
   references users;

alter table if exists messages 
   add constraint FK3u3ckbhwq9se1cmopk2pq05b2 
   foreign key (channel_id) 
   references channels;

alter table if exists messages 
   add constraint FK2cpth2c6q2d75e9ppqyc402t 
   foreign key (group_id) 
   references groups;

alter table if exists messages 
   add constraint FK8cs7qdu3mdbr08xirdmsfxpgk 
   foreign key (parent_message_id) 
   references messages;

alter table if exists messages 
   add constraint FKm6q04w2tkx3k4cpcivaihmmk0 
   foreign key (pinned_by_user_id) 
   references users;

alter table if exists messages 
   add constraint FK4ui4nnwntodh6wjvck53dbk9m 
   foreign key (sender_id) 
   references users;

alter table if exists user_notification_settings 
   add constraint FKs9tjvxu8ko31ivjlq9l9duh9y 
   foreign key (user_id) 
   references users;

alter table if exists user_presence 
   add constraint FK1ylg0mbhobr4t9gvc72jx5am4 
   foreign key (user_id) 
   references users;

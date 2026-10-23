-- Multipunk · esquema do banco (PostgreSQL 18 no Neon). Cole inteiro no SQL Editor do Neon e rode uma vez.
-- É idempotente: pode rodar de novo sem apagar nada.

-- ───────────── contas ─────────────
create table if not exists users (
  id            bigserial primary key,
  username      varchar(20) not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  password_hash text        not null,                      -- bcrypt (custo 12); a senha nunca é guardada
  failed_logins int         not null default 0,
  locked_until  timestamptz,                               -- bloqueio temporário após erros seguidos
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists users_username_lower_uq on users (lower(username));

-- sessões: só o hash SHA-256 do token vai para o banco (o token em si fica no cookie HttpOnly)
create table if not exists sessions (
  id         bigserial primary key,
  user_id    bigint      not null references users(id) on delete cascade,
  token_hash bytea       not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip         text,
  user_agent text
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- ───────────── mundo compartilhado ─────────────
create table if not exists world_meta (
  key   text  primary key,                                 -- 'season', 'turn', 'last_tick'
  value jsonb not null
);

-- cada quadrado do continente: porcentagem de domínio de cada força (soma sempre 100)
create table if not exists world_sectors (
  gx         smallint    not null,
  gy         smallint    not null,
  biome      text        not null,
  human      smallint    not null default 0 check (human  between 0 and 100),
  insect     smallint    not null default 0 check (insect between 0 and 100),
  robot      smallint    not null default 0 check (robot  between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (gx, gy),
  check (human + insect + robot = 100)
);

create table if not exists world_events (                  -- notícias da guerra
  id     bigserial primary key,
  season int         not null,
  at     timestamptz not null default now(),
  text   text        not null
);
create index if not exists world_events_idx on world_events (season, id desc);

-- ───────────── batalhas (auditoria e antifraude) ─────────────
create table if not exists battles (
  id         bigserial primary key,
  season     int         not null,
  host_id    bigint      references users(id) on delete set null,
  gx         smallint    not null,
  gy         smallint    not null,
  faction    char(1)     not null check (faction in ('I', 'R')),
  level      smallint    not null,
  party      smallint    not null default 1,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  result     text        check (result in ('win', 'loss', 'abort')),
  delta      smallint
);
create index if not exists battles_host_idx on battles (host_id, started_at desc);

create table if not exists battle_members (
  battle_id bigint not null references battles(id) on delete cascade,
  user_id   bigint not null references users(id) on delete cascade,
  primary key (battle_id, user_id)
);

create table if not exists contributions (                 -- ranking por temporada
  season      int    not null,
  user_id     bigint not null references users(id) on delete cascade,
  points      int    not null default 0,
  battles_won int    not null default 0,
  primary key (season, user_id)
);

-- limpeza periódica de sessões vencidas (o servidor também faz isso sozinho)
-- delete from sessions where expires_at < now();

-- PostgREST API for contributions: tokens table, api.submit(), and roles.
-- Run once:
--   docker exec -i postgis psql -U pgsl_admin -d pgsl -v ON_ERROR_STOP=1 \
--     -v auth_pw='AUTHENTICATOR_PASSWORD' < sql/02_submit_api.sql

create extension if not exists pgcrypto;

-- Invite tokens --------------------------------------------------------------
create table contrib.tokens (
  token          text primary key,
  label          text not null,
  allowed_layers text[],                 -- null = all layers
  max_uses       int,                    -- null = unlimited
  uses           int not null default 0,
  hourly_limit   int not null default 60,
  expires_at     timestamptz,            -- null = never
  revoked        boolean not null default false,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

-- Helper for admins: select contrib.new_token('Bidar workshop Nov', 200, 14);
create function contrib.new_token(p_label text, p_max_uses int default null,
                                  p_days int default 30, p_layers text[] default null)
returns text language sql as $$
  insert into contrib.tokens(token, label, max_uses, expires_at, allowed_layers)
  values (upper(substr(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''), 1, 12)),
          p_label, p_max_uses,
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          p_layers)
  returning token;
$$;

-- Public API ------------------------------------------------------------------
create schema api;

create function api.submit(
  p_token text, p_layer text, p_geojson json,
  p_one_class text, p_subtype text default null, p_one_state text default null,
  p_tags json default '{}', p_local_name text default null, p_notes text default null,
  p_author_name text default null
) returns json
language plpgsql security definer
set search_path = contrib, public
as $$
declare
  t      contrib.tokens;
  g      geometry;
  new_id bigint;
begin
  -- 1. Token: check and count the use in one statement.
  --    Any later error rolls back the whole call, including this use.
  update contrib.tokens
     set uses = uses + 1, last_used_at = now()
   where token = p_token
     and not revoked
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
     and (allowed_layers is null or p_layer = any(allowed_layers))
  returning * into t;
  if not found then
    raise exception 'Invite code is invalid or expired' using errcode = 'PT403';
  end if;

  -- 2. Rate limit per token.
  if (select count(*) from contrib.one_submissions
       where token = p_token and submitted_at > now() - interval '1 hour') >= t.hourly_limit then
    raise exception 'Too many submissions, try again later' using errcode = 'PT429';
  end if;

  -- 3. Required fields and bounds (Bidar).
  if coalesce(trim(p_author_name), '') = '' then
    raise exception 'Author name is required' using errcode = 'PT400';
  end if;
  g := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  if not ST_Within(g, ST_MakeEnvelope(76.7, 17.5, 77.8, 18.5, 4326)) then
    raise exception 'Feature is outside the mapping area' using errcode = 'PT400';
  end if;

  -- 4. Insert. Table constraints check geometry validity and type; the trigger forces 'pending'.
  insert into contrib.one_submissions
    (layer, geom, one_class, subtype, one_state, tags,
     local_name, notes, author_name, token, source)
  values
    (p_layer, g, p_one_class, p_subtype, p_one_state, coalesce(p_tags, '{}')::text,
     left(trim(p_local_name), 200), left(trim(p_notes), 1000), left(trim(p_author_name), 120),
     p_token, 'web_token')
  returning id into new_id;

  return json_build_object('id', new_id);
end $$;

revoke all on function api.submit from public;

-- Roles for PostgREST -----------------------------------------------------------
-- authenticator: the only login PostgREST uses; it switches to the role in the JWT.
create role authenticator login noinherit password :'auth_pw';
create role web_anon  nologin;   -- requests without a valid JWT: no rights at all
create role web_writer nologin;  -- requests signed with the dashboard's JWT
grant web_anon, web_writer to authenticator;

grant usage on schema api to web_writer;
grant execute on function api.submit(text, text, json, text, text, text, json, text, text, text) to web_writer;

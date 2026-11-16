#!/bin/bash
# Runs once, on first start of an empty data volume.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v rw="$GS_CONTRIB_RW_PASSWORD" -v ro="$GS_CONTRIB_RO_PASSWORD" -v rv="$REVIEWER_PASSWORD" <<'SQL'
create extension if not exists postgis;
create schema contrib;

create table contrib.one_submissions (
  id bigserial primary key,
  layer text not null check (layer in ('one_patches','one_lines','one_points')),
  geom geometry(Geometry,4326) not null,
  one_class text not null,
  subtype text,
  one_state text check (one_state in ('remnant','regenerating','degraded','transitional')),
  tags text not null,
  local_name text, notes text,
  author_name text not null,
  photo_url text,
  token text not null,
  source text not null default 'web_token',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by text, reviewed_at timestamptz, review_note text,
  constraint geom_valid check (ST_IsValid(geom)),
  constraint geom_type check (
    (layer='one_patches' and GeometryType(geom) in ('POLYGON','MULTIPOLYGON')) or
    (layer='one_lines'   and GeometryType(geom) in ('LINESTRING','MULTILINESTRING')) or
    (layer='one_points'  and GeometryType(geom)='POINT'))
);
create index on contrib.one_submissions using gist(geom);
create index on contrib.one_submissions(status);

create function contrib.force_pending() returns trigger language plpgsql as $$
begin
  if new.source='web_token' then
    new.status:='pending'; new.reviewed_by:=null; new.reviewed_at:=null; new.submitted_at:=now();
  end if;
  return new;
end $$;
create trigger t_force_pending before insert on contrib.one_submissions
  for each row execute function contrib.force_pending();

create view contrib.one_approved_patches as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiPolygon,4326) as geom
  from contrib.one_submissions where status='approved' and layer='one_patches';
create view contrib.one_approved_lines as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiLineString,4326) as geom
  from contrib.one_submissions where status='approved' and layer='one_lines';
create view contrib.one_approved_points as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         geom::geometry(Point,4326) as geom
  from contrib.one_submissions where status='approved' and layer='one_points';
create view contrib.one_pending_public as
  select id, layer, one_class, subtype, submitted_at, geom
  from contrib.one_submissions where status='pending';

create role gs_contrib_rw login password :'rw';
grant usage on schema contrib to gs_contrib_rw;
grant select, insert on contrib.one_submissions to gs_contrib_rw;
grant usage on sequence contrib.one_submissions_id_seq to gs_contrib_rw;

create role gs_contrib_ro login password :'ro';
grant usage on schema contrib to gs_contrib_ro;
grant select on contrib.one_approved_patches, contrib.one_approved_lines,
                contrib.one_approved_points, contrib.one_pending_public to gs_contrib_ro;

create role reviewer login password :'rv';
grant usage on schema contrib to reviewer;
grant select, update(status, reviewed_by, reviewed_at, review_note, one_class, subtype, one_state, geom)
  on contrib.one_submissions to reviewer;
grant delete on contrib.one_submissions to reviewer;
SQL
